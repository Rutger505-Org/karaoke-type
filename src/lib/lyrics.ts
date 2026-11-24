/** A sung word inside a line: character range in `text` + song times. */
export type KaraokeWord = {
  /** Index of the first character in the line text. */
  start: number;
  /** Index after the last character. */
  end: number;
  startMs: number;
  endMs: number;
};

/** A line the player has to type during [startMs, endMs). */
export type KaraokeLine = {
  startMs: number;
  /** End of the typing window; at or after the end of the singing. */
  endMs: number;
  /** When the last word stops being sung. */
  sungEndMs: number;
  text: string;
  words: KaraokeWord[];
};

/** Compiled song.json line (times relative to the audio, before offsetMs). */
export type SongLine = {
  startMs: number;
  endMs: number;
  text: string;
  words: { text: string; startMs: number; endMs: number }[];
};

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
 * Turns compiled song.json lines into typing targets. `offsetMs` is added to
 * every line and word time. A line's typing window runs from its first word
 * until the next line starts, but at most `graceMs` past its last sung word
 * (and never past the song end).
 */
export function buildKaraokeLines(
  lines: SongLine[],
  options: { offsetMs?: number; songEndMs?: number; graceMs?: number } = {},
): KaraokeLine[] {
  const { offsetMs = 0, songEndMs = Infinity, graceMs = 4000 } = options;
  const sorted = lines
    .map((line) => ({ line, text: normalizeText(line.text) }))
    .filter(({ text }) => text)
    .sort((a, b) => a.line.startMs - b.line.startMs);
  const result: KaraokeLine[] = [];

  sorted.forEach(({ line, text }, index) => {
    const startMs = Math.max(0, line.startMs + offsetMs);
    const sungEndMs = line.endMs + offsetMs;
    const next = sorted[index + 1];
    const limit = next ? next.line.startMs + offsetMs : songEndMs;
    const endMs = Math.min(limit, sungEndMs + graceMs);
    if (endMs <= startMs) return;

    result.push({
      startMs,
      endMs,
      sungEndMs: Math.min(sungEndMs, endMs),
      text,
      words: locateWords(text, line.words, offsetMs),
    });
  });

  return result;
}

/**
 * Finds each word in the normalized line text (in order, case-insensitive).
 * Words that can't be found are skipped, so highlighting degrades instead of
 * pointing at the wrong characters.
 */
function locateWords(
  text: string,
  words: SongLine["words"],
  offsetMs: number,
): KaraokeWord[] {
  const haystack = text.toLowerCase();
  const result: KaraokeWord[] = [];
  let cursor = 0;
  for (const word of words) {
    const needle = normalizeText(word.text).toLowerCase();
    if (!needle) continue;
    const start = haystack.indexOf(needle, cursor);
    if (start === -1) continue;
    cursor = start + needle.length;
    result.push({
      start,
      end: cursor,
      startMs: word.startMs + offsetMs,
      endMs: word.endMs + offsetMs,
    });
  }
  return result;
}

/** Index into `line.words` of the word being sung at `nowMs`, or -1. */
export function activeWordIndex(line: KaraokeLine, nowMs: number): number {
  if (nowMs < line.startMs || nowMs >= line.sungEndMs) return -1;
  for (let i = line.words.length - 1; i >= 0; i--) {
    if (line.words[i].startMs <= nowMs) return i;
  }
  return -1;
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
