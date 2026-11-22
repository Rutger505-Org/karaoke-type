"use client";

import { useSession } from "@/client/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

export function Leaderboard({ songSlug }: Readonly<{ songSlug: string }>) {
  const { data: session } = useSession();
  const {
    data: scores,
    isPending,
    isError,
  } = api.score.top.useQuery({
    songSlug,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-red-400">Couldn&apos;t load scores.</p>
        ) : scores.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No scores yet. Be the first!
          </p>
        ) : (
          <ol className="flex flex-col gap-1 font-mono text-sm">
            {scores.map((entry, index) => (
              <li
                key={entry.userId}
                className={cn(
                  "grid grid-cols-[2ch_minmax(0,1fr)_auto] items-baseline gap-3 rounded px-2 py-1",
                  entry.userId === session?.user.id && "bg-emerald-500/10",
                )}
              >
                <span className="text-muted-foreground">{index + 1}</span>
                <span className="truncate">{entry.name || "anonymous"}</span>
                <span className="text-right tabular-nums">
                  {entry.score.toLocaleString("en-US")}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {entry.accuracy.toFixed(0)}% · {entry.wpm.toFixed(0)} wpm
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
