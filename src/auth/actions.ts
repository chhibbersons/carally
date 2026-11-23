"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "./index";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export type LoginState = { error?: string };

export async function requestLoginLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  // Sends the link (or nothing, for unknown emails). Both cases show the same page.
  await signIn("nodemailer", { email: parsed.data, redirectTo: "/", redirect: false });
  redirect("/login/check-email");
}

export async function logOut() {
  await signOut({ redirectTo: "/login" });
}
