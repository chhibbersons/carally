import { requireOperator } from "@/auth/guards";
import { NewDealerForm } from "./new-dealer-form";

export default async function NewDealerPage() {
  await requireOperator();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New dealer</h1>
        <p className="text-sm text-muted-foreground">
          Adds the dealer, their first branch and the owner&apos;s login. You can add WhatsApp and
          stock details later.
        </p>
      </div>
      <NewDealerForm />
    </div>
  );
}
