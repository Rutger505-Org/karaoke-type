"""songc CLI: compile | check | nudge | clip | publish."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from songc import __version__, audio, lrc, song
from songc.check import check_report
from songc.text import normalize_word

# CTC probabilities on singing are low (~0.1-0.5) even when timing is right, so confidence = timing agreement:
# fraction of aligned words within WORD_TOL_MS of the offset-corrected LRCLIB word (or line start if no word stamps).
CONF_THRESHOLD = 0.7  # agreement below this -> LRCLIB fallback
MAX_DELTA_MS = 700  # aligned line start further than this from offset-corrected LRCLIB -> fallback
WORD_TOL_MS = 400
WINDOW_MS = 2000  # align window margin before the LRCLIB line (and after the last line)
WINDOW_END_MS = 800  # margin after the next line start: wider windows let '*' swap chorus repeats


# ---------- paths ----------

def repo_root() -> Path:
    for p in [Path.cwd(), *Path.cwd().parents]:
        if (p / "tools/songc/pyproject.toml").exists():
            return p
    return Path(__file__).resolve().parents[4]


def data_dir() -> Path:
    env = os.environ.get("SONGC_DATA_DIR")
    d = Path(env).expanduser() if env else repo_root().parent / "karaoke-type-songs"
    if not d.is_dir():
        sys.exit(f"data dir {d} not found (set SONGC_DATA_DIR)")
    return d.resolve()


def cache_dir(slug: str) -> Path:
    d = Path(os.environ.get("SONGC_CACHE_DIR", "~/.cache/songc")).expanduser() / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def song_dir(slug: str) -> Path:
    return data_dir() / "songs" / slug


def load_json(p: Path) -> dict | None:
    return json.loads(p.read_text()) if p.exists() else None


def write_json(p: Path, obj: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


# ---------- heavy steps via buildq ----------

def heavy(*args: str) -> None:
    cmd = [sys.executable, "-m", "songc.heavy", *args]
    if shutil.which("buildq") and not os.environ.get("SONGC_NO_BUILDQ"):
        cmd = ["buildq", "run", "--what", f"songc {args[0]}", "--wait", os.environ.get("BUILDQ_WAIT", "7200"), "--", *cmd]
    print("+ " + " ".join(cmd), file=sys.stderr, flush=True)
    subprocess.run(cmd, check=True)


# ---------- compile ----------

def align_windows(lines: list[lrc.LrcLine], off: int, margin: int) -> list[dict]:
    jobs = []
    for i, ln in enumerate(lines):
        s = ln.start_ms + off
        prev_s = lines[i - 1].start_ms + off if i else None
        nxt_s = lines[i + 1].start_ms + off if i + 1 < len(lines) else None
        end_hint = max(ln.end_ms + off if ln.end_ms else s, nxt_s if nxt_s is not None else s + 6000)
        ws = s - margin if prev_s is None else max(s - margin, prev_s + 300)
        we = end_hint + (margin if nxt_s is None else min(margin, WINDOW_END_MS))
        if i + 2 < len(lines):
            we = min(we, lines[i + 2].start_ms + off)
        jobs.append({"idx": i, "winStartMs": max(0, ws), "winEndMs": we,
                     "words": [normalize_word(w.text) for w in ln.words]})
    return jobs


def agreement(ln: lrc.LrcLine, words: list[dict], off: int) -> float:
    """Fraction of aligned words (score > 0) whose start matches offset-corrected LRCLIB timing."""
    stamped = all(w.start_ms is not None for w in ln.words)
    pairs = [(w, lw) for w, lw in zip(words, ln.words) if w["score"] > 0]
    if not pairs:
        return 0.0
    if not stamped:  # line-level LRC only: first word start + monotonic words
        mono = all(a["startMs"] <= b["startMs"] for a, b in zip(words, words[1:]))
        return 1.0 if mono and abs(words[0]["startMs"] - (ln.start_ms + off)) <= WORD_TOL_MS else 0.0
    ok = sum(abs(w["startMs"] - (lw.start_ms + off)) <= WORD_TOL_MS for w, lw in pairs)
    return ok / len(pairs)


def build_aligned_words(ln: lrc.LrcLine, res: list[dict | None]) -> list[dict] | None:
    """Aligner output -> words (unalignable words get interpolated, score 0)."""
    got = [r for r in res if r]
    if not got:
        return None
    words = []
    for i, (w, r) in enumerate(zip(ln.words, res)):
        if r:
            words.append({"text": w.text, "startMs": r["startMs"], "endMs": r["endMs"], "score": r["score"]})
        else:
            prev_end = words[-1]["endMs"] if words else None
            nxt = next((x for x in res[i + 1:] if x), None)
            s = prev_end if prev_end is not None else (nxt["startMs"] - song.MIN_WORD_MS)
            words.append({"text": w.text, "startMs": s, "endMs": s + song.MIN_WORD_MS, "score": 0.0})
    return words


def cmd_compile(a: argparse.Namespace) -> None:
    slug = a.slug
    sd, cd = song_dir(slug), cache_dir(slug)
    old = load_json(sd / "song.json")
    meta_old = load_json(sd / "compile.json") or {}
    url = a.youtube or meta_old.get("youtubeUrl")
    artist = a.artist or (old or {}).get("artist")
    title = a.title or (old or {}).get("title")
    if not (url and artist and title):
        sys.exit("first compile needs --youtube, --artist and --title")

    print("[1/6] audio", file=sys.stderr)
    yt_id = audio.youtube_id(url)
    src = audio.download(url, cd)
    m4a = cd / "audio.m4a"
    if not m4a.exists() or a.reencode:
        audio.encode_delivery(src, m4a)
    mix16 = cd / "mix16k.wav"
    if not mix16.exists() or a.reencode:
        audio.to_wav16k(m4a, mix16)  # analysis from the delivery file itself -> same timeline
    dur = audio.duration_ms(m4a)
    sha = audio.sha256(m4a)

    print("[2/6] lrclib", file=sys.stderr)
    resp = lrc.fetch(a.lrclib_artist or artist, a.lrclib_track or title, dur / 1000, a.lrclib_id)
    write_json(sd / "lrclib.json", resp)
    all_lines = lrc.lines_from_response(resp)
    lines, dropped = lrc.drop_overlapping_backing(all_lines)
    if not lines:
        sys.exit("LRCLIB has no synced lyrics for this track")

    print("[3/6] vocals (demucs)", file=sys.stderr)
    voc16 = cd / "vocals16k.wav"
    if not voc16.exists() or a.reencode:
        heavy("separate", str(m4a), str(voc16))

    print("[4/6] global offset", file=sys.stderr)
    env = audio.rms_envelope(audio.load_mono(voc16))
    coarse = song.xcorr_offset(env, song.expected_activity(lines, len(env)))

    print("[5/6] align (MMS_FA)", file=sys.stderr)
    job = {"audio": str(voc16), "lines": align_windows(lines, coarse, a.window_ms)}
    with tempfile.TemporaryDirectory(prefix="songc-") as tmp:
        jp, op = Path(tmp) / "job.json", Path(tmp) / "out.json"
        jp.write_text(json.dumps(job))
        heavy("align", str(jp), str(op))
        aligned = json.loads(op.read_text())
    results = {r["idx"]: r["words"] for r in aligned["lines"]}

    built = [build_aligned_words(ln, results.get(i, [])) for i, ln in enumerate(lines)]
    # robust: median over all plausible lines (misaligned ones are outliers)
    deltas = [w[0]["startMs"] - (ln.start_ms + coarse) for ln, w in zip(lines, built)
              if w and abs(w[0]["startMs"] - (ln.start_ms + coarse)) <= MAX_DELTA_MS]
    off = song.refine_offset(coarse, deltas)

    print("[6/6] build", file=sys.stderr)
    new_lines = []
    for i, (ln, words) in enumerate(zip(lines, built)):
        conf = agreement(ln, words, off) if words else 0.0
        ref = ln.start_ms + off
        nxt_ref = lines[i + 1].start_ms + off if i + 1 < len(lines) else dur
        hint_end = ln.end_ms + off if ln.end_ms else None
        if words and conf >= CONF_THRESHOLD and abs(words[0]["startMs"] - ref) <= MAX_DELTA_MS:
            ws = song.finish_words(words, None, hint_end)
            new_lines.append(song.make_line(ln.text, ws, "aligned", conf))
        else:
            ws = song.finish_words(song.fallback_words(ln, off, hint_end or nxt_ref), None, None)
            new_lines.append(song.make_line(ln.text, ws, "lrclib", conf))
    new_lines = song.fix_overlaps(new_lines)
    orphans: list[dict] = []
    if old and not a.force:
        new_lines, orphans = song.merge_locked(new_lines, old.get("lines", []))

    out = {
        "schema": 1,
        "slug": slug,
        "title": title,
        "artist": artist,
        "durationMs": dur,
        "source": {"youtubeId": yt_id, "lrclibId": resp.get("id")},
        "audio": {"key": f"audio/{slug}/{sha[:12]}.m4a", "sha256": sha, "durationMs": dur},
        "offsetMs": (old or {}).get("offsetMs", 0) if not a.force else 0,
        "compiledAt": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "compiler": f"songc {__version__}",
        "lines": new_lines,
    }
    if old and old.get("audio", {}).get("url") and old["audio"].get("sha256") == sha:
        out["audio"]["url"] = old["audio"]["url"]
    song.validate(out)
    meta = {
        "youtubeUrl": url,
        "lrclibOffsetMs": off,
        "lrclibCoarseOffsetMs": coarse,
        "aligner": f"torchaudio MMS_FA {aligned.get('torchaudio')}",
        "params": {"confThreshold": CONF_THRESHOLD, "maxDeltaMs": MAX_DELTA_MS, "wordTolMs": WORD_TOL_MS,
                   "windowMs": a.window_ms, "windowEndMs": WINDOW_END_MS},
        "lrclibLines": [{"text": ln.text, "startMs": ln.start_ms} for ln in lines],
        "droppedBacking": [{"text": ln.text, "startMs": ln.start_ms} for ln in dropped],
        "orphanLocked": [ln["text"] for ln in orphans],
    }
    write_json(sd / "song.json", out)
    write_json(sd / "compile.json", meta)
    report = check_report(out, meta, voc16, show_all=True)
    (sd / "report.txt").write_text(report)
    print(check_report(out, meta, voc16, show_all=False))


# ---------- check / nudge / clip ----------

def _load(slug: str) -> tuple[dict, dict]:
    sd = song_dir(slug)
    s = load_json(sd / "song.json")
    if not s:
        sys.exit(f"{sd / 'song.json'} not found; compile first")
    return s, load_json(sd / "compile.json") or {}


def cmd_check(a: argparse.Namespace) -> None:
    s, meta = _load(a.slug)
    print(check_report(s, meta, cache_dir(a.slug) / "vocals16k.wav", show_all=a.all))


def cmd_nudge(a: argparse.Namespace) -> None:
    s, meta = _load(a.slug)
    try:
        if a.all:
            if a.set_start is not None or a.set_end is not None:
                sys.exit("--all only supports --ms")
            s = song.nudge_all(s, a.ms)
        else:
            idxs = [a.line] if a.line is not None else list(range(a.from_, a.to + 1))
            if (a.set_start is not None or a.set_end is not None) and len(idxs) != 1:
                sys.exit("--set-start/--set-end need --line")
            s = song.nudge(s, idxs, a.ms, a.set_start, a.set_end)
    except song.NudgeError as e:
        sys.exit(f"rejected: {e}")
    write_json(song_dir(a.slug) / "song.json", s)
    print(check_report(s, meta, cache_dir(a.slug) / "vocals16k.wav", show_all=False))


def cmd_clip(a: argparse.Namespace) -> None:
    s, _ = _load(a.slug)
    ln = s["lines"][a.line]
    off = s.get("offsetMs", 0)
    src = cache_dir(a.slug) / ("vocals16k.wav" if a.stem == "vocals" else "audio.m4a")
    if not src.exists():
        sys.exit(f"{src} missing; recompile")
    start = max(0, ln["startMs"] + off - a.pad_ms)
    dest = Path(f"/tmp/{a.slug}-{a.line}.m4a")
    audio.clip(src, dest, start, ln["endMs"] + off + a.pad_ms)
    print(f"{dest}  (clip starts at {start} ms; line {ln['startMs'] + off}-{ln['endMs'] + off}: {ln['text']})")


# ---------- publish ----------

CDN_ALIAS = os.environ.get("SONGC_MCLI_TARGET", "rcdn/karaoke")
CDN_BASE = os.environ.get("SONGC_CDN_BASE", "https://cdn.rutgerpronk.com/karaoke")
JSON_ATTR = "Content-Type=application/json;Cache-Control=public, max-age=60"
AUDIO_ATTR = "Content-Type=audio/mp4;Cache-Control=public, max-age=31536000, immutable"


def mcli(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["mcli", *args], capture_output=True, text=True, check=check)


def upload(path: Path, key: str, attr: str) -> None:
    r = mcli("cp", "--quiet", "--attr", attr, str(path), f"{CDN_ALIAS}/{key}", check=False)
    if r.returncode:
        sys.exit(f"upload {key} failed: {r.stderr or r.stdout}")


def cmd_publish(a: argparse.Namespace) -> None:
    s, _ = _load(a.slug)
    m4a = cache_dir(a.slug) / "audio.m4a"
    if not m4a.exists() or audio.sha256(m4a) != s["audio"]["sha256"]:
        sys.exit("cached audio missing or hash differs from song.json; recompile")
    key = s["audio"]["key"]
    if mcli("stat", f"{CDN_ALIAS}/{key}", check=False).returncode == 0:
        print(f"audio exists: {key}")
    else:
        upload(m4a, key, AUDIO_ATTR)
        print(f"uploaded {key}")
    s["audio"]["url"] = f"{CDN_BASE}/{key}"
    song.validate(s)
    write_json(song_dir(a.slug) / "song.json", s)  # data repo records what is live
    with tempfile.TemporaryDirectory(prefix="songc-pub-") as tmp:
        p = Path(tmp) / "song.json"
        p.write_text(json.dumps(s, ensure_ascii=False, separators=(",", ":")))
        upload(p, f"songs/{a.slug}.json", JSON_ATTR)
        print(f"uploaded songs/{a.slug}.json")
        idx = build_index()
        ip = Path(tmp) / "index.json"
        ip.write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")))
        upload(ip, "index.json", JSON_ATTR)
        print(f"uploaded index.json ({len(idx['songs'])} songs)")
    verify(s)


def build_index() -> dict:
    songs = []
    for p in sorted((data_dir() / "songs").glob("*/song.json")):
        s = json.loads(p.read_text())
        if s.get("audio", {}).get("url"):  # published only
            songs.append({"slug": s["slug"], "title": s["title"], "artist": s["artist"],
                          "durationMs": s["durationMs"], "url": f"songs/{s['slug']}.json"})
    songs.sort(key=lambda x: (x["artist"].lower(), x["title"].lower()))
    return {"schema": 1, "songs": songs}


def _curl_status(url: str, *extra: str) -> str:
    r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{content_type}", *extra, url],
                       capture_output=True, text=True)
    return r.stdout


def verify(s: dict) -> None:
    checks = [
        (s["audio"]["url"], ["-r", "0-1023"], "206"),
        (s["audio"]["url"], [], "200"),
        (f"{CDN_BASE}/songs/{s['slug']}.json", [], "200"),
        (f"{CDN_BASE}/index.json", [], "200"),
    ]
    bad = False
    for url, extra, want in checks:
        got = _curl_status(url, *extra)
        ok = got.startswith(want)
        bad |= not ok
        print(f"{'ok ' if ok else 'BAD'} {got} {' '.join(extra)} {url}")
    if bad:
        sys.exit("verification failed")


# ---------- main ----------

def main() -> None:
    p = argparse.ArgumentParser(prog="songc", description="KaraokeType song compiler")
    p.add_argument("--version", action="version", version=f"songc {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("compile", help="download, align, write song.json + report.txt")
    c.add_argument("slug")
    c.add_argument("--youtube", help="YouTube URL (remembered in compile.json)")
    c.add_argument("--artist")
    c.add_argument("--title")
    c.add_argument("--lrclib-artist", help="artist name for the LRCLIB lookup")
    c.add_argument("--lrclib-track", help="track name for the LRCLIB lookup")
    c.add_argument("--lrclib-id", type=int, help="exact LRCLIB record id")
    c.add_argument("--window-ms", type=int, default=WINDOW_MS)
    c.add_argument("--force", action="store_true", help="drop locked lines + offsetMs")
    c.add_argument("--reencode", action="store_true", help="redo audio encode + demucs")
    c.set_defaults(fn=cmd_compile)

    c = sub.add_parser("check", help="text report for agents (flagged lines + summary)")
    c.add_argument("slug")
    c.add_argument("--all", action="store_true", help="all lines")
    c.set_defaults(fn=cmd_check)

    c = sub.add_parser("nudge", help="shift lines (locks them) or the global offset (--all)")
    c.add_argument("slug")
    g = c.add_mutually_exclusive_group(required=True)
    g.add_argument("--line", type=int)
    g.add_argument("--from", dest="from_", type=int)
    g.add_argument("--all", action="store_true")
    c.add_argument("--to", type=int)
    c.add_argument("--ms", type=int, default=0)
    c.add_argument("--set-start", type=int, help="effective ms of the line start (first word start)")
    c.add_argument("--set-end", type=int, help="effective ms of the line end (last word end)")
    c.set_defaults(fn=cmd_nudge)

    c = sub.add_parser("clip", help="write /tmp/<slug>-<N>.m4a around a line")
    c.add_argument("slug")
    c.add_argument("--line", type=int, required=True)
    c.add_argument("--stem", choices=["vocals", "mix"], default="mix")
    c.add_argument("--pad-ms", type=int, default=1000)
    c.set_defaults(fn=cmd_clip)

    c = sub.add_parser("publish", help="upload audio + song json, rebuild index.json, verify")
    c.add_argument("slug")
    c.set_defaults(fn=cmd_publish)

    a = p.parse_args()
    if a.cmd == "nudge" and a.from_ is not None and a.to is None:
        p.error("--from needs --to")
    if a.cmd == "nudge" and not a.ms and a.set_start is None and a.set_end is None:
        p.error("nothing to do: give --ms, --set-start or --set-end")
    a.fn(a)
