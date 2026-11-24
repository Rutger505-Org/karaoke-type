import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { sendDiscordMessage } from "@/server/discord";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ path, error }) => {
      const where = path ?? "<no-path>";
      if (error.code !== "INTERNAL_SERVER_ERROR") {
        console.debug(`[trpc] ${where} failed: ${error.code}`);
        return;
      }
      console.error(`[trpc] ${where} failed: ${error.message}`, error.cause);
      void sendDiscordMessage(
        `tRPC error on \`${where}\`: ${error.message.slice(0, 500)}`,
      );
    },
  });

export { handler as GET, handler as POST };
