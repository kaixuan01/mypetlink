// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { writeStoredAuthSession } from "@/services/authStorage";
import { EMPTY_ADMIN_DATA, getAdminData } from "@/services/adminService";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("admin API-mode initialization", () => {
  it("exposes only empty initial collections to server-rendered admin pages", () => {
    expect(EMPTY_ADMIN_DATA).toEqual({ pets: [], tags: [], orders: [] });
  });

  it("does not fall back to local seed records when an API request fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    writeStoredAuthSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
      user: {
        id: "admin-1",
        email: "admin@example.com",
        displayName: "Admin",
        roles: ["Admin"],
        status: "Active",
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(getAdminData()).rejects.toThrow(
      "We could not reach MyPetLink right now. Please try again."
    );
    expect(EMPTY_ADMIN_DATA.pets).toHaveLength(0);
    expect(EMPTY_ADMIN_DATA.tags).toHaveLength(0);
    expect(EMPTY_ADMIN_DATA.orders).toHaveLength(0);
  });
});
