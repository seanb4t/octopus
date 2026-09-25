import { afterEach, describe, expect, it } from "bun:test";
import { utilityModel } from "../utility-model";

const saved = process.env.OCTOPUS_UTILITY_MODEL;
afterEach(() => {
  if (saved === undefined) delete process.env.OCTOPUS_UTILITY_MODEL;
  else process.env.OCTOPUS_UTILITY_MODEL = saved;
});

describe("utilityModel", () => {
  it("returns the upstream default when the variable is unset or blank", () => {
    delete process.env.OCTOPUS_UTILITY_MODEL;
    expect(utilityModel("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
    process.env.OCTOPUS_UTILITY_MODEL = "   ";
    expect(utilityModel("claude-sonnet-5")).toBe("claude-sonnet-5");
  });

  it("replaces every default with the configured model", () => {
    process.env.OCTOPUS_UTILITY_MODEL = " or-deepseek-v4-1-flash ";
    expect(utilityModel("claude-haiku-4-5-20251001")).toBe("or-deepseek-v4-1-flash");
    expect(utilityModel("claude-sonnet-5")).toBe("or-deepseek-v4-1-flash");
  });
});
