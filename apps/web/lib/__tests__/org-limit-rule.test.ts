import { describe, it, expect } from "bun:test";
import { orgLimitReached, MAX_OWNED_ORGS_PER_USER } from "@/lib/constants";

describe("orgLimitReached", () => {
  it("treats max <= 0 as unlimited (never reached)", () => {
    expect(orgLimitReached(0, 0)).toBe(false);
    expect(orgLimitReached(5, 0)).toBe(false);
    expect(orgLimitReached(9999, -1)).toBe(false);
  });

  it("caps at a positive max (>= is the limit)", () => {
    expect(orgLimitReached(0, 3)).toBe(false);
    expect(orgLimitReached(2, 3)).toBe(false);
    expect(orgLimitReached(3, 3)).toBe(true);
    expect(orgLimitReached(4, 3)).toBe(true);
  });

  it("defaults max to MAX_OWNED_ORGS_PER_USER (a positive default)", () => {
    expect(MAX_OWNED_ORGS_PER_USER).toBeGreaterThan(0);
    expect(orgLimitReached(MAX_OWNED_ORGS_PER_USER - 1)).toBe(false);
    expect(orgLimitReached(MAX_OWNED_ORGS_PER_USER)).toBe(true);
  });
});
