import Link from "next/link";
import { requireOperator } from "@/auth/guards";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listDealers } from "@/db/operator";
import { formatDateIST } from "@/lib/time";

export default async function DealersPage({ searchParams }: PageProps<"/operator/dealers">) {
  await requireOperator();
  const [dealerRows, { created }] = await Promise.all([listDealers(), searchParams]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dealers</h1>
          <p className="text-sm text-muted-foreground">
            {dealerRows.length} {dealerRows.length === 1 ? "dealer" : "dealers"}
          </p>
        </div>
        <Link href="/operator/dealers/new" className={buttonVariants()}>
          New dealer
        </Link>
      </div>

      {typeof created === "string" && (
        <p role="status" className="rounded-md border border-success/40 p-3 text-sm text-success">
          Dealer created. We emailed the owner how to log in.
        </p>
      )}

      <Card>
        {dealerRows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No dealers yet. Create your first one to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Branches</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>AI replies</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dealerRows.map((d) => (
                <TableRow key={d.id} className={d.id === created ? "bg-muted/60" : undefined}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.city}</TableCell>
                  <TableCell>
                    <Badge className="capitalize">{d.plan}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.branchCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.userCount}</TableCell>
                  <TableCell>{d.aiEnabled ? "On" : "Off"}</TableCell>
                  <TableCell>{formatDateIST(d.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
