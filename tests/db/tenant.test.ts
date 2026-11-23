import { expect, it } from "vitest";
import { createDealer, EmailTakenError, listDealers } from "../../src/db/operator";
import { users } from "../../src/db/schema";
import { forDealer } from "../../src/db/tenant";
import { describeDb, useTestDb } from "../support/db";

describeDb("tenant isolation", () => {
  const db = useTestDb();

  async function setup() {
    const [op] = await db()
      .insert(users)
      .values({ role: "operator", email: "op@example.com" })
      .returning();
    const make = (name: string, email: string) =>
      createDealer(
        {
          name,
          city: "Mumbai",
          plan: "starter",
          languages: ["en"],
          branch: { name: `${name} Main` },
          admin: { name: `${name} Owner`, email },
        },
        op!.id,
        db(),
      );
    const a = await make("Alpha Motors", "alpha@example.com");
    const b = await make("Beta Cars", "beta@example.com");
    return { op: op!, a, b };
  }

  it("creates dealer, branch, admin and an audit entry together", async () => {
    const { a, op } = await setup();
    const t = forDealer(a.dealer.id, db());
    expect((await t.branches.list()).map((x) => x.name)).toEqual(["Alpha Motors Main"]);
    expect((await t.users.list()).map((x) => [x.email, x.role])).toEqual([
      ["alpha@example.com", "dealer_admin"],
    ]);
    const audit = await t.audit.list();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: op.id, action: "dealer.created" });
  });

  it("never returns another dealer's rows, or operators", async () => {
    const { a, b, op } = await setup();
    const ta = forDealer(a.dealer.id, db());

    const userIds = (await ta.users.list()).map((u) => u.id);
    expect(userIds).not.toContain(b.admin.id);
    expect(userIds).not.toContain(op.id);

    expect(await ta.users.get(b.admin.id)).toBeNull();
    expect(await ta.users.get(op.id)).toBeNull();
    expect(await ta.branches.get(b.branch.id)).toBeNull();
    expect((await ta.audit.list()).every((e) => e.dealerId === a.dealer.id)).toBe(true);
  });

  it("writes new rows under the scoped dealer only", async () => {
    const { a, b } = await setup();
    await forDealer(a.dealer.id, db()).branches.create({ name: "Thane" });
    expect((await forDealer(b.dealer.id, db()).branches.list()).map((x) => x.name)).toEqual([
      "Beta Cars Main",
    ]);
  });

  it("lists dealers with their own branch and user counts", async () => {
    const { a } = await setup();
    await forDealer(a.dealer.id, db()).branches.create({ name: "Thane" });
    const rows = await listDealers(db());
    const byName = Object.fromEntries(rows.map((r) => [r.name, [r.branchCount, r.userCount]]));
    expect(byName).toEqual({ "Alpha Motors": [2, 1], "Beta Cars": [1, 1] });
  });

  it("rejects a duplicate admin email and rolls back the dealer", async () => {
    const { op } = await setup();
    await expect(
      createDealer(
        {
          name: "Gamma",
          city: "Pune",
          plan: "pro",
          languages: ["en"],
          branch: { name: "Main" },
          admin: { name: "X", email: "ALPHA@example.com" },
        },
        op.id,
        db(),
      ),
    ).rejects.toBeInstanceOf(EmailTakenError);
    expect((await listDealers(db())).map((d) => d.name).sort()).toEqual(["Alpha Motors", "Beta Cars"]);
  });

  it("refuses an operator with a dealer, or a dealer user without one", async () => {
    const { a } = await setup();
    await expect(
      db().insert(users).values({ role: "operator", email: "x@example.com", dealerId: a.dealer.id }),
    ).rejects.toThrow();
    await expect(
      db().insert(users).values({ role: "salesperson", email: "y@example.com" }),
    ).rejects.toThrow();
  });

  it("refuses an empty dealer id", () => {
    expect(() => forDealer("", db())).toThrow();
  });
});
