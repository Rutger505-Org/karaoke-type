"""Audio: download, encode, hash, RMS helpers, clips."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 16000


def run(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed ({r.returncode}):\n{r.stderr[-2000:]}")
    return r.stdout


def youtube_id(url: str) -> str:
    return run(["yt-dlp", "--no-playlist", "--print", "id", url]).strip()


def download(url: str, dest_dir: Path) -> Path:
    """bestaudio into dest_dir/source.<ext>; reused if present."""
    existing = sorted(dest_dir.glob("source.*"))
    if existing:
        return existing[0]
    run(["yt-dlp", "--no-playlist", "-f", "bestaudio", "-o", str(dest_dir / "source.%(ext)s"), url])
    return sorted(dest_dir.glob("source.*"))[0]


def _loudnorm_params(src: Path) -> dict:
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af",
         "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    err = r.stderr
    return json.loads(err[err.rindex("{"): err.rindex("}") + 1])


def encode_delivery(src: Path, dest: Path) -> None:
    """Two-pass loudnorm -> AAC-LC 160k stereo 44.1k .m4a, faststart (Safari-safe, Range-friendly)."""
    p = _loudnorm_params(src)
    af = (
        "loudnorm=I=-16:TP=-1.5:LRA=11:"
        f"measured_I={p['input_i']}:measured_TP={p['input_tp']}:measured_LRA={p['input_lra']}:"
        f"measured_thresh={p['input_thresh']}:offset={p['target_offset']}:linear=true"
    )
    tmp = dest.with_suffix(".tmp.m4a")
    run(["ffmpeg", "-hide_banner", "-y", "-i", str(src), "-vn", "-map_metadata", "-1", "-af", af,
         "-ar", "44100", "-ac", "2", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(tmp)])
    tmp.replace(dest)


def to_wav16k(src: Path, dest: Path) -> None:
    run(["ffmpeg", "-hide_banner", "-y", "-i", str(src), "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", str(dest)])


def duration_ms(path: Path) -> int:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return round(float(out.strip()) * 1000)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_mono(path: Path) -> np.ndarray:
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    if sr != SR:
        raise ValueError(f"{path}: expected {SR} Hz, got {sr}")
    return data.mean(axis=1)


def rms_envelope(x: np.ndarray, hop_ms: int = 10) -> np.ndarray:
    hop = SR * hop_ms // 1000
    n = len(x) // hop
    frames = x[: n * hop].reshape(n, hop)
    return np.sqrt((frames**2).mean(axis=1) + 1e-12)


def clip(src: Path, dest: Path, start_ms: int, end_ms: int) -> None:
    start = max(0, start_ms) / 1000
    run(["ffmpeg", "-hide_banner", "-y", "-ss", f"{start:.3f}", "-t", f"{(end_ms - start_ms) / 1000:.3f}",
         "-i", str(src), "-ac", "2", "-c:a", "aac", "-b:a", "128k", str(dest)])
