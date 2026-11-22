import { compareChars } from "@/lib/lyrics";

export const POINTS_PER_CHAR = 10;
export const WRONG_CHAR_PENALTY = 5;
/** Bonus for a line typed fully correct before its window ends. */
export const PERFECT_BONUS = 50;
/** Extra bonus scaled by how much of the window was left. Kept small: sync matters more than speed. */
export const EARLY_BONUS_MAX = 25;
/** Each previous consecutive perfect line adds this to the multiplier. */
export const COMBO_STEP = 0.1;
export const MAX_COMBO_MULTIPLIER = 2;

export type LineAttempt = {
  target: string;
  typed: string;
  startMs: number;
  endMs: number;
  /** Song time at which the typed text became fully correct, if it did. */
  completedAtMs: number | null;
  /** Song time at which the line was locked, if before the window ended (Enter). */
  lockedAtMs?: number;
};

export type LineResult = {
  correctChars: number;
  wrongChars: number;
  missedChars: number;
  perfect: boolean;
  basePoints: number;
  bonusPoints: number;
  multiplier: number;
  points: number;
  /** Consecutive perfect lines including this one; 0 when this line breaks the combo. */
  combo: number;
  /** Time spent on the line, used for WPM. */
  activeMs: number;
};

export function comboMultiplier(previousCombo: number): number {
  return Math.min(MAX_COMBO_MULTIPLIER, 1 + previousCombo * COMBO_STEP);
}

/**
 * Scores a locked line.
 *
 * - base = correct × 10 − wrong × 5 (never below 0)
 * - perfect (all chars correct, completed before the window ends):
 *   bonus = 50 + 25 × fraction of the window still left
 * - perfect lines are multiplied by 1 + 0.1 × previous combo (max 2×)
 */
export function scoreLine(
  attempt: LineAttempt,
  previousCombo: number,
): LineResult {
  const states = compareChars(attempt.target, attempt.typed);
  const correctChars = states.filter((s) => s === "correct").length;
  const wrongChars = states.filter((s) => s === "wrong").length;
  const missedChars = states.length - correctChars - wrongChars;

  const windowMs = Math.max(1, attempt.endMs - attempt.startMs);
  const perfect =
    correctChars === states.length &&
    attempt.completedAtMs !== null &&
    attempt.completedAtMs < attempt.endMs;

  const basePoints = Math.max(
    0,
    correctChars * POINTS_PER_CHAR - wrongChars * WRONG_CHAR_PENALTY,
  );

  let bonusPoints = 0;
  if (perfect && attempt.completedAtMs !== null) {
    const leftFraction = clamp(
      (attempt.endMs - attempt.completedAtMs) / windowMs,
      0,
      1,
    );
    bonusPoints = PERFECT_BONUS + Math.round(EARLY_BONUS_MAX * leftFraction);
  }

  const multiplier = perfect ? comboMultiplier(previousCombo) : 1;
  const points = Math.round((basePoints + bonusPoints) * multiplier);

  const activeMs = clamp(
    (attempt.completedAtMs ?? attempt.lockedAtMs ?? attempt.endMs) -
      attempt.startMs,
    0,
    windowMs,
  );

  return {
    correctChars,
    wrongChars,
    missedChars,
    perfect,
    basePoints,
    bonusPoints,
    multiplier,
    points,
    combo: perfect ? previousCombo + 1 : 0,
    activeMs,
  };
}

export type GameStats = {
  score: number;
  /** Percentage (0-100) of lyric characters typed correctly. */
  accuracy: number;
  wpm: number;
  combo: number;
  maxCombo: number;
  perfectLines: number;
  lines: number;
};

/** Aggregates locked line results. WPM uses 5 correct chars per word over the time spent on lines. */
export function computeStats(results: LineResult[]): GameStats {
  let score = 0;
  let correct = 0;
  let total = 0;
  let activeMs = 0;
  let maxCombo = 0;
  let perfectLines = 0;

  for (const r of results) {
    score += r.points;
    correct += r.correctChars;
    total += r.correctChars + r.wrongChars + r.missedChars;
    activeMs += r.activeMs;
    maxCombo = Math.max(maxCombo, r.combo);
    if (r.perfect) perfectLines++;
  }

  const minutes = activeMs / 60_000;
  return {
    score,
    accuracy: total ? round1((correct / total) * 100) : 0,
    wpm: minutes > 0 ? round1(correct / 5 / minutes) : 0,
    combo: results.at(-1)?.combo ?? 0,
    maxCombo,
    perfectLines,
    lines: results.length,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
