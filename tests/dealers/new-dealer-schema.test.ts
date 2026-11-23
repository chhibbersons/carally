import { describe, expect, it } from "vitest";
import { fieldErrors, formDataToNewDealer, newDealerSchema } from "@/dealers/new-dealer-schema";

function form(values: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

const valid = {
  name: "Shree Cars",
  city: "Pune",
  plan: "growth",
  languages: ["en", "mr", "mr"],
  branchName: "Baner",
  branchAddress: "",
  branchMapsUrl: "",
  adminName: "Amit Shah",
  adminEmail: " Amit@ShreeCars.in ",
};

describe("newDealerSchema", () => {
  it("parses a valid form", () => {
    const r = newDealerSchema.parse(formDataToNewDealer(form(valid)));
    expect(r.adminEmail).toBe("amit@shreecars.in");
    expect(r.languages).toEqual(["en", "mr"]);
    expect(r.branchAddress).toBeNull();
    expect(r.branchMapsUrl).toBeNull();
  });

  it("reports one plain-English error per field", () => {
    const r = newDealerSchema.safeParse(
      formDataToNewDealer(form({ ...valid, name: "", languages: [], adminEmail: "nope", plan: "gold" })),
    );
    expect(r.success).toBe(false);
    const errors = fieldErrors(r.error!);
    expect(errors.name).toMatch(/business name/);
    expect(errors.languages).toMatch(/at least one/);
    expect(errors.adminEmail).toMatch(/valid email/);
    expect(errors.plan).toBeDefined();
  });

  it("rejects non-https map links", () => {
    const r = newDealerSchema.safeParse(
      formDataToNewDealer(form({ ...valid, branchMapsUrl: "javascript:alert(1)" })),
    );
    expect(r.success).toBe(false);
  });
});
