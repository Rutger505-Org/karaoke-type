import { z } from "zod";

export const DISPLAY_NAME_MAX = 32;

/** Trimmed, inner whitespace collapsed, 1–32 chars, no control characters. */
export const displayNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Pick a name")
      .max(DISPLAY_NAME_MAX, `At most ${DISPLAY_NAME_MAX} characters`)
      .regex(/^[^\p{Cc}]*$/u, "No control characters"),
  );

/**
 * Public name for a user. Never falls back to the email (private); users
 * without a name get a stable, non-identifying `player-<id prefix>`.
 */
export function publicDisplayName(
  name: string | null | undefined,
  userId: string,
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return `player-${userId.slice(0, 6).toLowerCase()}`;
}

export function hasDisplayName(name: string | null | undefined): boolean {
  return !!name?.trim();
}
