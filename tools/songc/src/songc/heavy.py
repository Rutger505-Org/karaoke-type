"""Heavy steps (run under buildq): demucs separation + MMS_FA forced alignment.

Invoked as `python -m songc.heavy separate|align ...` so the parent can wrap it in buildq.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


def separate(src: Path, vocals_out: Path, segment: int = 7) -> None:
    """htdemucs two-stems vocals on CPU -> 16 kHz mono wav (big 44.1k stems are deleted)."""
    with tempfile.TemporaryDirectory(prefix="songc-demucs-", dir=vocals_out.parent) as tmp:
        subprocess.run(
            [sys.executable, "-m", "demucs", "-n", "htdemucs", "--two-stems", "vocals", "-d", "cpu",
             "--segment", str(segment), "-j", "1", "-o", tmp, str(src)],
            check=True,
        )
        stem = next(Path(tmp).rglob("vocals.wav"))
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(stem), "-ac", "1", "-ar", "16000",
             "-c:a", "pcm_s16le", str(vocals_out)],
            check=True,
        )


def align(job_path: Path, out_path: Path) -> None:
    """job: {"audio": wav16k, "lines": [{"idx", "winStartMs", "winEndMs", "words": [norm,...]}]}
    out: {"lines": [{"idx", "words": [{"startMs","endMs","score"}|null per input word]}]}"""
    import torch
    import torchaudio
    from torchaudio.pipelines import MMS_FA as bundle

    from songc.audio import load_mono

    torch.set_num_threads(4)
    job = json.loads(job_path.read_text())
    wav = torch.from_numpy(load_mono(Path(job["audio"])))
    sr = bundle.sample_rate
    model = bundle.get_model(with_star=True)
    model.eval()
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()

    out = []
    for ln in job["lines"]:
        a = max(0, ln["winStartMs"] * sr // 1000)
        b = min(len(wav), ln["winEndMs"] * sr // 1000)
        words = ln["words"]
        real = [i for i, w in enumerate(words) if w]
        res: list[dict | None] = [None] * len(words)
        if b - a < sr // 2 or not real:
            out.append({"idx": ln["idx"], "words": res})
            continue
        seg = wav[a:b].unsqueeze(0)
        with torch.inference_mode():
            emission, _ = model(seg)
        ratio = (b - a) / emission.size(1) / sr  # seconds per frame
        # '*' on both sides absorbs neighbouring lines / backing vocals inside the window
        transcript = ["*"] + [words[i] for i in real] + ["*"]
        spans = aligner(emission[0], tokenizer(transcript))
        for i, sp in zip(real, spans[1:-1]):
            n = len(sp)
            res[i] = {
                "startMs": round((a / sr + sp[0].start * ratio) * 1000),
                "endMs": round((a / sr + sp[-1].end * ratio) * 1000),
                "score": round(sum(s.score for s in sp) / n, 4),
                "tokens": n,
            }
        out.append({"idx": ln["idx"], "words": res})
        print(f"aligned line {ln['idx']}", file=sys.stderr, flush=True)
    out_path.write_text(json.dumps({"lines": out, "torchaudio": torchaudio.__version__}))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "separate":
        separate(Path(sys.argv[2]), Path(sys.argv[3]))
    elif cmd == "align":
        align(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        raise SystemExit(f"unknown heavy command {cmd}")
