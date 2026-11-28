import { env } from "@/env";
import { displayNameSchema } from "@/lib/display-name";
import { isAdminEmail, userExists } from "@/server/admin";
import { db } from "@/server/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: env.AUTH_EMAIL_HOST,
  port: env.AUTH_EMAIL_PORT,
  auth: {
    user: env.AUTH_EMAIL_USER,
    pass: env.AUTH_EMAIL_PASSWORD,
  },
  secure: true,
});

/**
 * Server-side guard for names set through any Better Auth endpoint (sign-up,
 * update-user), so they can't bypass the /account validation. Empty is only
 * allowed on create (magic-link sign-up has no name; /auth/continue asks).
 */
function normalizeName(
  name: unknown,
  { allowEmpty }: { allowEmpty: boolean },
): string {
  if (allowEmpty && (typeof name !== "string" || !name.trim())) return "";
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) {
    console.warn("[auth] rejected invalid display name", {
      length: typeof name === "string" ? name.length : null,
      issue: parsed.error.issues[0]?.message,
    });
    throw new APIError("BAD_REQUEST", {
      message: `Invalid name: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    });
  }
  return parsed.data;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const name = normalizeName(newUser.name, { allowEmpty: true });
          console.info("[auth] creating user", { hasName: !!name });
          return { data: { ...newUser, name } };
        },
      },
      update: {
        before: async (data) => {
          if (!("name" in data)) return;
          return {
            data: {
              ...data,
              name: normalizeName(data.name, { allowEmpty: false }),
            },
          };
        },
      },
    },
  },
  plugins: [
    magicLink({
      // Sign-up via magic link is only meant for whitelisted admins; the
      // check happens below because disableSignUp can't be per email.
      disableSignUp: false,

      sendMagicLink: async ({ email, url }) => {
        if (!(await userExists(email)) && !(await isAdminEmail(email))) {
          // Silently skip (no error) so the form doesn't reveal which
          // addresses have an account.
          console.info(
            "[auth] magic link not sent: no account and not an admin email",
          );
          return;
        }

        const result = await transporter.sendMail({
          to: email,
          from: `${env.AUTH_EMAIL_FROM} <${env.AUTH_EMAIL_USER}>`,
          subject: "Your sign-in link",
          text: `Click to sign in: ${url}\nThis link expires in 6 minutes.`,
          html: `<p>Click to sign in: <a href="${url}">${url}</a> this link expires in 6 minutes</p>`,
        });

        if (result.rejected.length || !result.messageId) {
          console.error("[auth] magic link email send failed", {
            rejected: result.rejected.length,
            messageId: result.messageId,
          });
          throw new Error("Failed to send email");
        }
      },
    }),
  ],
});
