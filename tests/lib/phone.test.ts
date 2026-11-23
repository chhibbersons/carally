import { describe, expect, it } from "vitest";
import { maskPhone, maskPhonesInText, toE164 } from "@/lib/phone";

describe("toE164", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["(+91) 98765 43210", "+919876543210"],
    ["+14155552671", "+14155552671"],
  ])("normalises %s", (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each(["", "12345", "5876543210", "+91 5876543210", "abc", "+91 98765"])(
    "rejects %s",
    (input) => {
      expect(toE164(input)).toBeNull();
    },
  );
});

describe("maskPhone", () => {
  it("keeps only the last four digits", () => {
    expect(maskPhone("+919876543210")).toBe("+91******3210");
    expect(maskPhone("+14155552671")).toBe("******2671");
  });
});

describe("maskPhonesInText", () => {
  it("masks numbers inside a sentence", () => {
    const out = maskPhonesInText("Lead from +91 98765 43210 about Creta");
    expect(out).not.toContain("98765");
    expect(out).toContain("3210");
  });

  it("leaves short numbers alone", () => {
    expect(maskPhonesInText("Creta 2019, 45000 km, ₹9.5 lakh")).toBe(
      "Creta 2019, 45000 km, ₹9.5 lakh",
    );
  });
});
