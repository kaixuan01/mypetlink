// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installHeldFetch,
  SESSION_STORAGE_KEY,
  storedSession,
} from "@/services/sessionTestFetch";

// Real API client, auth service, owner-profile service and session storage.
// Only the network is held, so an old session's answer can be made to arrive
// after a new session has begun.
const { apiRequest } = await import("./apiClient");
const { getCurrentOwnerSession } = await import("./authService");
const { getOwnerProfileSettings } = await import("./ownerProfileService");
const { readStoredAuthSession } = await import("./authStorage");
const { readOwnerSettings, writeOwnerSettings, defaultOwnerSettings } = await import("@/lib/ownerSettings");

let held: ReturnType<typeof installHeldFetch>;
let testRun = 0;

async function settle() {
  for (let index = 0; index < 10; index++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function signInAs(userId: string, sessionId: string) {
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    storedSession(userId, { sessionId: `${sessionId}-${testRun}`, displayName: `${userId} account` })
  );
}

function ownerProfile(displayName: string) {
  return {
    userId: "u",
    ownerProfileId: "op",
    displayName,
    email: `${displayName}@example.test`,
    phoneE164: "+60123456789",
    whatsappE164: null,
    defaultGeneralArea: null,
    defaultContact: { displayName },
    defaultPrivacy: "Private",
    notificationPreferences: {},
    marketingEmailOptIn: false,
    planCode: "free",
  };
}

beforeEach(() => {
  testRun += 1;
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test");
  window.localStorage.clear();
  held = installHeldFetch();
  vi.stubGlobal("fetch", held.fetchImpl);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("an old session's late answers never reach the new one", () => {
  it("a token refresh started for A does not write its tokens into B's session", async () => {
    signInAs("owner-a", "a");
    const request = apiRequest("/api/v1/pets?page=1");
    request.catch(() => {});
    await settle();
    held.requests[0].answer(401, { error: { code: "unauthorized", message: "expired" } });
    await settle();
    const refresh = held.requests.find((item) => item.url.endsWith("/api/v1/auth/refresh"));
    expect(refresh).toBeDefined();

    signInAs("owner-b", "b");
    refresh!.answer(200, { data: { accessToken: "a-new-access", refreshToken: "a-new-refresh", expiresIn: 900 } });
    await settle();

    const stored = readStoredAuthSession();
    expect(stored?.user.id).toBe("owner-b");
    expect(stored?.accessToken).not.toBe("a-new-access");
    expect(stored?.refreshToken).not.toBe("a-new-refresh");
  });

  it("a failed token refresh for A does not sign B out", async () => {
    signInAs("owner-a", "a");
    apiRequest("/api/v1/pets?page=1").catch(() => {});
    await settle();
    held.requests[0].answer(401, { error: { code: "unauthorized", message: "expired" } });
    await settle();
    const refresh = held.requests.find((item) => item.url.endsWith("/api/v1/auth/refresh"));

    signInAs("owner-b", "b");
    refresh!.answer(401, { error: { code: "unauthorized", message: "revoked" } });
    await settle();

    expect(readStoredAuthSession()?.user.id).toBe("owner-b");
  });

  it("a late 401 for A's retried request does not sign B out", async () => {
    signInAs("owner-a", "a");
    apiRequest("/api/v1/pets?page=1", { retryOnUnauthorized: false }).catch(() => {});
    await settle();

    signInAs("owner-b", "b");
    held.requests[0].answer(401, { error: { code: "unauthorized", message: "expired" } });
    await settle();

    expect(readStoredAuthSession()?.user.id).toBe("owner-b");
  });

  it("A's late /auth/me answer does not overwrite B's stored identity", async () => {
    signInAs("owner-a", "a");
    const me = getCurrentOwnerSession();
    me.catch(() => {});
    await settle();

    signInAs("owner-b", "b");
    held.requests[0].answer(200, {
      data: {
        user: { id: "owner-a", email: "a@example.test", displayName: "Owner A", roles: ["Owner"], status: "Active" },
        ownerProfile: { ownerDisplayName: "Private Finder A" },
      },
    });
    await settle();

    const stored = readStoredAuthSession();
    expect(stored?.user.id).toBe("owner-b");
    expect(JSON.stringify(stored)).not.toContain("Private Finder A");
  });

  it("A's late owner-profile answer after sign-out does not restore A's name and number", async () => {
    signInAs("owner-a", "a");
    writeOwnerSettings({ ...defaultOwnerSettings, ownerDisplayName: "Cached A" });
    const settings = getOwnerProfileSettings();
    settings.catch(() => {});
    await settle();

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem("mypetlink_owner_settings");
    held.requests[0].answer(200, { data: ownerProfile("Private Finder A") });
    await settle();

    expect(readOwnerSettings().ownerDisplayName).toBe("");
    expect(window.localStorage.getItem("mypetlink_owner_settings") ?? "").not.toContain("+60123456789");
    await expect(settings).rejects.toMatchObject({ status: 401, code: "session_changed" });
  });

  it("an ordinary refresh in the same session still updates the tokens", async () => {
    signInAs("owner-a", "a");
    const request = apiRequest<{ ok: boolean }>("/api/v1/pets?page=1");
    await settle();
    held.requests[0].answer(401, { error: { code: "unauthorized", message: "expired" } });
    await settle();
    held.requests.find((item) => item.url.endsWith("/api/v1/auth/refresh"))!
      .answer(200, { data: { accessToken: "a-rotated", refreshToken: "a-rotated-refresh", expiresIn: 900 } });
    await settle();
    const retried = held.requests.at(-1)!;
    expect(retried.authorization).toBe("Bearer a-rotated");
    retried.answer(200, { data: { ok: true } });

    expect((await request).data).toEqual({ ok: true });
    expect(readStoredAuthSession()?.accessToken).toBe("a-rotated");
    expect(readStoredAuthSession()?.user.id).toBe("owner-a");
  });
});
