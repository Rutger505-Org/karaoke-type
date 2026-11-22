export type LrcLine = {
  timeMs: number;
  /** Raw line text; empty for instrumental gaps. */
  text: string;
};

/** A line the player has to type during [startMs, endMs). */
export type KaraokeLine = {
  startMs: number;
  endMs: number;
  text: string;
};

const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const LEADING_TIMESTAMPS = /^(?:\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/;

/**
 * Parses LRC synced lyrics (`[mm:ss.xx] text`) into lines sorted by time.
 * Lines with several timestamps (`[00:10.00][00:30.00] text`) produce one
 * entry per timestamp. Metadata tags such as `[ar:...]` are ignored. Empty
 * lines are kept: they mark the end of the previous line.
 */
export function parseLrc(lrc: string, offsetMs = 0): LrcLine[] {
  const lines: LrcLine[] = [];

  for (const rawLine of lrc.split(/\r?\n/)) {
    const prefix = LEADING_TIMESTAMPS.exec(rawLine);
    if (!prefix) continue;

    const text = rawLine.slice(prefix[0].length).trim();
    for (const match of prefix[0].matchAll(TIMESTAMP)) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ?? "0";
      // ".5" = 500 ms, ".05" = 50 ms, ".005" = 5 ms
      const fractionMs = Number(fraction.padEnd(3, "0"));
      const timeMs = (minutes * 60 + seconds) * 1000 + fractionMs + offsetMs;
      lines.push({ timeMs: Math.max(0, timeMs), text });
    }
  }

  // Array.prototype.sort is stable, so equal timestamps keep file order.
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Normalizes lyric text into something typeable on a regular keyboard. */
export function normalizeText(text: string): string {
  return normalizeChars(text)
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Character-for-character normalization (keeps the string length), safe to
 * apply to text the player is typing.
 */
export function normalizeChars(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00A0/g, " ");
}

/**
 * Turns parsed LRC lines into typing targets. Each line lasts until the next
 * timestamped line (including empty ones). The last line lasts until the
 * song ends, capped at `maxLastLineMs`.
 */
export function buildKaraokeLines(
  lines: LrcLine[],
  options: { songEndMs?: number; maxLastLineMs?: number } = {},
): KaraokeLine[] {
  const { songEndMs = Infinity, maxLastLineMs = 8000 } = options;
  const result: KaraokeLine[] = [];

  lines.forEach((line, index) => {
    const text = normalizeText(line.text);
    if (!text) return;

    const next = lines[index + 1];
    const endMs = next
      ? next.timeMs
      : Math.min(songEndMs, line.timeMs + maxLastLineMs);
    if (endMs <= line.timeMs) return;

    result.push({ startMs: line.timeMs, endMs, text });
  });

  return result;
}

export type CharState = "correct" | "wrong" | "pending";

/** Case-insensitive comparison, one state per target character. */
export function compareChars(target: string, typed: string): CharState[] {
  const t = normalizeChars(target);
  const y = normalizeChars(typed);
  return t.split("").map((char, i) => {
    const typedChar = y[i];
    if (typedChar === undefined) return "pending";
    return typedChar.toLowerCase() === char.toLowerCase() ? "correct" : "wrong";
  });
}
