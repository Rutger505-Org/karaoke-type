import {
  activeWordIndex,
  buildKaraokeLines,
  compareChars,
  normalizeText,
  type SongLine,
} from "@/lib/lyrics";
import { describe, expect, test } from "bun:test";

// Made-up lyrics only: never put real song lyrics in this repo.
function line(startMs: number, words: [string, number, number][]): SongLine {
  return {
    startMs,
    endMs: words.at(-1)![2],
    text: words.map(([text]) => text).join(" "),
    words: words.map(([text, s, e]) => ({ text, startMs: s, endMs: e })),
  };
}

const SONG: SongLine[] = [
  line(1500, [
    ["Hello", 1500, 2000],
    ["little", 2000, 2500],
    ["teapot", 2500, 3000],
  ]),
  line(3200, [
    ["Biscuits", 3200, 4000],
    ["on", 4000, 4200],
    ["the", 4200, 4400],
    ["windowsill", 4400, 5000],
  ]),
  line(20000, [
    ["Last", 20000, 21000],
    ["one", 21000, 22000],
  ]),
];

describe("normalizeText", () => {
  test("straightens quotes, dashes, ellipsis and whitespace", () => {
    expect(normalizeText("  \u201CIt\u2019s  a\u2014test\u2026\u201D ")).toBe(
      '"It\'s a-test..."',
    );
    expect(normalizeText("a \u2013 b\u00A0c")).toBe("a - b c");
  });
});

describe("buildKaraokeLines", () => {
  test("window runs to the next line, capped by grace after the last word", () => {
    const lines = buildKaraokeLines(SONG, { songEndMs: 60000 });
    expect(lines.map((l) => [l.startMs, l.endMs, l.sungEndMs])).toEqual([
      [1500, 3200, 3000],
      [3200, 9000, 5000],
      [20000, 26000, 22000],
    ]);
  });

  test("last line never runs past the song end", () => {
    const lines = buildKaraokeLines(SONG, { songEndMs: 23000 });
    expect(lines.at(-1)?.endMs).toBe(23000);
  });

  test("offset shifts lines and words", () => {
    const [first] = buildKaraokeLines(SONG, { offsetMs: 250 });
    expect(first?.startMs).toBe(1750);
    expect(first?.sungEndMs).toBe(3250);
    expect(first?.words[1]).toEqual({
      start: 6,
      end: 12,
      startMs: 2250,
      endMs: 2750,
    });
  });

  test("sorts, normalizes text and drops empty lines", () => {
    const lines = buildKaraokeLines([
      line(5000, [["B\u2019s", 5000, 6000]]),
      { startMs: 3000, endMs: 4000, text: "  ", words: [] },
      line(1000, [["A", 1000, 2000]]),
    ]);
    expect(lines.map((l) => l.text)).toEqual(["A", "B's"]);
  });

  test("skips words not found in the line text", () => {
    const [only] = buildKaraokeLines([
      {
        ...line(0, [
          ["foo", 0, 100],
          ["bar", 100, 200],
        ]),
        text: "foo baz",
      },
    ]);
    expect(only?.words.map((w) => [w.start, w.end])).toEqual([[0, 3]]);
  });
});

describe("activeWordIndex", () => {
  const [first] = buildKaraokeLines(SONG);
  test("tracks the last started word while sung", () => {
    expect(activeWordIndex(first, 1000)).toBe(-1);
    expect(activeWordIndex(first, 1500)).toBe(0);
    expect(activeWordIndex(first, 2600)).toBe(2);
    expect(activeWordIndex(first, 3000)).toBe(-1);
  });
});

describe("compareChars", () => {
  test("case-sensitive with pending tail", () => {
    expect(compareChars("Abc'd", "AXc")).toEqual([
      "correct",
      "wrong",
      "correct",
      "pending",
      "pending",
    ]);
  });

  test("wrong case is wrong", () => {
    expect(compareChars("Abc", "abC")).toEqual(["wrong", "correct", "wrong"]);
  });

  test("typed curly apostrophe matches straight target", () => {
    expect(compareChars("it's", "it\u2019s")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });
});
