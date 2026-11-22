import "server-only";

import { buildKaraokeLines, parseLrc, type KaraokeLine } from "@/lib/lyrics";
import { type Song } from "@/lib/songs";

const LRCLIB_URL = "https://lrclib.net/api/get";
const USER_AGENT =
  "karaoke-type (https://github.com/Rutger505-Org/karaoke-type)";
const ONE_DAY_SECONDS = 60 * 60 * 24;

type LrclibTrack = {
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
};

export type LyricsResult =
  { ok: true; lines: KaraokeLine[] } | { ok: false; error: string };

/**
 * Fetches synced lyrics from LRCLIB at runtime. Lyrics are never stored in
 * the repo; Next's data cache keeps them for a day.
 */
export async function getSongLyrics(song: Song): Promise<LyricsResult> {
  const params = new URLSearchParams({
    artist_name: song.lrclib.artist,
    track_name: song.lrclib.track,
    duration: String(song.lrclib.duration),
  });
  if (song.lrclib.album) params.set("album_name", song.lrclib.album);

  let track: LrclibTrack;
  try {
    const response = await fetch(`${LRCLIB_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: ONE_DAY_SECONDS },
    });
    if (response.status === 404) {
      return { ok: false, error: "No lyrics found for this song on LRCLIB." };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: `LRCLIB responded with ${response.status}. Try again later.`,
      };
    }
    track = (await response.json()) as LrclibTrack;
  } catch (error) {
    console.error("Failed to fetch lyrics from LRCLIB", error);
    return { ok: false, error: "Could not reach LRCLIB. Try again later." };
  }

  if (!track.syncedLyrics) {
    return { ok: false, error: "LRCLIB has no synced lyrics for this song." };
  }

  const durationSeconds = track.duration ?? song.lrclib.duration;
  const lines = buildKaraokeLines(parseLrc(track.syncedLyrics, song.offsetMs), {
    songEndMs: durationSeconds * 1000 + song.offsetMs,
  });
  if (!lines.length) {
    return { ok: false, error: "The synced lyrics are empty." };
  }

  return { ok: true, lines };
}
