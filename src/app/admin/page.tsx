import { SignOutButton } from "@/app/_components/sign-out-button";
import { AdminPanel } from "@/app/admin/_components/admin-panel";
import { isAdmin } from "@/server/admin";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Admin · KaraokeType" };

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?callbackUrl=/admin");

  const admin = await isAdmin(session.user);

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
          <h1 className="font-mono text-3xl font-bold">Admin</h1>
        </div>
        <div className="text-muted-foreground flex shrink-0 flex-col items-end gap-1 text-sm">
          <span>{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      {admin ? (
        <AdminPanel currentEmail={session.user.email.toLowerCase()} />
      ) : (
        <p className="text-muted-foreground">
          This account has no admin access. Admins sign in with a magic link
          sent to a whitelisted email address.
        </p>
      )}
    </main>
  );
}
