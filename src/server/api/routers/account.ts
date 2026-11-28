import { displayNameSchema, publicDisplayName } from "@/lib/display-name";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { user } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const accountRouter = createTRPCRouter({
  /** Sets the display name shown on leaderboards. */
  setName: protectedProcedure
    .input(z.object({ name: displayNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const hadName = !!ctx.session.user.name.trim();

      const [row] = await ctx.db
        .update(user)
        .set({ name: input.name })
        .where(eq(user.id, userId))
        .returning({ id: user.id, name: user.name });

      if (!row) {
        console.error("[account] display name update matched no user", {
          userId,
        });
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      console.info(
        hadName
          ? "[account] display name changed"
          : "[account] display name set",
        { userId, length: row.name.length },
      );
      return { name: publicDisplayName(row.name, row.id) };
    }),
});
