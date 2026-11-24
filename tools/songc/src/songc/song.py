"""Pure song logic: offset estimation, line building, locked merge, nudge, validation."""

from __future__ import annotations

import copy
from statistics import median

import numpy as np

from songc.lrc import LrcLine

MIN_WORD_MS = 80
MAX_WORD_MS = 3000
WORD_GAP_FILL_MS = 300  # gaps smaller than this are closed (continuous highlight)
LINE_GAP_MS = 50  # minimum gap kept between consecutive lines


# ---------- global offset ----------

def expected_activity(lines: list[LrcLine], n_frames: int, hop_ms: int = 10) -> np.ndarray:
    """0/1 vector of where LRCLIB says someone sings (word spans if known, else line start..+4s)."""
    act = np.zeros(n_frames, dtype=np.float32)
    for i, ln in enumerate(lines):
        spans = [(w.start_ms, w.end_ms) for w in ln.words if w.start_ms is not None and w.end_ms is not None]
        if not spans:
            nxt = lines[i + 1].start_ms if i + 1 < len(lines) else ln.start_ms + 4000
            spans = [(ln.start_ms, min(nxt, ln.start_ms + 4000))]
        for s, e in spans:
            act[max(0, s // hop_ms): max(0, e // hop_ms)] = 1
    return act


def xcorr_offset(vocal_env: np.ndarray, expected: np.ndarray, max_lag_ms: int = 30000, hop_ms: int = 10) -> int:
    """Lag (ms) maximizing correlation of vocal energy with expected activity.
    Positive = audio is later than LRCLIB."""
    n = min(len(vocal_env), len(expected))
    v = np.log(vocal_env[:n] + 1e-4)
    v = (v - v.mean()) / (v.std() + 1e-9)
    e = (expected[:n] - expected[:n].mean()) / (expected[:n].std() + 1e-9)
    size = 1 << int(np.ceil(np.log2(2 * n)))
    corr = np.fft.irfft(np.fft.rfft(v, size) * np.conj(np.fft.rfft(e, size)), size)
    max_lag = max_lag_ms // hop_ms
    lags = np.concatenate([np.arange(0, max_lag + 1), np.arange(-max_lag, 0)])
    vals = np.concatenate([corr[: max_lag + 1], corr[size - max_lag:]])
    return int(lags[int(np.argmax(vals))] * hop_ms)


def refine_offset(coarse_ms: int, deltas: list[int]) -> int:
    """deltas: aligned start - (lrclib start + coarse) for confident lines."""
    if len(deltas) < 3:
        return coarse_ms
    return coarse_ms + round(median(deltas))


# ---------- line building ----------

def fallback_words(ln: LrcLine, offset_ms: int, end_ms: int) -> list[dict]:
    """Words from LRCLIB word hints (offset-corrected) or spread by character count."""
    if ln.words and all(w.start_ms is not None and w.end_ms is not None for w in ln.words):
        return [
            {"text": w.text, "startMs": w.start_ms + offset_ms, "endMs": w.end_ms + offset_ms, "score": 0.0}
            for w in ln.words
        ]
    start = ln.start_ms + offset_ms
    texts = [w.text for w in ln.words] or ln.text.split()
    total = sum(len(t) + 1 for t in texts)
    span = max(end_ms - start, 200 * len(texts))
    out, t = [], start
    for txt in texts:
        d = span * (len(txt) + 1) / total
        out.append({"text": txt, "startMs": round(t), "endMs": round(t + d), "score": 0.0})
        t += d
    return out


def finish_words(words: list[dict], hard_end_ms: int | None, hint_end_ms: int | None) -> list[dict]:
    """Close small gaps, enforce min/max word duration; last word may stretch to the LRCLIB end hint."""
    ws = [dict(w) for w in words]
    for i, w in enumerate(ws):
        nxt = ws[i + 1]["startMs"] if i + 1 < len(ws) else None
        if nxt is not None and 0 <= nxt - w["endMs"] < WORD_GAP_FILL_MS:
            w["endMs"] = nxt
        if i == len(ws) - 1 and hint_end_ms is not None and hint_end_ms > w["endMs"]:
            w["endMs"] = min(hint_end_ms, w["startMs"] + MAX_WORD_MS)
        if w["endMs"] - w["startMs"] < MIN_WORD_MS:
            limit = nxt if nxt is not None else hard_end_ms
            w["endMs"] = w["startMs"] + MIN_WORD_MS if limit is None else min(w["startMs"] + MIN_WORD_MS, max(limit, w["endMs"]))
        w["endMs"] = min(w["endMs"], w["startMs"] + MAX_WORD_MS)
        if hard_end_ms is not None:
            w["endMs"] = min(w["endMs"], hard_end_ms)
    return ws


def make_line(text: str, words: list[dict], origin: str, confidence: float) -> dict:
    return {
        "startMs": words[0]["startMs"],
        "endMs": words[-1]["endMs"],
        "text": text,
        "origin": origin,
        "confidence": round(confidence, 3),
        "locked": False,
        "words": words,
    }


def fix_overlaps(lines: list[dict]) -> list[dict]:
    """Sort; clip a line's end (and its words) to just before the next line. Locked lines win."""
    lines = sorted(lines, key=lambda line: line["startMs"])
    for i in range(len(lines) - 1):
        cur, nxt = lines[i], lines[i + 1]
        limit = nxt["startMs"] - LINE_GAP_MS
        if cur["endMs"] > limit:
            if cur.get("locked") and not nxt.get("locked"):
                shift_start(nxt, cur["endMs"] + LINE_GAP_MS)
                continue
            clip_end(cur, max(limit, cur["startMs"] + MIN_WORD_MS))
    return lines


def clip_end(line: dict, end: int) -> None:
    line["endMs"] = end
    for w in line["words"]:
        w["endMs"] = min(w["endMs"], end)
        w["startMs"] = min(w["startMs"], max(line["startMs"], end - MIN_WORD_MS // 2))


def shift_start(line: dict, start: int) -> None:
    line["startMs"] = start
    for w in line["words"]:
        w["startMs"] = max(w["startMs"], start)
        w["endMs"] = max(w["endMs"], w["startMs"] + MIN_WORD_MS // 2)
    line["endMs"] = max(line["endMs"], line["words"][-1]["endMs"])


def overlaps(lines: list[dict]) -> list[int]:
    return [i for i in range(len(lines) - 1) if lines[i]["endMs"] > lines[i + 1]["startMs"]]


# ---------- locked preservation ----------

def _occurrences(lines: list[dict]) -> list[tuple[str, int]]:
    seen: dict[str, int] = {}
    keys = []
    for ln in lines:
        t = " ".join(ln["text"].lower().split())
        seen[t] = seen.get(t, 0) + 1
        keys.append((t, seen[t]))
    return keys


def merge_locked(new_lines: list[dict], old_lines: list[dict]) -> tuple[list[dict], list[dict]]:
    """Replace new lines by old locked lines with the same text + occurrence number.
    Locked lines without a match are kept too (returned as orphans for the report)."""
    old_keys = _occurrences(old_lines)
    locked = {k: ln for k, ln in zip(old_keys, old_lines) if ln.get("locked")}
    out, used = [], set()
    for k, ln in zip(_occurrences(new_lines), new_lines):
        if k in locked:
            out.append(copy.deepcopy(locked[k]))
            used.add(k)
        else:
            out.append(ln)
    orphans = [copy.deepcopy(ln) for k, ln in locked.items() if k not in used]
    return fix_overlaps(out + orphans), orphans


# ---------- nudge ----------

class NudgeError(ValueError):
    pass


def nudge(song: dict, idxs: list[int], ms: int = 0, set_start: int | None = None,
          set_end: int | None = None) -> dict:
    """Shift lines (+words) by ms, or move the first word start / last word end to an absolute
    time (effective time, i.e. incl. offsetMs). Marks lines manual + locked. Rejects overlaps."""
    song = copy.deepcopy(song)
    lines = song["lines"]
    off = song.get("offsetMs", 0)
    for i in idxs:
        if not 0 <= i < len(lines):
            raise NudgeError(f"line {i} out of range 0..{len(lines) - 1}")
        ln = lines[i]
        if ms:
            ln["startMs"] += ms
            ln["endMs"] += ms
            for w in ln["words"]:
                w["startMs"] += ms
                w["endMs"] += ms
        if set_start is not None:
            s = set_start - off
            if s >= ln["words"][0]["endMs"]:
                raise NudgeError(f"line {i}: start {set_start} not before first word end; use --ms")
            ln["startMs"] = ln["words"][0]["startMs"] = s
        if set_end is not None:
            e = set_end - off
            if e <= ln["words"][-1]["startMs"]:
                raise NudgeError(f"line {i}: end {set_end} not after last word start; use --ms")
            ln["endMs"] = ln["words"][-1]["endMs"] = e
        ln["origin"] = "manual"
        ln["locked"] = True
    validate(song)
    return song


def nudge_all(song: dict, ms: int) -> dict:
    """Global shift: only offsetMs changes; nothing gets locked."""
    song = copy.deepcopy(song)
    song["offsetMs"] = song.get("offsetMs", 0) + ms
    validate(song)
    return song


def validate(song: dict) -> None:
    lines = song["lines"]
    off = song.get("offsetMs", 0)
    for i, ln in enumerate(lines):
        if ln["startMs"] + off < 0:
            raise NudgeError(f"line {i} starts before 0")
        if ln["endMs"] <= ln["startMs"]:
            raise NudgeError(f"line {i} has end <= start")
    bad = overlaps(lines)
    if bad:
        raise NudgeError("overlap between lines " + ", ".join(f"{i}/{i + 1}" for i in bad))
