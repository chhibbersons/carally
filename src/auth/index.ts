import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { getDb } from "@/db/client";
import { findUserByEmail } from "@/db/operator";
import { accounts, sessions, users, verificationTokens, type Role } from "@/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { loginEmail } from "./emails";

/**
 * Auth.js: email magic-link login with sessions stored in Postgres.
 * There is no self sign-up. Only emails already in `users` (created by the
 * operator console or the seed) can get a login link.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  return {
    secret: e.AUTH_SECRET,
    trustHost: true,
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
    providers: [
      Nodemailer({
        // The transport lives in sendMail(); this value is only a placeholder
        // so the provider doesn't try to open its own connection.
        server: e.AUTH_EMAIL_SERVER ?? "smtp://localhost:25",
        from: e.AUTH_EMAIL_FROM ?? "DealerReply <no-reply@localhost>",
        maxAge: 15 * 60,
        normalizeIdentifier: (identifier) => identifier.trim().toLowerCase(),
        async sendVerificationRequest({ identifier, url }) {
          await sendMail({ to: identifier, ...loginEmail(url) });
        },
      }),
    ],
    callbacks: {
      async signIn({ user, email }) {
        // Runs both when a link is requested and when it is clicked.
        if (email?.verificationRequest) {
          const existing = user.email ? await findUserByEmail(user.email) : null;
          // Unknown emails get no link, but see the same "check your email"
          // page, so the login form doesn't reveal who has an account.
          return existing ? true : "/login/check-email";
        }
        return Boolean(user.email && (await findUserByEmail(user.email)));
      },
      session({ session, user }) {
        const u = user as typeof user & { role: Role; dealerId: string | null };
        session.user.id = u.id;
        session.user.role = u.role;
        session.user.dealerId = u.dealerId;
        return session;
      },
    },
  };
});
