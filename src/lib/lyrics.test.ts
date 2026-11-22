import {
  buildKaraokeLines,
  compareChars,
  normalizeText,
  parseLrc,
} from "@/lib/lyrics";
import { describe, expect, test } from "bun:test";

// Made-up lyrics only: never put real song lyrics in this repo.
const LRC = [
  "[ar:Test Artist]",
  "[ti:Test Song]",
  "[00:01.50] Hello little teapot",
  "[00:04.00]",
  "[00:06.25][00:20.00] Biscuits on the windowsill",
  "[00:09.5] Short fraction",
  "[01:02.123] Three digit fraction",
  "not a lyric line",
].join("\n");

describe("parseLrc", () => {
  test("parses timestamps, sorts, keeps empty lines and duplicates", () => {
    expect(parseLrc(LRC)).toEqual([
      { timeMs: 1500, text: "Hello little teapot" },
      { timeMs: 4000, text: "" },
      { timeMs: 6250, text: "Biscuits on the windowsill" },
      { timeMs: 9500, text: "Short fraction" },
      { timeMs: 20000, text: "Biscuits on the windowsill" },
      { timeMs: 62123, text: "Three digit fraction" },
    ]);
  });

  test("applies offset and clamps at zero", () => {
    const lines = parseLrc("[00:00.50] a\n[00:02.00] b", -1000);
    expect(lines.map((l) => l.timeMs)).toEqual([0, 1000]);
    expect(parseLrc("[00:01.00] a", 250)[0]?.timeMs).toBe(1250);
  });

  test("strips enhanced LRC word timestamps", () => {
    expect(
      parseLrc(
        "[00:01.00] <00:01.00>Some <00:01.40>made <00:01.90>up <00:02.30>",
      ),
    ).toEqual([{ timeMs: 1000, text: "Some made up" }]);
  });

  test("handles CRLF and timestamps without fraction", () => {
    expect(parseLrc("[00:03] x\r\n[00:04] y")).toEqual([
      { timeMs: 3000, text: "x" },
      { timeMs: 4000, text: "y" },
    ]);
  });
});

describe("normalizeText", () => {
  test("straightens quotes, dashes, ellipsis and whitespace", () => {
    expect(normalizeText("  \u201CIt\u2019s  a\u2014test\u2026\u201D ")).toBe(
      '"It\'s a-test..."',
    );
    expect(normalizeText("a \u2013 b\u00A0c")).toBe("a - b c");
  });
});

describe("buildKaraokeLines", () => {
  test("empty lines end the previous line and are not targets", () => {
    const lines = buildKaraokeLines(parseLrc(LRC), { songEndMs: 65000 });
    expect(lines[0]).toEqual({
      startMs: 1500,
      endMs: 4000,
      text: "Hello little teapot",
    });
    expect(lines.map((l) => l.text)).not.toContain("");
    expect(lines).toHaveLength(5);
  });

  test("last line ends at song end, capped", () => {
    const lrc = parseLrc("[00:10.00] last");
    expect(buildKaraokeLines(lrc, { songEndMs: 12000 })[0]?.endMs).toBe(12000);
    expect(buildKaraokeLines(lrc, { maxLastLineMs: 3000 })[0]?.endMs).toBe(
      13000,
    );
  });

  test("drops zero-length windows", () => {
    const lrc = parseLrc("[00:01.00] a\n[00:01.00] b\n[00:02.00] c");
    expect(buildKaraokeLines(lrc).map((l) => l.text)).toEqual(["b", "c"]);
  });
});

describe("compareChars", () => {
  test("case-insensitive with pending tail", () => {
    expect(compareChars("Abc'd", "aXc")).toEqual([
      "correct",
      "wrong",
      "correct",
      "pending",
      "pending",
    ]);
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
