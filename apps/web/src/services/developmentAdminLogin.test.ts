// @vitest-environment jsdom

import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDevelopmentAdminLoginEnabled } from "./apiConfig";
import { readStoredAuthSession } from "./authStorage";
import { loginAsDevelopmentAdmin } from "./authService";

describe("Development Admin login", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5281");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is never enabled for a production build, even when the public opt-in is set", () => {
    expect(isDevelopmentAdminLoginEnabled("production", "true")).toBe(false);
    expect(isDevelopmentAdminLoginEnabled("development", "false")).toBe(false);
    expect(isDevelopmentAdminLoginEnabled("development", "true")).toBe(true);
  });

  it("uses the configured API client and stores the normal auth session", async () => {
    const response = {
      accessToken: "development-access-token",
      refreshToken: "development-refresh-token",
      expiresIn: 900,
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "admin.dev@mypetlink.local",
        displayName: "MyPetLink Dev Admin",
        roles: ["Owner", "Admin"],
        status: "Active",
      },
      ownerProfile: {
        id: "22222222-2222-2222-2222-222222222222",
        ownerDisplayName: "MyPetLink Dev Admin",
        planCode: "Free",
        planName: "Free",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: response, meta: { requestId: "dev-login" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await loginAsDevelopmentAdmin();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:5281/api/v1/dev-auth/admin-login"
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
    expect(readStoredAuthSession()).toMatchObject({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    });
  });

  it("keeps browser authentication state files out of git", () => {
    const ignored = execFileSync(
      "git",
      ["check-ignore", "playwright/.auth/admin.json"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(ignored.trim()).toBe("playwright/.auth/admin.json");
  });
});
