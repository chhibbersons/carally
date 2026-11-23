import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { auth } from "./index";

/**
 * Authorization checks for pages and server actions. Call one of these at the
 * top of every protected page and every server action: the layout check alone
 * is not enough, because server actions can be called directly.
 */

export type Viewer = { userId: string; role: Role; dealerId: string | null; email: string };
export type DealerViewer = Viewer & { role: "dealer_admin" | "salesperson"; dealerId: string };

export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.role) return null;
  return { userId: u.id, role: u.role, dealerId: u.dealerId ?? null, email: u.email ?? "" };
}

/** Where a signed-in user lands. */
export function homePathFor(role: Role): string {
  return role === "operator" ? "/operator/dealers" : "/dashboard";
}

export async function requireOperator(): Promise<Viewer & { role: "operator" }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "operator") redirect(homePathFor(viewer.role));
  return viewer as Viewer & { role: "operator" };
}

export async function requireDealerUser(): Promise<DealerViewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role === "operator" || !viewer.dealerId) redirect(homePathFor(viewer.role));
  return viewer as DealerViewer;
}
