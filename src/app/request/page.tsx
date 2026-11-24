import { RequestForm } from "@/app/request/_components/request-form";
import Link from "next/link";

export const metadata = { title: "Request a song · KaraokeType" };

export default function RequestPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-sm underline"
        >
          ← Back to songs
        </Link>
        <h1 className="font-mono text-3xl font-bold">Request a song</h1>
        <p className="text-muted-foreground">
          Missing a song? Tell us which one. Requests are added by hand, so it
          can take a while.
        </p>
      </header>
      <RequestForm />
    </main>
  );
}
