import { requireDealerUser } from "@/auth/guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forDealer } from "@/db/tenant";

export default async function DashboardPage() {
  const viewer = await requireDealerUser();
  const t = forDealer(viewer.dealerId);
  const [dealer, branchRows] = await Promise.all([t.dealer.get(), t.branches.list()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Welcome to {dealer?.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your setup is in progress</CardTitle>
          <CardDescription>
            Leads, conversations, stock and reports will appear here once WhatsApp is connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h2 className="mb-2 text-sm font-medium">Branches</h2>
          <ul className="text-sm text-muted-foreground">
            {branchRows.map((b) => (
              <li key={b.id}>
                {b.name}
                {b.address ? `, ${b.address}` : ""}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
