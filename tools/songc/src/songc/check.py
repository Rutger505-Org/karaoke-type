"""`songc check`: terse per-line report for agents that can't listen."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from songc import song

LOW_CONF = 0.85  # aligned lines need >= 0.7 word agreement; flag the marginal ones
BIG_DELTA_MS = 700
GAP_MS = 10000
MIN_LINE_MS = 1200
SILENT_FRAC = 0.3


def _fmt(ms: int | None) -> str:
    if ms is None:
        return "-"
    sign = "-" if ms < 0 else ""
    ms = abs(ms)
    return f"{sign}{ms // 60000}:{ms % 60000 / 1000:06.3f}"


def lrclib_refs(s: dict, meta: dict) -> list[int | None]:
    """Offset-corrected LRCLIB start per song line, matched by text + occurrence number."""
    off = meta.get("lrclibOffsetMs")
    if off is None:
        return [None] * len(s["lines"])
    pool: dict[str, list[int]] = {}
    for ln in meta.get("lrclibLines", []):
        pool.setdefault(" ".join(ln["text"].lower().split()), []).append(ln["startMs"] + off)
    seen: dict[str, int] = {}
    out: list[int | None] = []
    for ln in s["lines"]:
        k = " ".join(ln["text"].lower().split())
        n = seen.get(k, 0)
        seen[k] = n + 1
        refs = pool.get(k, [])
        out.append(refs[n] if n < len(refs) else None)
    return out


def vocal_activity(vocals: Path, spans: list[tuple[int, int]]) -> list[float] | None:
    """Fraction of 10ms frames inside each span where the vocal stem is clearly above its floor."""
    if not vocals.exists():
        return None
    from songc.audio import load_mono, rms_envelope

    env = rms_envelope(load_mono(vocals))
    floor, loud = np.percentile(env, 20), np.percentile(env, 95)
    thr = floor * (loud / max(floor, 1e-9)) ** 0.3
    out = []
    for s, e in spans:
        seg = env[max(0, s // 10): max(0, e // 10)]
        out.append(float((seg > thr).mean()) if len(seg) else 0.0)
    return out


def line_flags(s: dict, refs: list[int | None], act: list[float] | None) -> list[list[str]]:
    off = s.get("offsetMs", 0)
    lines = s["lines"]
    flags: list[list[str]] = []
    for i, ln in enumerate(lines):
        f = []
        if ln["origin"] == "lrclib":
            f.append("fallback")
        elif ln["origin"] == "aligned" and ln["confidence"] < LOW_CONF:
            f.append("lowconf")
        if i + 1 < len(lines) and ln["endMs"] > lines[i + 1]["startMs"]:
            f.append("overlap")
        if i and ln["startMs"] - lines[i - 1]["endMs"] > GAP_MS:
            f.append("gap>10s")
        if ln["endMs"] - ln["startMs"] < MIN_LINE_MS:
            f.append("short")
        if refs[i] is not None and abs(ln["startMs"] + off - refs[i]) > BIG_DELTA_MS:
            f.append("delta")
        if act is not None and act[i] < SILENT_FRAC:
            f.append("silent")
        durs = [w["endMs"] - w["startMs"] for w in ln["words"]]
        if min(durs) < song.MIN_WORD_MS // 2:
            f.append("word<40ms")
        if max(durs) > song.MAX_WORD_MS:
            f.append("word>3s")
        flags.append(f)
    return flags


def check_report(s: dict, meta: dict, vocals: Path, show_all: bool = False) -> str:
    off = s.get("offsetMs", 0)
    lines = s["lines"]
    refs = lrclib_refs(s, meta)
    act = vocal_activity(vocals, [(ln["startMs"] + off, ln["endMs"] + off) for ln in lines])
    flags = line_flags(s, refs, act)
    deltas = [ln["startMs"] + off - r for ln, r in zip(lines, refs) if r is not None]
    wd = [w["endMs"] - w["startMs"] for ln in lines for w in ln["words"]]
    origins = {o: sum(ln["origin"] == o for ln in lines) for o in ("aligned", "lrclib", "manual")}
    counts: dict[str, int] = {}
    for f in flags:
        for x in f:
            counts[x] = counts.get(x, 0) + 1

    out = [
        f"{s['slug']}: {len(lines)} lines, dur {_fmt(s['durationMs'])}, offsetMs {off}, "
        f"lrclibOffsetMs {meta.get('lrclibOffsetMs', '?')} (coarse {meta.get('lrclibCoarseOffsetMs', '?')})",
        "origin " + " ".join(f"{k}={v}" for k, v in origins.items())
        + f" locked={sum(bool(ln.get('locked')) for ln in lines)}",
    ]
    if deltas:
        ad = np.abs(deltas)
        out.append(f"delta vs lrclib ms: median {int(np.median(deltas))} |p90| {int(np.percentile(ad, 90))} max {int(ad.max())}")
    out.append(f"word ms: min {min(wd)} median {int(np.median(wd))} max {max(wd)}")
    if act is None:
        out.append("vocal activity: n/a (no vocals stem in cache)")
    out.append("flags: " + (", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "none"))
    if meta.get("droppedBacking"):
        out.append(f"dropped overlapping backing lines: {len(meta['droppedBacking'])}")
    if meta.get("orphanLocked"):
        out.append(f"locked lines without LRCLIB match (kept): {meta['orphanLocked']}")
    out.append("idx start end lrclib delta conf origin lock voc flags | text")
    for i, ln in enumerate(lines):
        if not show_all and not flags[i]:
            continue
        r = refs[i]
        d = ln["startMs"] + off - r if r is not None else None
        out.append(
            f"{i:>3} {_fmt(ln['startMs'] + off)} {_fmt(ln['endMs'] + off)} {_fmt(r)} "
            f"{'-' if d is None else f'{d:+d}'} {ln['confidence']:.2f} {ln['origin']} "
            f"{'L' if ln.get('locked') else '-'} {'-' if act is None else f'{act[i]:.2f}'} "
            f"{','.join(flags[i]) or '-'} | {ln['text']}"
        )
    return "\n".join(out) + "\n"
