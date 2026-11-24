import { CreditFooter } from "@/app/_components/credit-footer";
import { Game } from "@/app/play/[slug]/_components/game";
import { Leaderboard } from "@/app/play/[slug]/_components/leaderboard";
import { Card, CardContent } from "@/components/ui/card";
import { getSong } from "@/server/catalog";
import { api, HydrateClient } from "@/trpc/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getSong((await params).slug);
  return {
    title: result.ok ? `${result.song.title} · KaraokeType` : "KaraokeType",
  };
}

export default async function PlayPage({ params }: Props) {
  const { slug } = await params;
  const result = await getSong(slug);
  if (!result.ok && "notFound" in result) notFound();

  await api.score.top.prefetch({ songSlug: slug });
  const leaderboard = <Leaderboard key="leaderboard" songSlug={slug} />;

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
            {result.ok && (
              <>
                <h1 className="text-2xl font-bold">{result.song.title}</h1>
                <p className="text-muted-foreground">{result.song.artist}</p>
              </>
            )}
          </div>
        </header>

        {result.ok ? (
          <Game song={result.song} sidebar={leaderboard} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardContent className="p-6">
                <p className="font-semibold">Song unavailable</p>
                <p className="text-muted-foreground text-sm">
                  {result.error} Try again later.
                </p>
              </CardContent>
            </Card>
            {leaderboard}
          </div>
        )}

        <CreditFooter />
      </main>
    </HydrateClient>
  );
}
