import { buildKaraokeLines, type KaraokeLine } from "@/lib/lyrics";
import { z } from "zod";

/** Schemas for the CDN song catalog, schema 1 (produced by the private karaoke-type-songs repo). */

const ms = z.number().int().nonnegative();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const indexSchema = z.object({
  schema: z.literal(1),
  songs: z.array(
    z.object({
      slug,
      title: z.string().min(1),
      artist: z.string().min(1),
      durationMs: ms,
      url: z.string().min(1),
    }),
  ),
});

export const songSchema = z.object({
  schema: z.literal(1),
  slug,
  title: z.string().min(1),
  artist: z.string().min(1),
  durationMs: ms,
  audio: z.object({
    url: z.url(),
    sha256: z.string(),
    durationMs: ms,
  }),
  offsetMs: z.number().int(),
  lines: z.array(
    z.object({
      startMs: ms,
      endMs: ms,
      text: z.string(),
      words: z.array(z.object({ text: z.string(), startMs: ms, endMs: ms })),
    }),
  ),
});

export type SongIndexEntry = z.infer<typeof indexSchema>["songs"][number];

export type Song = {
  slug: string;
  title: string;
  artist: string;
  durationMs: number;
  audioUrl: string;
  lines: KaraokeLine[];
};

/** Validated song.json → playable song, offsetMs applied to all times. */
export function toSong(data: z.infer<typeof songSchema>): Song {
  const durationMs = data.audio.durationMs || data.durationMs;
  return {
    slug: data.slug,
    title: data.title,
    artist: data.artist,
    durationMs,
    audioUrl: data.audio.url,
    lines: buildKaraokeLines(data.lines, {
      offsetMs: data.offsetMs,
      songEndMs: durationMs,
    }),
  };
}
