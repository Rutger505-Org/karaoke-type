import { compareChars, type KaraokeLine } from "@/lib/lyrics";
import { scoreLine, type LineResult } from "@/lib/scoring";

export type GameStatus = "idle" | "playing" | "finished";

export type GameState = {
  lines: KaraokeLine[];
  status: GameStatus;
  /** Index of the line being typed or, before its start, the upcoming line. */
  lineIndex: number;
  typed: string;
  /** Song time at which `typed` became fully correct. */
  completedAtMs: number | null;
  /** The current line was locked early with Enter; waiting for its window to end. */
  lockedEarly: boolean;
  results: LineResult[];
  nowMs: number;
};

export type GameAction =
  | { type: "start" }
  | { type: "tick"; nowMs: number }
  | { type: "input"; value: string }
  | { type: "enter" }
  | { type: "end" };

export function createGame(lines: KaraokeLine[]): GameState {
  return {
    lines,
    status: "idle",
    lineIndex: 0,
    typed: "",
    completedAtMs: null,
    lockedEarly: false,
    results: [],
    nowMs: 0,
  };
}

export function currentLine(state: GameState): KaraokeLine | undefined {
  return state.lines[state.lineIndex];
}

/** True when the player can type into the current line right now. */
export function isLineActive(state: GameState): boolean {
  const line = currentLine(state);
  return (
    state.status === "playing" &&
    !!line &&
    !state.lockedEarly &&
    state.nowMs >= line.startMs &&
    state.nowMs < line.endMs
  );
}

function lockCurrent(state: GameState, lockedAtMs: number): LineResult[] {
  const line = currentLine(state);
  if (!line || state.lockedEarly) return state.results;
  const previousCombo = state.results.at(-1)?.combo ?? 0;
  const result = scoreLine(
    {
      target: line.text,
      typed: state.typed,
      startMs: line.startMs,
      endMs: line.endMs,
      completedAtMs: state.completedAtMs,
      lockedAtMs,
    },
    previousCombo,
  );
  return [...state.results, result];
}

function advance(state: GameState, results: LineResult[]): GameState {
  const lineIndex = state.lineIndex + 1;
  return {
    ...state,
    results,
    lineIndex,
    typed: "",
    completedAtMs: null,
    lockedEarly: false,
    status: lineIndex >= state.lines.length ? "finished" : state.status,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start":
      return { ...createGame(state.lines), status: "playing" };

    case "tick": {
      if (state.status !== "playing" || action.nowMs === state.nowMs) {
        return state;
      }
      let next: GameState = { ...state, nowMs: action.nowMs };
      // Lock every line whose window has passed (also handles skipped lines).
      while (next.status === "playing") {
        const line = currentLine(next);
        if (!line || action.nowMs < line.endMs) break;
        next = advance(next, lockCurrent(next, line.endMs));
      }
      return next;
    }

    case "input": {
      if (!isLineActive(state)) return state;
      const line = currentLine(state)!;
      const typed = action.value.replace(/\n/g, "").slice(0, line.text.length);
      const complete =
        typed.length === line.text.length &&
        compareChars(line.text, typed).every((s) => s === "correct");
      return {
        ...state,
        typed,
        completedAtMs: complete ? (state.completedAtMs ?? state.nowMs) : null,
      };
    }

    case "enter": {
      if (!isLineActive(state)) return state;
      const line = currentLine(state)!;
      if (state.typed.length < line.text.length) return state;
      return {
        ...state,
        results: lockCurrent(state, state.nowMs),
        lockedEarly: true,
      };
    }

    case "end": {
      if (state.status !== "playing") return state;
      const line = currentLine(state);
      const results =
        line && state.nowMs >= line.startMs
          ? lockCurrent(state, state.nowMs)
          : state.results;
      return {
        ...state,
        results,
        typed: "",
        lockedEarly: false,
        status: "finished",
      };
    }
  }
}
