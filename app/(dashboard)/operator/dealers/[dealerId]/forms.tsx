"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ActionState } from "./actions";

type BoundAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Field(props: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.hint && !props.error && <p className="text-xs text-muted-foreground">{props.hint}</p>}
      {props.error && <p className="text-sm text-destructive">{props.error}</p>}
    </div>
  );
}

function Result({ state }: { state: ActionState }) {
  if (state.errors?.form) {
    return (
      <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        {state.errors.form}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="rounded-md border border-success/40 p-3 text-sm text-success">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function WhatsAppSettingsForm(props: {
  action: BoundAction;
  phoneNumberId: string | null;
  wabaId: string | null;
  hasOwnToken: boolean;
}) {
  const [state, action, pending] = useActionState(props.action, {});
  const e = state.errors ?? {};
  const v = state.values;
  return (
    // key re-applies the submitted values, since React resets a form after its action runs
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(v ?? {})}>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="whatsappPhoneNumberId" label="Phone number ID" error={e.whatsappPhoneNumberId}
          hint="Meta app › WhatsApp › API Setup. Not the phone number itself.">
          <Input id="whatsappPhoneNumberId" name="whatsappPhoneNumberId" inputMode="numeric" required
            defaultValue={v?.whatsappPhoneNumberId ?? props.phoneNumberId ?? ""} />
        </Field>
        <Field id="wabaId" label="WhatsApp Business Account ID (optional)" error={e.wabaId}>
          <Input id="wabaId" name="wabaId" inputMode="numeric" defaultValue={v?.wabaId ?? props.wabaId ?? ""} />
        </Field>
      </div>
      <Field id="accessToken" label="Access token (optional)" error={e.accessToken}
        hint={props.hasOwnToken
          ? "A token is saved (encrypted). Leave empty to keep it, or paste a new one to replace it."
          : "Leave empty to use the platform token (WA_SYSTEM_USER_TOKEN). A pasted token is stored encrypted."}>
        <Input id="accessToken" name="accessToken" type="password" autoComplete="off" />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

export function TestSendForm({ action: bound }: { action: BoundAction }) {
  const [state, action, pending] = useActionState(bound, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(state.values ?? {})}>
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label="Send to (your own mobile)" error={e.phone}>
          <Input id="phone" name="phone" type="tel" required placeholder="98765 43210" defaultValue={state.values?.phone} />
        </Field>
        <Field id="kind" label="Message">
          <Select id="kind" name="kind" defaultValue={state.values?.kind ?? "hello_world"}>
            <option value="hello_world">&quot;Hello World&quot; template (works any time)</option>
            <option value="text">My own text (only within 24 hours of a message from that phone)</option>
          </Select>
        </Field>
      </div>
      <Field id="text" label="Text (for &quot;My own text&quot;)" error={e.text}>
        <Input id="text" name="text" defaultValue={state.values?.text} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send test message"}</Button>
      </div>
    </form>
  );
}
