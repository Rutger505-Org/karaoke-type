import {
  computeStats,
  EARLY_BONUS_MAX,
  PERFECT_BONUS,
  scoreLine,
  type LineAttempt,
} from "@/lib/scoring";
import { describe, expect, test } from "bun:test";

// Made-up lyric line.
const base: LineAttempt = {
  target: "Purple socks",
  typed: "",
  startMs: 0,
  endMs: 4000,
  completedAtMs: null,
};

describe("scoreLine", () => {
  test("nothing typed scores nothing and breaks combo", () => {
    const r = scoreLine(base, 3);
    expect(r).toMatchObject({
      points: 0,
      correctChars: 0,
      missedChars: 12,
      perfect: false,
      combo: 0,
      activeMs: 4000,
    });
  });

  test("partial line: correct × 10 − wrong × 5", () => {
    const r = scoreLine({ ...base, typed: "purple sxcks" }, 0);
    expect(r.correctChars).toBe(11);
    expect(r.wrongChars).toBe(1);
    expect(r.points).toBe(105);
    expect(r.perfect).toBe(false);
  });

  test("penalty never goes below zero", () => {
    expect(scoreLine({ ...base, typed: "xxxxxx" }, 0).points).toBe(0);
  });

  test("perfect line gets bonus, earlier finish slightly more", () => {
    const late = scoreLine(
      { ...base, typed: "purple socks", completedAtMs: 3999 },
      0,
    );
    const early = scoreLine(
      { ...base, typed: "Purple socks", completedAtMs: 1000 },
      0,
    );
    expect(late.perfect).toBe(true);
    expect(late.points).toBe(120 + PERFECT_BONUS);
    expect(early.points).toBe(
      120 + PERFECT_BONUS + Math.round(EARLY_BONUS_MAX * 0.75),
    );
    expect(early.points - late.points).toBeLessThan(late.basePoints);
    expect(early.activeMs).toBe(1000);
  });

  test("not perfect when completed after window", () => {
    const r = scoreLine(
      { ...base, typed: "purple socks", completedAtMs: 4000 },
      0,
    );
    expect(r.perfect).toBe(false);
    expect(r.points).toBe(120);
  });

  test("combo multiplier grows and caps at 2×", () => {
    const attempt = { ...base, typed: "purple socks", completedAtMs: 3999 };
    expect(scoreLine(attempt, 0).multiplier).toBe(1);
    expect(scoreLine(attempt, 3).multiplier).toBeCloseTo(1.3);
    expect(scoreLine(attempt, 3).combo).toBe(4);
    expect(scoreLine(attempt, 50).multiplier).toBe(2);
    expect(scoreLine(attempt, 50).points).toBe(340);
  });
});

describe("computeStats", () => {
  test("empty", () => {
    expect(computeStats([])).toMatchObject({ score: 0, accuracy: 0, wpm: 0 });
  });

  test("aggregates", () => {
    const perfect = scoreLine(
      { ...base, typed: "purple socks", completedAtMs: 3000 },
      0,
    );
    const half = scoreLine({ ...base, typed: "purple" }, perfect.combo);
    const stats = computeStats([perfect, half]);
    expect(stats.score).toBe(perfect.points + half.points);
    // 18 correct of 24 lyric chars
    expect(stats.accuracy).toBe(75);
    // 18 chars = 3.6 words over 7 s
    expect(stats.wpm).toBeCloseTo(30.9, 1);
    expect(stats.combo).toBe(0);
    expect(stats.maxCombo).toBe(1);
    expect(stats.perfectLines).toBe(1);
  });
});
