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
  { startMs: 1000, endMs: 3000, text: "Tiny robot" },
  { startMs: 4000, endMs: 6000, text: "Dances" },
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
      { type: "input", value: "tiny robot and more" },
    );
    expect(s.typed).toBe("tiny robot");
    expect(s.completedAtMs).toBe(1000);
  });

  test("line locks at window end and next line activates", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1500 },
      { type: "input", value: "tiny robot" },
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
      { type: "input", value: "tiny robox" },
      { type: "enter" },
      { type: "input", value: "dances" },
    );
    expect(s.lockedEarly).toBe(true);
    expect(s.results).toHaveLength(1);
    expect(s.results[0]?.perfect).toBe(false);
    expect(s.results[0]?.activeMs).toBe(500);
    expect(s.typed).toBe("tiny robox");
    const after = gameReducer(s, { type: "tick", nowMs: 3100 });
    expect(after.results).toHaveLength(1);
    expect(after.lineIndex).toBe(1);
  });

  test("enter on a partial line does nothing", () => {
    const s = run(
      { type: "start" },
      { type: "tick", nowMs: 1500 },
      { type: "input", value: "tiny" },
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
      { type: "input", value: "tiny" },
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
