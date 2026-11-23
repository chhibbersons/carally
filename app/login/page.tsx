import { redirect } from "next/navigation";
import { getViewer, homePathFor } from "@/auth/guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  AccessDenied: "That email doesn't have an account. Ask your DealerReply contact to add you.",
  Verification: "That login link has expired or was already used. Request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect(homePathFor(viewer.role));

  const { error } = await searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? "Something went wrong. Please try again.") : null;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in to DealerReply</CardTitle>
          <CardDescription>We&apos;ll email you a link. No password needed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {message && (
            <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              {message}
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
