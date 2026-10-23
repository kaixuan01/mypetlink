// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backendPet,
  installHeldFetch,
  SESSION_STORAGE_KEY,
  storedSession,
} from "@/services/sessionTestFetch";

// The real shared pet service, API client and session storage; only the
// network is held so requests can be answered in any order.
const { getPets } = await import("./petService");
const { updateStoredAuthTokens } = await import("./authStorage");

let held: ReturnType<typeof installHeldFetch>;

async function settle() {
  for (let index = 0; index < 10; index++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Session ids are unique per test, so nothing one test leaves pending can be
// mistaken for another test's session.
let testRun = 0;
function signInAs(userId: string, sessionId?: string) {
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    storedSession(userId, { sessionId: sessionId ? `${sessionId}-${testRun}` : undefined })
  );
}

const petsRequests = () => held.requests.filter((request) => request.url.includes("/api/v1/pets?"));

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

describe("getPets shares a request only within one session", () => {
  it("collapses concurrent calls in the same session into one request", async () => {
    signInAs("owner-a", "session-a");
    const first = getPets();
    const second = getPets();
    await settle();

    expect(petsRequests()).toHaveLength(1);
    petsRequests()[0].answer(200, { data: [backendPet("p1", "Milo")] });
    expect((await first).data.map((pet) => pet.name)).toEqual(["Milo"]);
    expect((await second).data.map((pet) => pet.name)).toEqual(["Milo"]);
  });

  it("never hands account A's pending answer to account B", async () => {
    signInAs("owner-a", "session-a");
    const forA = getPets();
    forA.catch(() => {});
    await settle();

    signInAs("owner-b", "session-b");
    const forB = getPets();
    await settle();

    // B made its own request, with its own token.
    expect(petsRequests()).toHaveLength(2);
    expect(petsRequests()[1].authorization).toBe(`Bearer access-owner-b-session-b-${testRun}`);

    petsRequests()[0].answer(200, { data: [backendPet("p1", "Milo"), backendPet("p2", "Oyen")] });
    await settle();
    petsRequests()[1].answer(200, { data: [backendPet("p9", "Rex")] });

    expect((await forB).data.map((pet) => pet.name)).toEqual(["Rex"]);
    // A's answer arrived after A's session ended: it is not published to anyone.
    await expect(forA).rejects.toMatchObject({ status: 401, code: "session_changed" });
  });

  it("starts a new request for the same user signing in again", async () => {
    signInAs("owner-a", "session-1");
    getPets().catch(() => {});
    await settle();

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    signInAs("owner-a", "session-2");
    getPets().catch(() => {});
    await settle();

    expect(petsRequests()).toHaveLength(2);
    expect(petsRequests()[1].authorization).toBe(`Bearer access-owner-a-session-2-${testRun}`);
  });

  it("does not let an old session's finished request clear the new session's shared one", async () => {
    signInAs("owner-a", "session-a");
    getPets().catch(() => {});
    await settle();
    signInAs("owner-b", "session-b");
    const firstForB = getPets();
    await settle();

    petsRequests()[0].answer(200, { data: [backendPet("p1", "Milo")] });
    await settle();
    const secondForB = getPets();
    await settle();

    expect(petsRequests()).toHaveLength(2);
    petsRequests()[1].answer(200, { data: [backendPet("p9", "Rex")] });
    expect((await secondForB).data.map((pet) => pet.name)).toEqual(["Rex"]);
    expect((await firstForB).data.map((pet) => pet.name)).toEqual(["Rex"]);
  });

  it("keeps sharing across an ordinary token refresh in the same session", async () => {
    signInAs("owner-a", "session-a");
    const first = getPets();
    await settle();

    updateStoredAuthTokens({ accessToken: "rotated", refreshToken: "rotated-refresh", expiresIn: 900 });
    const second = getPets();
    await settle();

    expect(petsRequests()).toHaveLength(1);
    petsRequests()[0].answer(200, { data: [backendPet("p1", "Milo")] });
    expect((await second).data.map((pet) => pet.name)).toEqual(["Milo"]);
    expect((await first).data.map((pet) => pet.name)).toEqual(["Milo"]);
  });

  it("does not publish an answer for a session that was signed out meanwhile", async () => {
    signInAs("owner-a", "session-a");
    const forA = getPets();
    forA.catch(() => {});
    await settle();

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    petsRequests()[0].answer(200, { data: [backendPet("p1", "Milo")] });

    await expect(forA).rejects.toMatchObject({ status: 401, code: "session_changed" });
  });
});
