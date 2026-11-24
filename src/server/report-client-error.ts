"use server";

import { sendDiscordMessage } from "@/server/discord";

// Discord rejects messages over 2000 characters.
const MAX_LENGTH = 1900;

/**
 * Forwards an error caught in the browser to Discord for debugging.
 * Intentionally public (any visitor can call it); acceptable for now.
 */
export async function reportClientError(source: string, details: string) {
  const message = `Client error (${source}):\n${details}`.slice(0, MAX_LENGTH);
  console.warn("[client-error] reported", { source });
  await sendDiscordMessage(message);
}
