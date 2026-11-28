import { publicDisplayName } from "@/lib/display-name";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { isPublishedSong } from "@/server/catalog";
import { score, user } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const songSlug = z.string().min(1).max(100);

export const scoreRouter = createTRPCRouter({
  submit: protectedProcedure
    .input(
      z.object({
        songSlug,
        score: z.number().int().min(0).max(10_000_000),
        accuracy: z.number().min(0).max(100),
        wpm: z.number().min(0).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const published = await isPublishedSong(input.songSlug);
      if (published === null) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Song catalog unavailable, try again later",
        });
      }
      if (!published) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown song" });
      }

      const [row] = await ctx.db
        .insert(score)
        .values({ ...input, userId: ctx.session.user.id })
        .returning({ id: score.id });

      return { id: row?.id };
    }),

  /** Top 10 for a song, only each user's best score. */
  top: publicProcedure
    .input(z.object({ songSlug }))
    .query(async ({ ctx, input }) => {
      const ranked = ctx.db
        .select({
          userId: score.userId,
          score: score.score,
          accuracy: score.accuracy,
          wpm: score.wpm,
          createdAt: score.createdAt,
          rank: sql<number>`row_number() over (partition by ${score.userId} order by ${score.score} desc, ${score.createdAt} asc, ${score.id} asc)`.as(
            "rank",
          ),
        })
        .from(score)
        .where(eq(score.songSlug, input.songSlug))
        .as("ranked");

      const rows = await ctx.db
        .select({
          userId: ranked.userId,
          name: user.name,
          score: ranked.score,
          accuracy: ranked.accuracy,
          wpm: ranked.wpm,
          createdAt: ranked.createdAt,
        })
        .from(ranked)
        .innerJoin(user, eq(user.id, ranked.userId))
        .where(eq(ranked.rank, 1))
        .orderBy(desc(ranked.score), asc(ranked.createdAt))
        .limit(10);

      // Never empty and never the (private) email.
      return rows.map((row) => ({
        ...row,
        name: publicDisplayName(row.name, row.userId),
      }));
    }),
});
