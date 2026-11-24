import "server-only";

import { env } from "@/env";
import {
  indexSchema,
  songSchema,
  toSong,
  type Song,
  type SongIndexEntry,
} from "@/lib/catalog";
import { cache } from "react";
import { type z } from "zod";

/** Compiled songs on the CDN (see the schemas in @/lib/catalog). */
const DEFAULT_BASE_URL = "https://cdn.rutgerpronk.com/karaoke/";

/** Read lazily: with SKIP_ENV_VALIDATION (builds) env defaults aren't applied. */
function baseUrl(): string {
  const url = env.SONGS_BASE_URL ?? DEFAULT_BASE_URL;
  return url.endsWith("/") ? url : `${url}/`;
}
const REVALIDATE_SECONDS = 60;

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export type IndexResult = Result<{ songs: SongIndexEntry[] }>;
export type SongResult =
  Result<{ song: Song }> | { ok: false; notFound: true; error: string };

async function fetchJson<S extends z.ZodType>(
  url: string,
  schema: S,
): Promise<Result<{ data: z.infer<S> }>> {
  let body: unknown;
  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      console.error(`Song catalog: ${url} responded ${response.status}`);
      return { ok: false, error: "The song catalog is unavailable." };
    }
    body = await response.json();
  } catch (error) {
    console.error(`Song catalog: failed to fetch ${url}`, error);
    return { ok: false, error: "Could not reach the song catalog." };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error(`Song catalog: invalid data at ${url}`, parsed.error);
    return { ok: false, error: "The song data has an unsupported format." };
  }
  return { ok: true, data: parsed.data };
}

/** All published songs (index.json). */
export const getSongIndex = cache(async (): Promise<IndexResult> => {
  const result = await fetchJson(`${baseUrl()}index.json`, indexSchema);
  if (!result.ok) return result;
  return { ok: true, songs: result.data.songs };
});

/** True/false when the index could be read, null when it couldn't. */
export async function isPublishedSong(slug: string): Promise<boolean | null> {
  const index = await getSongIndex();
  if (!index.ok) return null;
  return index.songs.some((song) => song.slug === slug);
}

/** Full song (metadata, audio URL, typing lines) for a slug in the index. */
export const getSong = cache(async (slug: string): Promise<SongResult> => {
  const index = await getSongIndex();
  if (!index.ok) return index;

  const entry = index.songs.find((song) => song.slug === slug);
  if (!entry) return { ok: false, notFound: true, error: "Unknown song." };

  const base = baseUrl();
  const url = new URL(entry.url, base).href;
  if (!url.startsWith(base)) {
    console.error(`Song catalog: ${slug} points outside the catalog: ${url}`);
    return { ok: false, error: "The song data has an unsupported format." };
  }

  const result = await fetchJson(url, songSchema);
  if (!result.ok) return result;
  if (result.data.slug !== slug) {
    console.error(`Song catalog: ${url} contains ${result.data.slug}`);
    return { ok: false, error: "The song data has an unsupported format." };
  }

  const song = toSong(result.data);
  if (!song.lines.length) {
    return { ok: false, error: "This song has no lyrics." };
  }
  return { ok: true, song };
});
