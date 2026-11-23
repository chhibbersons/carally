import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Sends transactional email (login links, invites) over SMTP. Postmark's SMTP
 * server works here, so one vendor covers this and inbound lead email.
 *
 * Without AUTH_EMAIL_SERVER (local development only; production refuses to
 * boot without it), the email is printed to the console instead of sent.
 */

export type Mail = { to: string; subject: string; text: string; html?: string };

let transporter: Transporter | undefined;

export async function sendMail(mail: Mail): Promise<void> {
  const { AUTH_EMAIL_SERVER, AUTH_EMAIL_FROM } = env();

  if (!AUTH_EMAIL_SERVER) {
    console.info(
      `\n--- Email (not sent: AUTH_EMAIL_SERVER is not set) ---\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n------------------------------------------------------\n`,
    );
    return;
  }

  transporter ??= nodemailer.createTransport(AUTH_EMAIL_SERVER);
  const info = await transporter.sendMail({ from: AUTH_EMAIL_FROM, ...mail });
  logger.info({ messageId: info.messageId, subject: mail.subject }, "email sent");
}
