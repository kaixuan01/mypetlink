// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiClientError } from "./apiClient";
import { writeStoredAuthSession } from "./authStorage";
import {
  cancelActiveWakeUpRequests,
  clearWakeUpState,
  getServiceWakeUpSnapshot,
} from "./serviceWakeUp";

function jsonResponse(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function wakingResponse(retryAfter = "3") {
  return jsonResponse(
    503,
    {
      error: {
        code: "database_waking_up",
        message: "MyPetLink is getting things ready.",
        details: null,
      },
      meta: { requestId: "request-1", retryAfterSeconds: Number(retryAfter) },
    },
    { "Retry-After": retryAfter }
  );
}

describe("database wake-up API resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
    vi.stubEnv("NEXT_PUBLIC_DATABASE_WAKE_MAX_ATTEMPTS", "6");
    vi.stubEnv("NEXT_PUBLIC_DATABASE_WAKE_MAXIMUM_WAIT_SECONDS", "45");
    clearWakeUpState();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearWakeUpState();
  });

  it("retries a safe GET, respects Retry-After, and restores the response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(wakingResponse("3"))
      .mockResolvedValueOnce(jsonResponse(200, { data: { name: "Milo" } }));
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest<{ name: string }>("/api/v1/pets");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getServiceWakeUpSnapshot().status).toBe("retrying");

    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toMatchObject({ data: { name: "Milo" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getServiceWakeUpSnapshot().status).toBe("idle");
  });

  it.each([400, 401, 403, 404, 409, 422, 500])(
    "does not retry an HTTP %s response",
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(status, {
          error: { code: `http_${status}`, message: "Request did not succeed." },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        apiRequest("/api/v1/public/pets/example", { auth: false })
      ).rejects.toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getServiceWakeUpSnapshot().status).toBe("idle");
    }
  );

  it("does not blindly retry POST operations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(wakingResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/v1/pets", { method: "POST", body: { name: "Milo" } })
    ).rejects.toMatchObject({ status: 503, code: "database_waking_up" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces the configured maximum attempt count", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATABASE_WAKE_MAX_ATTEMPTS", "3");
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(wakingResponse("1")));
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/api/v1/pets");
    const rejection = expect(request).rejects.toBeInstanceOf(ApiClientError);
    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getServiceWakeUpSnapshot().status).toBe("failed");
  });

  it("cancels the retry timer when its AbortSignal is cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(wakingResponse("3"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const request = apiRequest("/api/v1/pets", { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getServiceWakeUpSnapshot().status).toBe("idle");
  });

  it("cancels active retries when navigation replaces the current page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(wakingResponse("3"));
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/api/v1/pets");
    await vi.advanceTimersByTimeAsync(0);
    cancelActiveWakeUpRequests();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getServiceWakeUpSnapshot().status).toBe("idle");
  });

  it("preserves the stored session when refresh encounters wake-up", async () => {
    writeStoredAuthSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
      user: {
        id: "user-1",
        email: "owner@example.com",
        displayName: "Owner",
        roles: ["Owner"],
        status: "Active",
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "unauthorized" } }))
      .mockResolvedValueOnce(wakingResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/v1/auth/me")).rejects.toMatchObject({
      status: 503,
      code: "database_waking_up",
    });
    expect(window.localStorage.getItem("mypetlink_api_auth_session")).toContain(
      "refresh-token"
    );
  });
});
