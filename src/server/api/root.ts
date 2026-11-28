import { accountRouter } from "@/server/api/routers/account";
import { scoreRouter } from "@/server/api/routers/score";
import { songRequestRouter } from "@/server/api/routers/song-request";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  account: accountRouter,
  score: scoreRouter,
  songRequest: songRequestRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.score.top({ songSlug: "..." });
 */
export const createCaller = createCallerFactory(appRouter);
