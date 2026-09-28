import { describe, expect, it } from "vitest";
import { normalizeSocialSearchQuery } from "@/services/socialDiscoveryService";

// Mirrors SocialSearchQuery.Normalize in the API. The two are tested against
// the same table so the search box and the server agree on what "@x" means.
describe("normalizeSocialSearchQuery", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    ["@", ""],
    ["@mochi", "mochi"],
    [" @ Mochi ", "Mochi"],
    ["@TanFamily", "TanFamily"],
    ["@@mochi", "@mochi"],
    ["mo@chi", "mo@chi"],
    ["mochi", "mochi"],
  ])("normalizes %j to %j", (typed, expected) => {
    expect(normalizeSocialSearchQuery(typed)).toBe(expected);
  });
});
