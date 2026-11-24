import { db } from "@/server/db";
import { adminEmail, user } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const row = await db.query.adminEmail.findFirst({
    where: eq(adminEmail.email, normalizeEmail(email)),
  });
  return !!row;
}

/**
 * Admin = whitelisted email that the user proved to own (magic link sets
 * emailVerified; a password sign-up with someone else's address doesn't).
 */
export async function isAdmin(sessionUser: {
  email: string;
  emailVerified: boolean;
}): Promise<boolean> {
  return sessionUser.emailVerified && (await isAdminEmail(sessionUser.email));
}

export async function userExists(email: string): Promise<boolean> {
  const row = await db.query.user.findFirst({
    where: eq(user.email, normalizeEmail(email)),
    columns: { id: true },
  });
  return !!row;
}
