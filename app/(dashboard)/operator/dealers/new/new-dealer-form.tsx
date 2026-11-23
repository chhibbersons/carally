"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createDealerAction, type NewDealerState } from "./actions";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
  { value: "mr", label: "Marathi" },
] as const;

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter · ₹15k/month" },
  { value: "growth", label: "Growth · ₹35k/month" },
  { value: "pro", label: "Pro · ₹60k/month" },
] as const;

export function NewDealerForm() {
  const [state, action, pending] = useActionState<NewDealerState, FormData>(
    createDealerAction,
    {},
  );
  const e = state.errors ?? {};
  const v = (k: string) => {
    const val = state.values?.[k];
    return typeof val === "string" ? val : undefined;
  };
  const langs = Array.isArray(state.values?.languages)
    ? (state.values.languages as string[])
    : ["en", "hi"];

  return (
    // key resets defaultValues when the server sends back an error
    <form action={action} className="flex flex-col gap-6" key={JSON.stringify(state.values ?? {})}>
      {state.formError && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dealer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Business name" error={e.name}>
            <Input id="name" name="name" required defaultValue={v("name")} aria-invalid={!!e.name} />
          </Field>
          <Field id="city" label="City" error={e.city}>
            <Input id="city" name="city" required defaultValue={v("city")} aria-invalid={!!e.city} />
          </Field>
          <Field id="plan" label="Plan" error={e.plan}>
            <Select id="plan" name="plan" defaultValue={v("plan") ?? "starter"}>
              {PLAN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Reply languages</legend>
            <div className="flex flex-wrap gap-4">
              {LANGUAGE_OPTIONS.map((l) => (
                <label key={l.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="languages"
                    value={l.value}
                    defaultChecked={langs.includes(l.value)}
                  />
                  {l.label}
                </label>
              ))}
            </div>
            {e.languages && <p className="text-sm text-destructive">{e.languages}</p>}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>First branch</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="branchName" label="Branch name" error={e.branchName}>
            <Input
              id="branchName"
              name="branchName"
              required
              placeholder="Andheri"
              defaultValue={v("branchName")}
              aria-invalid={!!e.branchName}
            />
          </Field>
          <Field id="branchMapsUrl" label="Google Maps link (optional)" error={e.branchMapsUrl}>
            <Input
              id="branchMapsUrl"
              name="branchMapsUrl"
              type="url"
              placeholder="https://maps.app.goo.gl/…"
              defaultValue={v("branchMapsUrl")}
              aria-invalid={!!e.branchMapsUrl}
            />
          </Field>
          <Field id="branchAddress" label="Address (optional)" error={e.branchAddress} wide>
            <Input id="branchAddress" name="branchAddress" defaultValue={v("branchAddress")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner login</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="adminName" label="Owner's name" error={e.adminName}>
            <Input
              id="adminName"
              name="adminName"
              required
              defaultValue={v("adminName")}
              aria-invalid={!!e.adminName}
            />
          </Field>
          <Field id="adminEmail" label="Owner's email" error={e.adminEmail}>
            <Input
              id="adminEmail"
              name="adminEmail"
              type="email"
              required
              defaultValue={v("adminEmail")}
              aria-invalid={!!e.adminEmail}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create dealer"}
        </Button>
        <Link href="/operator/dealers" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field(props: {
  id: string;
  label: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${props.wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.error && <p className="text-sm text-destructive">{props.error}</p>}
    </div>
  );
}
