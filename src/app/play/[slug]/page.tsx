import { Game } from "@/app/play/[slug]/_components/game";
import { Leaderboard } from "@/app/play/[slug]/_components/leaderboard";
import { Card, CardContent } from "@/components/ui/card";
import { getSong } from "@/lib/songs";
import { getSongLyrics } from "@/server/lyrics";
import { api, HydrateClient } from "@/trpc/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const song = getSong((await params).slug);
  return { title: song ? `${song.title} · KaraokeType` : "KaraokeType" };
}

export default async function PlayPage({ params }: Props) {
  const { slug } = await params;
  const song = getSong(slug);
  if (!song) notFound();

  const lyrics = await getSongLyrics(song);
  void api.score.top.prefetch({ songSlug: song.slug });

  const leaderboard = <Leaderboard songSlug={song.slug} />;

  return (
    <HydrateClient>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← KaraokeType
            </Link>
            <h1 className="text-2xl font-bold">{song.title}</h1>
            <p className="text-muted-foreground">{song.artist}</p>
          </div>
        </header>

        {lyrics.ok ? (
          <Game song={song} lines={lyrics.lines} sidebar={leaderboard} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardContent className="p-6">
                <p className="font-semibold">Lyrics unavailable</p>
                <p className="text-muted-foreground text-sm">{lyrics.error}</p>
              </CardContent>
            </Card>
            {leaderboard}
          </div>
        )}

        <footer className="text-muted-foreground text-xs">
          Synced lyrics from{" "}
          <a href="https://lrclib.net" className="underline">
            LRCLIB
          </a>
          . Playback via the YouTube embed.
        </footer>
      </main>
    </HydrateClient>
  );
}
