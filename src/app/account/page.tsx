import { DisplayNameForm } from "@/app/_components/display-name-form";
import { SignOutButton } from "@/app/_components/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeCallbackUrl } from "@/lib/callback-url";
import { hasDisplayName, publicDisplayName } from "@/lib/display-name";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Account · KaraokeType" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountPage({ searchParams }: Props) {
  const rawCallback = (await searchParams).callbackUrl;
  const callbackUrl =
    rawCallback === undefined ? undefined : safeCallbackUrl(rawCallback);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?callbackUrl=/account");

  const { user } = session;
  const named = hasDisplayName(user.name);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            ← Back to songs
          </Link>
          <h1 className="font-mono text-3xl font-bold">Account</h1>
        </div>
        <div className="text-muted-foreground flex shrink-0 flex-col items-end gap-1 text-sm">
          <span>{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {named ? "Display name" : "Pick a display name"}
          </CardTitle>
          <CardDescription>
            {named ? (
              <>
                Leaderboards show you as{" "}
                <span className="text-foreground font-medium">
                  {publicDisplayName(user.name, user.id)}
                </span>
                .
              </>
            ) : (
              <>
                You don&apos;t have a name yet, so leaderboards show you as{" "}
                <span className="text-foreground font-medium">
                  {publicDisplayName(user.name, user.id)}
                </span>
                . Your email is never shown.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm
            initialName={user.name}
            callbackUrl={callbackUrl}
            submitLabel={callbackUrl ? "Save and continue" : "Save"}
          />
          {callbackUrl && !named && (
            <Link
              href={callbackUrl}
              className="text-muted-foreground hover:text-foreground mt-4 inline-block text-sm underline"
            >
              Skip for now
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
