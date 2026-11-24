"""LRCLIB fetch + parsing (plain LRC, enhanced LRC, LRCLIB lyricsfile YAML)."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

import yaml

USER_AGENT = "karaoke-type (https://github.com/Rutger505-Org/karaoke-type)"
LRCLIB_API = "https://lrclib.net/api"

_LINE_TAG = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")
_WORD_TAG = re.compile(r"<(\d+):(\d+(?:\.\d+)?)>")
_META_TAG = re.compile(r"^\[[a-zA-Z]+:.*\]$")


@dataclass
class LrcWord:
    text: str
    start_ms: int | None = None
    end_ms: int | None = None


@dataclass
class LrcLine:
    start_ms: int
    text: str
    end_ms: int | None = None
    words: list[LrcWord] = field(default_factory=list)


def _ms(m: str, s: str) -> int:
    return round((int(m) * 60 + float(s)) * 1000)


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", _WORD_TAG.sub("", text)).strip()


def parse_lrc(src: str) -> list[LrcLine]:
    """Parse (enhanced) LRC. Multiple leading tags repeat a line. Word stamps become word hints."""
    out: list[LrcLine] = []
    for raw in src.splitlines():
        raw = raw.strip()
        if not raw or _META_TAG.match(raw) and not _LINE_TAG.match(raw):
            continue
        stamps: list[int] = []
        pos = 0
        while m := _LINE_TAG.match(raw, pos):
            stamps.append(_ms(m.group(1), m.group(2)))
            pos = m.end()
        if not stamps:
            continue
        body = raw[pos:]
        text = clean_text(body)
        if not text:
            continue  # instrumental / empty
        words: list[LrcWord] = []
        if _WORD_TAG.search(body):
            # "<t>word <t>word": stamp precedes the word
            for m in re.finditer(r"<(\d+):(\d+(?:\.\d+)?)>([^<]*)", body):
                for i, w in enumerate(m.group(3).split()):
                    words.append(LrcWord(w, _ms(m.group(1), m.group(2)) if i == 0 else None))
        else:
            words = [LrcWord(w) for w in text.split()]
        for st in stamps:
            out.append(LrcLine(st, text, None, [LrcWord(w.text, w.start_ms) for w in words]))
    out.sort(key=lambda line: line.start_ms)
    return out


def parse_lyricsfile(src: str) -> list[LrcLine]:
    """LRCLIB 'lyricsfile' YAML: lines with start/end_ms and word timings."""
    doc = yaml.safe_load(src) or {}
    out: list[LrcLine] = []
    for ln in doc.get("lines") or []:
        text = clean_text(str(ln.get("text") or ""))
        if not text:
            continue
        words = [
            LrcWord(str(w["text"]).strip(), w.get("start_ms"), w.get("end_ms"))
            for w in ln.get("words") or []
            if str(w.get("text") or "").strip()
        ]
        if " ".join(w.text for w in words) != text:
            words = [LrcWord(w) for w in text.split()]
        out.append(LrcLine(int(ln["start_ms"]), text, ln.get("end_ms"), words))
    out.sort(key=lambda line: line.start_ms)
    return out


def lines_from_response(resp: dict) -> list[LrcLine]:
    """Best available timing: lyricsfile (word level) > syncedLyrics."""
    if resp.get("lyricsfile"):
        try:
            lines = parse_lyricsfile(resp["lyricsfile"])
            if lines:
                return lines
        except (yaml.YAMLError, KeyError, TypeError, ValueError):
            pass
    return parse_lrc(resp.get("syncedLyrics") or "")


def is_backing(text: str) -> bool:
    t = text.strip()
    return t.startswith("(") and t.endswith(")")


def drop_overlapping_backing(lines: list[LrcLine]) -> tuple[list[LrcLine], list[LrcLine]]:
    """Fully parenthesized lines (backing vocals) that overlap a lead line are dropped:
    the game needs non-overlapping lines."""
    keep: list[LrcLine] = []
    dropped: list[LrcLine] = []
    for i, ln in enumerate(lines):
        if is_backing(ln.text):
            nxt = lines[i + 1].start_ms if i + 1 < len(lines) else None
            prv_end = lines[i - 1].end_ms if i > 0 else None
            if (nxt is not None and nxt - ln.start_ms < 1500) or (
                prv_end is not None and prv_end > ln.start_ms + 500
            ):
                dropped.append(ln)
                continue
        keep.append(ln)
    return keep, dropped


def fetch(artist: str, title: str, duration_s: float | None = None, track_id: int | None = None) -> dict:
    if track_id is not None:
        url = f"{LRCLIB_API}/get/{track_id}"
    else:
        q = {"artist_name": artist, "track_name": title}
        if duration_s is not None:
            q["duration"] = str(round(duration_s))
        url = f"{LRCLIB_API}/get?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)
