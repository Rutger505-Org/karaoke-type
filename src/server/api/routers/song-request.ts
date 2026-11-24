import { normalizeEmail } from "@/server/admin";
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";
import {
  adminEmail,
  songRequest,
  songRequestStatuses,
  user,
} from "@/server/db/schema";
import { sendDiscordMessage } from "@/server/discord";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const link = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "Link must be http(s)")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Escape Discord markdown so user input can't format/break the message. */
function discordEscape(text: string): string {
  return text.replace(/([\\*_~`|>#\[\]()-])/g, "\\$1");
}

function originFromHeaders(headers: Headers): string | undefined {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return undefined;
  const proto =
    headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const songRequestRouter = createTRPCRouter({
  /** Anyone may request a song; signed-in requests remember the user. */
  create: publicProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        artist: z.string().trim().min(1).max(200),
        link,
        note: optionalText(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sessionUser = ctx.session?.user;
      const [row] = await ctx.db
        .insert(songRequest)
        .values({ ...input, userId: sessionUser?.id ?? null })
        .returning({ id: songRequest.id });
      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      console.info("[song-request] created", {
        id: row.id,
        anonymous: !sessionUser,
      });

      const origin = originFromHeaders(ctx.headers);
      const lines = [
        `🎤 **New song request #${row.id}**`,
        `${discordEscape(input.title)} by ${discordEscape(input.artist)}`,
        input.link ? `<${input.link}>` : undefined,
        input.note
          ? `> ${discordEscape(input.note).replace(/\n/g, "\n> ")}`
          : undefined,
        `From: ${sessionUser ? discordEscape(sessionUser.name || sessionUser.email) : "anonymous"}`,
        origin ? `<${origin}/admin>` : undefined,
      ];
      void sendDiscordMessage(lines.filter(Boolean).join("\n"));

      return { id: row.id };
    }),

  list: adminProcedure
    .input(z.object({ status: z.enum(songRequestStatuses).optional() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select({
          id: songRequest.id,
          title: songRequest.title,
          artist: songRequest.artist,
          link: songRequest.link,
          note: songRequest.note,
          status: songRequest.status,
          createdAt: songRequest.createdAt,
          requester: user.name,
          requesterEmail: user.email,
        })
        .from(songRequest)
        .leftJoin(user, eq(songRequest.userId, user.id))
        .where(input.status ? eq(songRequest.status, input.status) : undefined)
        .orderBy(desc(songRequest.createdAt), desc(songRequest.id)),
    ),

  setStatus: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(songRequestStatuses),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(songRequest)
        .set({ status: input.status })
        .where(eq(songRequest.id, input.id))
        .returning({ id: songRequest.id });
      if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
      console.info("[song-request] status changed", {
        id: input.id,
        status: input.status,
        by: ctx.session.user.id,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(songRequest).where(eq(songRequest.id, input.id));
      console.info("[song-request] deleted", {
        id: input.id,
        by: ctx.session.user.id,
      });
    }),

  admins: adminProcedure.query(({ ctx }) =>
    ctx.db.select().from(adminEmail).orderBy(asc(adminEmail.createdAt)),
  ),

  addAdmin: adminProcedure
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      await ctx.db
        .insert(adminEmail)
        .values({ email, addedBy: normalizeEmail(ctx.session.user.email) })
        .onConflictDoNothing();
      console.info("[admin] admin email added", { by: ctx.session.user.id });
    }),

  removeAdmin: adminProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      if (email === normalizeEmail(ctx.session.user.email)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't remove your own admin access",
        });
      }
      await ctx.db.delete(adminEmail).where(eq(adminEmail.email, email));
      console.info("[admin] admin email removed", { by: ctx.session.user.id });
    }),
});
