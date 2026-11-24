import numpy as np
import pytest

from songc import lrc, song
from songc.text import normalize_word


def test_parse_enhanced_lrc_strips_word_stamps():
    src = "[ar:Someone]\n[00:18.83]<00:18.83>We're <00:19.08>no strangers\n[00:30.00]\n[00:22.82]You know"
    lines = lrc.parse_lrc(src)
    assert [ln.text for ln in lines] == ["We're no strangers", "You know"]
    assert lines[0].start_ms == 18830
    assert [w.start_ms for w in lines[0].words] == [18830, 19080, None]


def test_parse_lrc_repeated_tags_sorted():
    lines = lrc.parse_lrc("[00:10.00][00:01.50]Chorus\n[00:05.00]Verse")
    assert [(ln.start_ms, ln.text) for ln in lines] == [(1500, "Chorus"), (5000, "Verse"), (10000, "Chorus")]


def test_lyricsfile_words():
    src = 'lines:\n- text: "Hi there "\n  start_ms: 100\n  end_ms: 900\n  words:\n  - text: "Hi "\n    start_ms: 100\n    end_ms: 400\n  - text: "there "\n    start_ms: 400\n    end_ms: 900\n'
    (ln,) = lrc.parse_lyricsfile(src)
    assert ln.text == "Hi there" and ln.end_ms == 900
    assert [(w.text, w.start_ms, w.end_ms) for w in ln.words] == [("Hi", 100, 400), ("there", 400, 900)]


def test_drop_overlapping_backing():
    lines = [lrc.LrcLine(1000, "(ooh give you up)", 5000), lrc.LrcLine(1800, "Never gonna give", 3000)]
    keep, dropped = lrc.drop_overlapping_backing(lines)
    assert [ln.text for ln in keep] == ["Never gonna give"]
    assert len(dropped) == 1


def test_normalize_word():
    assert normalize_word("We're") == "we're"
    assert normalize_word("(Ooh-") == "ooh"
    assert normalize_word("Café,") == "cafe"
    assert normalize_word("99") == "ninetynine"
    assert normalize_word("...") == ""


def test_xcorr_offset_finds_shift():
    rng = np.random.default_rng(0)
    exp = (rng.random(20000) > 0.5).astype(np.float32)
    exp = np.repeat(exp[::50], 50)[:20000]
    shift = 350  # frames of 10 ms -> 3.5 s later in audio
    env = np.full(20000, 1e-3, dtype=np.float32)
    env[shift:] += exp[: 20000 - shift]
    assert song.xcorr_offset(env, exp) == 3500


def test_refine_offset_median():
    assert song.refine_offset(1000, [10, 20, 30, 500]) == 1025
    assert song.refine_offset(1000, [10]) == 1000


def _line(start, end, text="x", locked=False):
    return {"startMs": start, "endMs": end, "text": text, "origin": "aligned", "confidence": 0.9,
            "locked": locked, "words": [{"text": text, "startMs": start, "endMs": end, "score": 0.9}]}


def _song(*lines, offset=0):
    return {"offsetMs": offset, "lines": list(lines)}


def test_nudge_shifts_and_locks():
    s = song.nudge(_song(_line(0, 1000), _line(2000, 3000)), [1], ms=-500)
    ln = s["lines"][1]
    assert (ln["startMs"], ln["endMs"], ln["words"][0]["startMs"]) == (1500, 2500, 1500)
    assert ln["locked"] and ln["origin"] == "manual"


def test_nudge_rejects_overlap():
    with pytest.raises(song.NudgeError):
        song.nudge(_song(_line(0, 1000), _line(1500, 3000)), [1], ms=-800)


def test_nudge_set_start_uses_effective_time():
    s = song.nudge(_song(_line(1000, 2000), offset=200), [0], set_start=1100)
    assert s["lines"][0]["startMs"] == 900


def test_nudge_all_changes_offset_only():
    s = song.nudge_all(_song(_line(1000, 2000)), 250)
    assert s["offsetMs"] == 250 and s["lines"][0]["startMs"] == 1000 and not s["lines"][0]["locked"]


def test_merge_locked_by_occurrence():
    old = [_line(0, 900, "a"), _line(1000, 1900, "chorus"), _line(5000, 5900, "chorus", locked=True)]
    new = [_line(0, 900, "a"), _line(1100, 1900, "chorus"), _line(5200, 6000, "chorus")]
    merged, orphans = song.merge_locked(new, old)
    assert [ln["startMs"] for ln in merged] == [0, 1100, 5000]
    assert merged[2]["locked"] and not orphans


def test_fix_overlaps_clips_previous():
    lines = song.fix_overlaps([_line(0, 1500), _line(1200, 2000)])
    assert lines[0]["endMs"] == 1150 and lines[0]["words"][0]["endMs"] == 1150
    assert not song.overlaps(lines)


def test_finish_words_min_and_gap():
    ws = song.finish_words([
        {"text": "a", "startMs": 0, "endMs": 20, "score": 1},
        {"text": "b", "startMs": 200, "endMs": 300, "score": 1},
    ], None, 900)
    assert ws[0]["endMs"] == 200  # gap < 300 closed
    assert ws[1]["endMs"] == 900  # stretched to LRCLIB end hint


def test_agreement_word_and_line_level():
    from songc.cli import agreement
    from songc.lrc import LrcLine, LrcWord

    ln = LrcLine(1000, "a b c", None, [LrcWord("a", 1000), LrcWord("b", 1500), LrcWord("c", 2000)])
    ws = [{"startMs": s, "score": sc} for s, sc in [(1100, 0.3), (1550, 0.1), (3000, 0.2)]]
    assert agreement(ln, ws, 0) == 2 / 3
    ws[1]["score"] = 0.0  # interpolated words don't count
    assert agreement(ln, ws, 0) == 1 / 2
    plain = LrcLine(1000, "a b", None, [LrcWord("a"), LrcWord("b")])
    assert agreement(plain, [{"startMs": 1300, "score": 0.2}, {"startMs": 1600, "score": 0.2}], 0) == 1.0
    assert agreement(plain, [{"startMs": 1300, "score": 0.2}, {"startMs": 1200, "score": 0.2}], 0) == 0.0
