import { describe, expect, it } from "vitest";
import { containsEmailLike, containsPhoneLike, hasContactSignal } from "./row-heuristics";

describe("containsEmailLike", () => {
  it("detects plain addresses", () => {
    expect(containsEmailLike("ravi@example.com")).toBe(true);
  });

  it("detects addresses embedded in text", () => {
    expect(containsEmailLike("reach me at ravi.k+leads@mail.co.in thanks")).toBe(true);
  });

  it("rejects non-addresses", () => {
    expect(containsEmailLike("Ravi Kumar")).toBe(false);
    expect(containsEmailLike("price @ 4500 per sqft")).toBe(false);
    expect(containsEmailLike("")).toBe(false);
  });
});

describe("containsPhoneLike", () => {
  it("detects formatted numbers", () => {
    expect(containsPhoneLike("+91 98765 43210")).toBe(true);
    expect(containsPhoneLike("(080) 4123-4567")).toBe(true);
    expect(containsPhoneLike("9876501234")).toBe(true);
  });

  it("rejects too few or too many digits", () => {
    expect(containsPhoneLike("2026")).toBe(false); // a year
    expect(containsPhoneLike("123456")).toBe(false); // 6 digits
    expect(containsPhoneLike("1234567890123456")).toBe(false); // 16-digit id
  });

  it("is deliberately loose in the safe direction", () => {
    // A date has 8 digits and reads as phone-like. That keeps the row and
    // sends it to the AI — the safe failure mode for a pre-filter.
    expect(containsPhoneLike("2026-07-08")).toBe(true);
  });
});

describe("hasContactSignal", () => {
  it("finds a signal in any cell", () => {
    expect(
      hasContactSignal({ name: "Ravi", note: "call 9876543210 after 6" }),
    ).toBe(true);
    expect(hasContactSignal({ a: "x", b: "r@x.co" })).toBe(true);
  });

  it("returns false when no cell could be an email or phone", () => {
    expect(hasContactSignal({ name: "Walk-in", city: "Chennai", note: "no details" })).toBe(
      false,
    );
    expect(hasContactSignal({})).toBe(false);
  });
});
