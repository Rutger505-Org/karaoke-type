/** Only same-origin paths, so a callback can't redirect off-site. */
export function safeCallbackUrl(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : "/";
}

/**
 * Where auth flows land after signing in: `/auth/continue` sends users
 * without a display name to `/account` first, others to `callbackUrl`.
 */
export function postSignInUrl(callbackUrl: string): string {
  return `/auth/continue?callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackUrl))}`;
}
