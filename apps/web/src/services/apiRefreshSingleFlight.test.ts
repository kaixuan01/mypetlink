// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest } from "@/services/apiClient";
import {
  readStoredAuthSession,
  writeStoredAuthSession,
} from "@/services/authStorage";

const BASE = "https://api.test";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function seedSession(accessToken: string, refreshToken: string) {
  writeStoredAuthSession({
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 60_000,
    user: {
      id: "u1",
      email: "admin@example.com",
      displayName: "Admin",
      roles: [],
      status: "Active",
    },
    ownerProfile: null,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", BASE);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("single-flight token refresh", () => {
  it("shares ONE refresh across concurrent 401s (rotating token not double-spent)", async () => {
    seedSession("old", "R0");
    let refreshCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const target = String(url);

        if (target.endsWith("/api/v1/auth/refresh")) {
          refreshCalls += 1;
          return jsonResponse(200, {
            data: { accessToken: "fresh", refreshToken: "R1", expiresIn: 900 },
          });
        }

        const auth = new Headers(init.headers).get("Authorization");
        return auth === "Bearer old"
          ? jsonResponse(401, { error: { code: "token_expired", message: "x" } })
          : jsonResponse(200, { data: { path: target } });
      })
    );

    const [a, b, c] = await Promise.all([
      apiRequest<{ path: string }>("/api/v1/admin/a"),
      apiRequest<{ path: string }>("/api/v1/admin/b"),
      apiRequest<{ path: string }>("/api/v1/admin/c"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a.data?.path).toContain("/admin/a");
    expect(b.data?.path).toContain("/admin/b");
    expect(c.data?.path).toContain("/admin/c");
    expect(readStoredAuthSession()?.accessToken).toBe("fresh");
  });

  it("retries the original request exactly once after a successful refresh", async () => {
    seedSession("old", "R0");
    const calls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const target = String(url);
        const auth = new Headers(init.headers).get("Authorization");
        calls.push(`${target.replace(BASE, "")}:${auth ?? "none"}`);

        if (target.endsWith("/api/v1/auth/refresh")) {
          return jsonResponse(200, {
            data: { accessToken: "fresh", refreshToken: "R1", expiresIn: 900 },
          });
        }

        return auth === "Bearer old"
          ? jsonResponse(401, { error: { code: "token_expired", message: "x" } })
          : jsonResponse(200, { data: { ok: true } });
      })
    );

    const result = await apiRequest<{ ok: boolean }>("/api/v1/admin/pets");

    expect(result.data?.ok).toBe(true);
    expect(calls).toEqual([
      "/api/v1/admin/pets:Bearer old",
      "/api/v1/auth/refresh:none",
      "/api/v1/admin/pets:Bearer fresh",
    ]);
  });

  it("does not surface the original 401 when refresh and retry succeed", async () => {
    seedSession("current-access", "R0");
    const observedTokens: (string | null)[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const target = String(url);
        const auth = new Headers(init.headers).get("Authorization");
        if (!target.endsWith("/api/v1/auth/refresh")) observedTokens.push(auth);

        if (target.endsWith("/api/v1/auth/refresh")) {
          return jsonResponse(200, {
            data: { accessToken: "new-access", refreshToken: "R1", expiresIn: 900 },
          });
        }

        return auth === "Bearer current-access"
          ? jsonResponse(401, { error: { code: "token_expired", message: "expired" } })
          : jsonResponse(200, { data: { ok: true } });
      })
    );

    await expect(apiRequest<{ ok: boolean }>("/api/v1/admin/tag-products"))
      .resolves.toMatchObject({ data: { ok: true } });
    expect(observedTokens).toEqual([
      "Bearer current-access",
      "Bearer new-access",
    ]);
  });

  it("does not start a second refresh for a late 401 sent with the stale token", async () => {
    seedSession("old", "R0");
    let releaseLate401: (() => void) | undefined;
    const late401 = new Promise<void>((resolve) => { releaseLate401 = resolve; });
    let refreshCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const target = String(url);
        const auth = new Headers(init.headers).get("Authorization");

        if (target.endsWith("/api/v1/auth/refresh")) {
          refreshCalls += 1;
          return jsonResponse(200, {
            data: { accessToken: "fresh", refreshToken: "R1", expiresIn: 900 },
          });
        }

        if (target.endsWith("/late") && auth === "Bearer old") {
          await late401;
          return jsonResponse(401, { error: { code: "token_expired", message: "expired" } });
        }

        if (auth === "Bearer old") {
          return jsonResponse(401, { error: { code: "token_expired", message: "expired" } });
        }

        return jsonResponse(200, { data: { ok: true } });
      })
    );

    const lateRequest = apiRequest<{ ok: boolean }>("/api/v1/admin/late");
    const firstRequest = apiRequest<{ ok: boolean }>("/api/v1/admin/first");
    await firstRequest;
    releaseLate401?.();

    await expect(lateRequest).resolves.toMatchObject({ data: { ok: true } });
    expect(refreshCalls).toBe(1);
  });

  it("clears the session and surfaces 401 when the refresh token is invalid", async () => {
    seedSession("old", "R0");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/api/v1/auth/refresh")
          ? jsonResponse(401, {
              error: { code: "invalid_refresh_token", message: "x" },
            })
          : jsonResponse(401, { error: { code: "token_expired", message: "x" } })
      )
    );

    await expect(apiRequest("/api/v1/admin/pets")).rejects.toMatchObject({
      status: 401,
    });
    expect(readStoredAuthSession()).toBeNull();
  });

  it("clears the session when the one allowed retry still returns 401", async () => {
    seedSession("old", "R0");
    let refreshCalls = 0;

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          data: { accessToken: "fresh", refreshToken: "R1", expiresIn: 900 },
        });
      }
      return jsonResponse(401, { error: { code: "unauthorized", message: "No longer valid" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/v1/admin/tag-products")).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readStoredAuthSession()).toBeNull();
  });

  it("reports a retried 500 as a server error and retains the refreshed session", async () => {
    seedSession("old", "R0");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const target = String(url);
        const auth = new Headers(init.headers).get("Authorization");
        if (target.endsWith("/api/v1/auth/refresh")) {
          return jsonResponse(200, {
            data: { accessToken: "fresh", refreshToken: "R1", expiresIn: 900 },
          });
        }
        return auth === "Bearer old"
          ? jsonResponse(401, { error: { code: "token_expired", message: "expired" } })
          : jsonResponse(500, {
              error: { code: "server_error", message: "Safe server error" },
              meta: { requestId: "request-500" },
            });
      })
    );

    const error = await apiRequest("/api/v1/admin/tag-products").catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 500,
      code: "server_error",
      requestId: "request-500",
    });
    expect(readStoredAuthSession()?.accessToken).toBe("fresh");
  });

  it("does not intercept the refresh endpoint recursively", async () => {
    seedSession("old", "R0");
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, {
        error: { code: "invalid_refresh_token", message: "Refresh rejected" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        auth: false,
        body: { refreshToken: "R0" },
      })
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
