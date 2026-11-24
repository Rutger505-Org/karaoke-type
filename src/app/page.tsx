import { CreditFooter } from "@/app/_components/credit-footer";
import { SignOutButton } from "@/app/_components/sign-out-button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/server/auth";
import { getSongIndex } from "@/server/catalog";
import { headers } from "next/headers";
import Link from "next/link";

export default async function Home() {
  const [session, index] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getSongIndex(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-mono text-4xl font-bold">KaraokeType</h1>
          <p className="text-muted-foreground max-w-lg">
            A song plays and its lyrics appear line by line. Type each line
            while it&apos;s being sung: accuracy scores points, finishing a line
            perfectly before it ends scores a bonus, and perfect lines in a row
            build a combo.
          </p>
        </div>
        <div className="text-muted-foreground flex shrink-0 flex-col items-end gap-1 text-sm">
          {session ? (
            <>
              <span>{session.user.name || session.user.email}</span>
              <SignOutButton />
            </>
          ) : (
            <Link href="/sign-in" className="hover:text-foreground underline">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-sm tracking-wider uppercase">
          Songs
        </h2>
        {!index.ok ? (
          <Card>
            <CardHeader>
              <CardTitle>Songs unavailable</CardTitle>
              <CardDescription>{index.error} Try again later.</CardDescription>
            </CardHeader>
          </Card>
        ) : index.songs.length === 0 ? (
          <p className="text-muted-foreground">No songs published yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {index.songs.map((song) => (
              <li key={song.slug}>
                <Link href={`/play/${song.slug}`} className="group block">
                  <Card className="group-hover:border-foreground/40 transition-colors">
                    <CardHeader>
                      <CardTitle>{song.title}</CardTitle>
                      <CardDescription>{song.artist}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreditFooter />
    </main>
  );
}
