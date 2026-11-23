"use client";

import { useActionState } from "react";
import { requestLoginLink, type LoginState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginLink, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          aria-invalid={Boolean(state.error)}
        />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a login link"}
      </Button>
    </form>
  );
}
