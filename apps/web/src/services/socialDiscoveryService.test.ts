import { describe, expect, it } from "vitest";
import { normalizeSocialSearchQuery } from "@/services/socialDiscoveryService";

// Mirrors SocialSearchQuery.Normalize in the API, tested against the same
// table. It is used only to decide whether the box has enough to search; the
// request carries what was typed (SocialSearchRequestBoundary.test.tsx).
describe("normalizeSocialSearchQuery", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    ["@", ""],
    ["@mochi", "mochi"],
    [" @ Mochi ", "Mochi"],
    ["@TanFamily", "TanFamily"],
    ["@@mochi", "@mochi"],
    ["@ @mochi", "@mochi"],
    ["  @Mochi  ", "Mochi"],
    ["mo@chi", "mo@chi"],
    ["mochi", "mochi"],
  ])("normalizes %j to %j", (typed, expected) => {
    expect(normalizeSocialSearchQuery(typed)).toBe(expected);
  });
});
