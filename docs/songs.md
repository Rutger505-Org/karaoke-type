# Songs pipeline (songc)

**Architecture**
- Code: `tools/songc/` (Python 3.12, uv, CPU-only torch) in this public repo. No lyrics or audio here, ever.
- Data: private repo `Rutger505-Org/karaoke-type-songs` (sibling checkout `../karaoke-type-songs`, override with `SONGC_DATA_DIR`). Per song `songs/<slug>/`: `song.json` (the contract), `lrclib.json` (raw LRCLIB response), `compile.json` (offset, LRCLIB line refs, dropped lines, params), `report.txt` (full check output).
- Cache (not in git): `~/.cache/songc/<slug>/` (`SONGC_CACHE_DIR`): `source.*` (yt-dlp), `audio.m4a` (delivery), `mix16k.wav`, `vocals16k.wav` (~18 MB/song). Models: `~/.cache/torch/hub/checkpoints/` (MMS_FA `model.pt` 1.2 GB, htdemucs ~80 MB).
- CDN: bucket `karaoke` via `mcli` alias `rcdn`, public base `https://cdn.rutgerpronk.com/karaoke/`:
  - `audio/<slug>/<sha256-12>.m4a`: immutable, `Cache-Control: public, max-age=31536000, immutable`, `audio/mp4`
  - `songs/<slug>.json`: published song.json incl. `audio.url`, `max-age=60`
  - `index.json`: `{"schema":1,"songs":[{slug,title,artist,durationMs,url:"songs/<slug>.json"}]}`, published songs only, `max-age=60`

**Compile steps**
- yt-dlp bestaudio → two-pass loudnorm (-16 LUFS) → AAC-LC 160k stereo 44.1k `.m4a`, faststart. Analysis wav is decoded FROM that m4a, so all times are on the delivery file's timeline (not the video).
- LRCLIB `/api/get` (artist, track, duration). Prefers the `lyricsfile` field (YAML with word timings) over `syncedLyrics`; enhanced LRC `<mm:ss.xx>` word stamps are stripped from text.
- Fully parenthesized backing lines that overlap a lead line are dropped (lines must not overlap); listed in `compile.json`.
- demucs htdemucs `--two-stems vocals`, CPU, `--segment 7` → vocals stem 16k mono.
- Global offset: cross-correlation of the vocal RMS envelope with LRCLIB word activity (±30 s), refined by the median (aligned − LRCLIB) start of confident lines.
- Per line: torchaudio `MMS_FA` (wav2vec2 CTC forced alignment) on the vocals stem in a window `[start−2 s (never before prev line start+0.3 s), max(line end, next start)+2 s]`, transcript wrapped in `*` star tokens so other vocals in the window are absorbed. Text normalized: unidecode, lowercase, digits→words, only `a-z'`.
- Line → `aligned` if confidence ≥ 0.45 and |start − LRCLIB ref| ≤ 1.5 s, else `lrclib` fallback (offset-corrected LRCLIB word timings, score 0).
- Words: gaps < 300 ms closed, min 80 ms, max 3 s; last word stretched to the LRCLIB line end (CTC ends held notes early).
- Heavy steps run as `python -m songc.heavy ...` inside `buildq run` (skip with `SONGC_NO_BUILDQ=1`; owner via `BUILDQ_OWNER`).

**song.json (schema 1)**
```jsonc
{
  "schema": 1,
  "slug": "never-gonna-give-you-up",
  "title": "Never Gonna Give You Up",
  "artist": "Rick Astley",
  "durationMs": 213043,
  "source": { "youtubeId": "dQw4w9WgXcQ", "lrclibId": 1009665 },
  "audio": { "key": "audio/<slug>/<sha256-12>.m4a", "url": "https://cdn.rutgerpronk.com/karaoke/audio/...", "sha256": "<full>", "durationMs": 213043 },
  "offsetMs": 0, // added to ALL times at load (app + check). Times below are pre-offset.
  "compiledAt": "ISO-8601", "compiler": "songc 0.1.0",
  "lines": [
    { "startMs": 18890, "endMs": 22500, "text": "We're no strangers to love",
      "origin": "aligned", // aligned | lrclib | manual
      "confidence": 0.91, "locked": false,
      "words": [{ "text": "We're", "startMs": 18890, "endMs": 19200, "score": 0.95 }] }
  ]
}
```
- Lines sorted, non-overlapping; `line.startMs` = first word start, `line.endMs` = last word end. Times in ms on the self-hosted audio.
- `audio.url` absent in the data repo until first publish. Word `score` 0 = not aligned (fallback/interpolated).
- Changing the schema = bump `schema` and update the app.

**Commands** (repo root; `bun run song:<cmd> ...` works too)
- `uv run --project tools/songc songc compile <slug> --youtube <url> --artist A --title T [--lrclib-artist X] [--lrclib-track Y] [--lrclib-id N] [--force] [--reencode]`: recompile reuses cached audio/stem and the remembered YouTube URL; keeps `locked` lines (matched by text + occurrence) and `offsetMs` unless `--force`.
- `songc check <slug> [--all]`: summary + flagged lines: `idx start end lrclib delta conf origin lock voc flags | text` (times effective = incl. offsetMs; `lrclib` = offset-corrected LRCLIB start; `voc` = fraction of the line with vocal energy). Flags: `fallback`, `lowconf` (<0.6), `overlap`, `gap>10s`, `short` (<1.2 s), `delta` (>700 ms vs LRCLIB), `silent` (voc<0.3), `word<40ms`, `word>3s`.
- `songc nudge <slug> --line N|--from N --to M --ms ±X`: shift lines + words, set `origin: manual`, `locked: true`. `--line N --set-start T`/`--set-end T` (effective ms) move only the first word start / last word end. `--all --ms X`: only changes `offsetMs` (global, nothing locked). Rejects overlaps / negative times, writes nothing then.
- `songc clip <slug> --line N [--stem vocals|mix] [--pad-ms 1000]`: `/tmp/<slug>-<N>.m4a` for a human to listen.
- `songc publish <slug>`: checks cached audio sha = song.json, uploads audio (skipped if the key exists), `songs/<slug>.json`, rebuilds `index.json`, writes `audio.url` back to the data repo, verifies with curl (200, Range 206).
- Tests: `uv run --project tools/songc pytest tools/songc`.

**Agent sync workflow**
1. `compile` → read the printed check (also `report.txt`).
2. `check` flagged lines: `delta` + `silent` together = likely misplaced; `fallback` = aligner unsure, LRCLIB timing used.
3. Can't hear: ask the human with `clip --line N`, e.g. "line N starts ~300 ms late?".
4. `nudge` per line (locks it) or `--all` for a global shift; `check` again.
5. Commit the data repo, then `publish`.

**Pitfalls**
- LRCLIB `syncedLyrics` can contain out-of-order lines (backing vocals with an earlier stamp): always sort; overlapping parenthesized lines get dropped.
- torch + torchaudio pinned to 2.8.0 (CPU index): torchaudio 2.9 removes a lot of deprecated API and moves load/save to torchcodec, which demucs 4.0.1 relies on. Bump only after re-running a compile.
- Never run `wav2vec2` over the whole song (attention RAM is quadratic): per-line windows only.
- Re-encoding the m4a changes its sha (new CDN key); timings stay valid only for the hashed file in song.json.
- `mcli`, not `mc`. `--attr "Content-Type=...;Cache-Control=public, max-age=60"` (`;` separates attrs).
