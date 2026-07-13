import { describe, expect, it } from "vitest";
import {
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
});
