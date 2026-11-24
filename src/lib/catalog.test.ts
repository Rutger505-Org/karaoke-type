import { indexSchema, songSchema, toSong } from "@/lib/catalog";
import { describe, expect, test } from "bun:test";

// Made-up song only: never put real song lyrics in this repo.
const SONG = {
  schema: 1,
  slug: "tiny-robot",
  title: "Tiny Robot",
  artist: "Test Artist",
  durationMs: 30000,
  source: { youtubeId: "x", lrclibId: 1 },
  audio: {
    key: "audio/tiny-robot/abc.m4a",
    url: "https://cdn.example.com/karaoke/audio/tiny-robot/abc.m4a",
    sha256: "abc",
    durationMs: 30000,
  },
  offsetMs: -200,
  compiledAt: "2026-01-01T00:00:00+00:00",
  compiler: "songc 0.1.0",
  lines: [
    {
      startMs: 1000,
      endMs: 2000,
      text: "Beep boop",
      origin: "aligned",
      confidence: 0.9,
      locked: false,
      words: [
        { text: "Beep", startMs: 1000, endMs: 1500, score: 0.9 },
        { text: "boop", startMs: 1500, endMs: 2000, score: 0.8 },
      ],
    },
  ],
};

describe("songSchema", () => {
  test("accepts schema 1 and rejects other versions", () => {
    expect(songSchema.safeParse(SONG).success).toBe(true);
    expect(songSchema.safeParse({ ...SONG, schema: 2 }).success).toBe(false);
  });

  test("index rejects other versions", () => {
    expect(indexSchema.safeParse({ schema: 1, songs: [] }).success).toBe(true);
    expect(indexSchema.safeParse({ schema: 2, songs: [] }).success).toBe(false);
  });
});

describe("toSong", () => {
  test("applies offsetMs to lines and words", () => {
    const song = toSong(songSchema.parse(SONG));
    expect(song.audioUrl).toBe(SONG.audio.url);
    expect(song.lines[0]).toMatchObject({
      startMs: 800,
      sungEndMs: 1800,
      text: "Beep boop",
    });
    expect(song.lines[0]?.words.map((w) => w.startMs)).toEqual([800, 1300]);
  });
});
