import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { forDealer } from "@/db/tenant";
import { env } from "@/lib/env";
import { maskPhone } from "@/lib/phone";
import { formatIST } from "@/lib/time";
import { saveWhatsAppAction, sendTestAction } from "./actions";
import { TestSendForm, WhatsAppSettingsForm } from "./forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DealerPage({ params }: PageProps<"/operator/dealers/[dealerId]">) {
  await requireOperator();
  const { dealerId } = await params;
  if (!UUID.test(dealerId)) notFound();

  const t = forDealer(dealerId);
  const dealer = await t.dealer.get();
  if (!dealer) notFound();
  const recent = await t.messages.recent(20);
  const connected = !!dealer.whatsappPhoneNumberId;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/operator/dealers" className="text-sm text-muted-foreground hover:underline">
          ← Dealers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{dealer.name}</h1>
        <p className="text-sm text-muted-foreground">
          {dealer.city} · <span className="capitalize">{dealer.plan}</span> plan
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            WhatsApp <Badge>{connected ? "Connected" : "Not connected"}</Badge>
          </CardTitle>
          <CardDescription>
            In your Meta app, set the webhook URL to{" "}
            <code className="rounded bg-muted px-1">{env().APP_URL}/api/webhooks/whatsapp</code>, the verify
            token to your <code className="rounded bg-muted px-1">WA_VERIFY_TOKEN</code>, and subscribe to
            &quot;messages&quot;. See docs/whatsapp-setup.md.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsAppSettingsForm
            action={saveWhatsAppAction.bind(null, dealer.id)}
            phoneNumberId={dealer.whatsappPhoneNumberId}
            wabaId={dealer.wabaId}
            hasOwnToken={!!dealer.waAccessTokenEnc}
          />
        </CardContent>
      </Card>

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle>Send a test message</CardTitle>
            <CardDescription>
              Sends from this dealer&apos;s number. With Meta&apos;s test number, the phone must first be added
              as a recipient in the Meta app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestSendForm action={sendTestAction.bind(null, dealer.id)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent WhatsApp messages</CardTitle>
          <CardDescription>The latest 20, newest first. Refresh the page to see new ones.</CardDescription>
        </CardHeader>
        {recent.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Billed as</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map(({ message: m, phoneE164, optedOut }) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatIST(m.createdAt)}</TableCell>
                  <TableCell>{m.direction === "in" ? "Received" : `Sent (${m.sender})`}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {maskPhone(phoneE164)}
                    {optedOut && <span className="ml-1 text-xs text-destructive">opted out</span>}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {m.templateName ? `Template: ${m.templateName}` : (m.body ?? `[${m.type}]`)}
                  </TableCell>
                  <TableCell>
                    {m.direction === "out" ? (m.status ?? "") : ""}
                    {m.error && <span className="block text-xs text-destructive">{m.error}</span>}
                  </TableCell>
                  <TableCell className="capitalize">{m.costCategory ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
