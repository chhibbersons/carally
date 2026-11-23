import { requireOperator } from "@/auth/guards";
import { AppHeader } from "@/components/app-header";

export default async function OperatorLayout({ children }: LayoutProps<"/operator">) {
  const viewer = await requireOperator();
  return (
    <>
      <AppHeader
        title="DealerReply · Operator"
        email={viewer.email}
        links={[{ href: "/operator/dealers", label: "Dealers" }]}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
