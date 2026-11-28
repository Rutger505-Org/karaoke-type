import { safeCallbackUrl } from "@/lib/callback-url";
import { hasDisplayName } from "@/lib/display-name";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Landing after every sign-in/sign-up: users without a display name (e.g.
 * magic-link sign-ups) pick one on /account first, then continue.
 */
export default async function ContinuePage({ searchParams }: Props) {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    console.warn("[auth] continue without session, back to sign-in");
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  if (!hasDisplayName(session.user.name)) {
    console.info("[auth] no display name, redirecting to account", {
      userId: session.user.id,
    });
    redirect(`/account?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  redirect(callbackUrl);
}
