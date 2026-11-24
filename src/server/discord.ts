import "server-only";

import { env } from "@/env";
import axios from "axios";

export async function sendDiscordMessage(message: string) {
  if (!env.DISCORD_WEBHOOK_URL) {
    console.warn("[discord] DISCORD_WEBHOOK_URL is not set, message not sent");
    return;
  }

  try {
    await axios.post(env.DISCORD_WEBHOOK_URL, {
      content: message,
      // Messages can contain user input: never ping @everyone/roles/users.
      allowed_mentions: { parse: [] },
    });
    console.info("[discord] message sent");
  } catch (error) {
    // Log only the status: the error object contains the webhook URL.
    console.error("[discord] sending message failed", {
      status: axios.isAxiosError(error) ? error.response?.status : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
