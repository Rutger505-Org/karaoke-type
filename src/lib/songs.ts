export type Song = {
  slug: string;
  title: string;
  artist: string;
  /** YouTube video id, played through the official IFrame Player API. */
  youtubeId: string;
  /** Lookup parameters for https://lrclib.net/api/get. */
  lrclib: {
    artist: string;
    track: string;
    album?: string;
    /** Track duration in seconds; LRCLIB matches within ±2 seconds. */
    duration: number;
  };
  /**
   * Shift applied to every lyric timestamp, in milliseconds. Positive values
   * make lyrics appear later, e.g. when the video has a longer intro than the
   * audio track the lyrics were synced to.
   */
  offsetMs: number;
};

export const songs: Song[] = [
  {
    slug: "never-gonna-give-you-up",
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    youtubeId: "dQw4w9WgXcQ",
    lrclib: {
      artist: "Rick Astley",
      track: "Never Gonna Give You Up",
      duration: 214,
    },
    offsetMs: 0,
  },
];

export function getSong(slug: string): Song | undefined {
  return songs.find((song) => song.slug === slug);
}
