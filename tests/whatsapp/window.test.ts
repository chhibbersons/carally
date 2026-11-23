import { describe, expect, it } from "vitest";
import { decideSend, isQuietHours, isWindowOpen, istHour, windowClosesAt } from "../../src/whatsapp/window";

// 2026-11-23 12:00 IST = 06:30 UTC
const noonIST = new Date("2026-11-23T06:30:00Z");
const hoursAgo = (h: number, from = noonIST) => new Date(from.getTime() - h * 3600_000);

describe("24-hour window", () => {
  it("is open just under 24 hours after the buyer's message and closed at 24 hours", () => {
    expect(isWindowOpen(hoursAgo(23.99), noonIST)).toBe(true);
    expect(isWindowOpen(hoursAgo(24), noonIST)).toBe(false);
    expect(isWindowOpen(null, noonIST)).toBe(false);
  });

  it("reports when the window closes", () => {
    expect(windowClosesAt(hoursAgo(1), noonIST)).toEqual(new Date(noonIST.getTime() + 23 * 3600_000));
    expect(windowClosesAt(hoursAgo(25), noonIST)).toBeNull();
  });
});

describe("quiet hours (21:00–09:00 IST)", () => {
  it("uses IST, not UTC", () => {
    expect(istHour(new Date("2026-11-23T15:29:00Z"))).toBe(20); // 20:59 IST
    expect(isQuietHours(new Date("2026-11-23T15:29:00Z"))).toBe(false);
    expect(isQuietHours(new Date("2026-11-23T15:30:00Z"))).toBe(true); // 21:00 IST
    expect(isQuietHours(new Date("2026-11-23T03:29:00Z"))).toBe(true); // 08:59 IST
    expect(isQuietHours(new Date("2026-11-23T03:30:00Z"))).toBe(false); // 09:00 IST
  });
});

describe("decideSend", () => {
  const fresh = { optedOut: false, lastInboundAt: hoursAgo(1) };
  const stale = { optedOut: false, lastInboundAt: hoursAgo(30) };
  const optedOut = { optedOut: true, lastInboundAt: hoursAgo(1) };
  const night = new Date("2026-11-23T17:00:00Z"); // 22:30 IST

  it("allows free-form inside the window as a service message", () => {
    expect(decideSend(fresh, { kind: "freeform" }, noonIST)).toEqual({ allowed: true, costCategory: "service" });
  });

  it("blocks free-form outside the window, but allows templates", () => {
    expect(decideSend(stale, { kind: "freeform" }, noonIST)).toEqual({ allowed: false, reason: "outside_window" });
    expect(decideSend(stale, { kind: "template", category: "utility" }, noonIST)).toEqual({
      allowed: true,
      costCategory: "utility",
    });
  });

  it("never messages an opted-out contact", () => {
    expect(decideSend(optedOut, { kind: "freeform" }, noonIST)).toMatchObject({ reason: "opted_out" });
    expect(decideSend(optedOut, { kind: "template", category: "utility" }, noonIST)).toMatchObject({
      reason: "opted_out",
    });
  });

  it("still sends the one opt-out confirmation", () => {
    expect(decideSend(optedOut, { kind: "opt_out_confirmation" }, noonIST)).toEqual({
      allowed: true,
      costCategory: "service",
    });
  });

  it("blocks marketing templates at night but not utility ones", () => {
    expect(decideSend(stale, { kind: "template", category: "marketing" }, night)).toEqual({
      allowed: false,
      reason: "quiet_hours",
    });
    expect(decideSend(stale, { kind: "template", category: "marketing" }, noonIST)).toEqual({
      allowed: true,
      costCategory: "marketing",
    });
    expect(decideSend(stale, { kind: "template", category: "utility" }, night)).toMatchObject({ allowed: true });
  });
});
