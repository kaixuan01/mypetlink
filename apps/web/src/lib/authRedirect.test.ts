import { describe, expect, it } from "vitest";
import {
  isCommunityPostLoginPath,
  isSafeLocalRedirect,
  ownerLoginPath,
  resolveOwnerPostLoginPath,
} from "@/lib/authRedirect";

describe("owner login redirects", () => {
  it("preserves an Edit Pet route, query, and fragment", () => {
    const destination = "/pets/12%20ab/edit?tab=photos#cover";

    expect(resolveOwnerPostLoginPath(destination)).toBe(destination);
    expect(ownerLoginPath(destination)).toBe(
      `/login?redirect=${encodeURIComponent(destination)}`
    );
  });

  it.each([
    "https://evil.example/pets/1/edit",
    "//evil.example/pets/1/edit",
    "/\\evil.example/pets/1/edit",
    "/%2f%2fevil.example/pets/1/edit",
    "/%255c%255cevil.example/pets/1/edit",
    "/pets/1/edit\nhttps://evil.example",
    "javascript:alert(1)",
    "https%3A%2F%2Fevil.example%2Faccount",
    "%2F%2Fevil.example%2Faccount",
  ])("rejects unsafe or external destinations: %s", (destination) => {
    expect(isSafeLocalRedirect(destination)).toBe(false);
    expect(resolveOwnerPostLoginPath(destination)).toBe("/dashboard");
  });

  it("prevents a login redirect loop", () => {
    expect(resolveOwnerPostLoginPath("/login?redirect=/login")).toBe(
      "/dashboard"
    );
    expect(resolveOwnerPostLoginPath("/login/")).toBe("/dashboard");
  });

  it.each([
    "/feed?source=header",
    "/notifications",
    "/community/profile/edit",
    "/explore?species=Cat",
    "/search?q=mochi",
    "/u/tanfamily",
    "/moments/7f7f7f7f-7f7f-7f7f-7f7f-7f7f7f7f7f7f",
  ])("recognises a safe Community return: %s", (destination) => {
    expect(isCommunityPostLoginPath(destination)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/pets/pet-1/edit",
    "https://evil.example/feed",
    "%2F%2Fevil.example%2Ffeed",
  ])("does not mislabel a non-Community or unsafe return: %s", (destination) => {
    expect(isCommunityPostLoginPath(destination)).toBe(false);
  });
});
