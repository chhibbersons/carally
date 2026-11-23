import { describe, expect, it } from "vitest";
import { matchOptKeyword } from "../../src/whatsapp/opt-out";

describe("matchOptKeyword", () => {
  it.each([
    ["STOP", "en"],
    ["  stop. ", "en"],
    ["Unsubscribe", "en"],
    ["Band karo", "hinglish"],
    ["band kro!!", "hinglish"],
    ["बंद करो", "hi"],
    ["थांबवा", "mr"],
  ])("treats %j as an opt-out", (text, language) => {
    expect(matchOptKeyword(text)).toEqual({ action: "opt_out", language });
  });

  it.each(["START", "start", "शुरू करो"])("treats %j as an opt-in", (text) => {
    expect(matchOptKeyword(text)?.action).toBe("opt_in");
  });

  it.each([
    "don't stop sending Creta photos",
    "Is the car still available? Stop by tomorrow?",
    "constructor",
    "",
    null,
  ])("ignores %j", (text) => {
    expect(matchOptKeyword(text)).toBeNull();
  });
});
