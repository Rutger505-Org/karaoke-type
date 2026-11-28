import {
  createGame,
  gameReducer,
  isLineActive,
  type GameState,
} from "@/lib/game";
import { type KaraokeLine } from "@/lib/lyrics";
import { describe, expect, test } from "bun:test";

// Made-up lyric lines.
const lines: KaraokeLine[] = [
  {
    startMs: 1000,
    endMs: 3000,
    sungEndMs: 2500,
    text: "Tiny robot",
    words: [],
  },
  { startMs: 4000, endMs: 6000, sungEndMs: 5500, text: "Dances", words: [] },
];

function run(...actions: Parameters<typeof gameReducer>[1][]): GameState {
  return actions.reduce(gameReducer, createGame(lines));
}

describe("gameReducer", () => {
  test("cannot type before the line starts or before start", () => {
    expect(run({ type: "input", value: "t" }).typed).toBe("");
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 500 },
      { type: "input", value: "t" },
    );
    expect(s.typed).toBe("");
    expect(isLineActive(s)).toBe(false);
  });

  test("typing is capped to the line length", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1000 },
      { type: "input", value: "Tiny robot and more" },
    );
    expect(s.typed).toBe("Tiny robot");
    expect(s.completedAtMs).toBe(1000);
  });

  test("stops at the first typo; backspace keeps working", () => {
    const typo = run(
      { type: "start" },
      { type: "tick", nowMs: 1000 },
      { type: "input", value: "T" },
      { type: "input", value: "Tx" },
      { type: "input", value: "Txn" },
      { type: "input", value: "Txny" },
    );
    expect(typo.typed).toBe("Tx");
    expect(typo.mistakes).toBe(1);

    const fixed = [
      { type: "input", value: "T" },
      { type: "input", value: "Ti" },
      { type: "input", value: "Tin" },
    ] as const;
    const s = fixed.reduce(gameReducer, typo);
    expect(s.typed).toBe("Tin");
    expect(s.mistakes).toBe(1);
  });

  test("multi-char input is cut after the first wrong char", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1000 },
      { type: "input", value: "tiny robot" },
    );
    expect(s.typed).toBe("t");
    expect(s.mistakes).toBe(1);
    expect(s.completedAtMs).toBeNull();
  });

  test("every wrong keystroke counts, also when fixed", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1000 },
      { type: "input", value: "x" },
      { type: "input", value: "" },
      { type: "input", value: "y" },
      { type: "input", value: "" },
      { type: "input", value: "Tiny robot" },
      { type: "tick", nowMs: 3000 },
    );
    expect(s.results[0]).toMatchObject({
      perfect: true,
      mistakes: 2,
      wrongChars: 0,
    });
    expect(s.mistakes).toBe(0);
  });

  test("line locks at window end and next line activates", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1500 },
      { type: "input", value: "Tiny robot" },
      { type: "tick", nowMs: 3000 },
    );
    expect(s.lineIndex).toBe(1);
    expect(s.typed).toBe("");
    expect(s.results).toHaveLength(1);
    expect(s.results[0]?.perfect).toBe(true);
    // gap before next line: not active
    expect(isLineActive(s)).toBe(false);
    expect(isLineActive(gameReducer(s, { type: "tick", nowMs: 4000 }))).toBe(
      true,
    );
  });

  test("enter locks a fully typed line early, no typing ahead", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1500 },
      { type: "input", value: "Tiny robox" },
      { type: "enter" },
      { type: "input", value: "Dances" },
    );
    expect(s.lockedEarly).toBe(true);
    expect(s.results).toHaveLength(1);
    expect(s.results[0]?.perfect).toBe(false);
    expect(s.results[0]?.activeMs).toBe(500);
    expect(s.typed).toBe("Tiny robox");
    const after = gameReducer(s, { type: "tick", nowMs: 3100 });
    expect(after.results).toHaveLength(1);
    expect(after.lineIndex).toBe(1);
  });

  test("enter on a partial line does nothing", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1500 },
      { type: "input", value: "Tiny" },
      { type: "enter" },
    );
    expect(s.lockedEarly).toBe(false);
    expect(s.results).toHaveLength(0);
  });

  test("finishes after last line; skipped lines count as missed", () => {
    const s = run({ type: "start" }, { type: "tick", nowMs: 7000 });
    expect(s.status).toBe("finished");
    expect(s.results.map((r) => r.missedChars)).toEqual([10, 6]);
  });

  test("video end locks the current line and finishes", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1500 },
      { type: "input", value: "Tiny" },
      { type: "end" },
    );
    expect(s.status).toBe("finished");
    expect(s.results[0]?.correctChars).toBe(4);
  });

  test("start resets a finished game", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 7000 },
      { type: "start" },
    );
    expect(s.status).toBe("playing");
    expect(s.results).toHaveLength(0);
    expect(s.lineIndex).toBe(0);
  });
});
