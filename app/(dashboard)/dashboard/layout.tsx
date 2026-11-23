import { requireDealerUser } from "@/auth/guards";
import { AppHeader } from "@/components/app-header";
import { forDealer } from "@/db/tenant";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const viewer = await requireDealerUser();
  const dealer = await forDealer(viewer.dealerId).dealer.get();
  return (
    <>
      <AppHeader title={dealer?.name ?? "DealerReply"} email={viewer.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
