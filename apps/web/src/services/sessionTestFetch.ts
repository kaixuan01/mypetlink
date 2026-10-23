/**
 * Test-only helpers for session-boundary tests: a `fetch` whose every request
 * is held until the test answers it, and stored sessions written exactly as
 * the browser stores them. Nothing here is imported by application code.
 */

export const SESSION_STORAGE_KEY = "mypetlink_api_auth_session";

export type HeldRequest = {
  url: string;
  method: string;
  authorization: string | null;
  body: string | null;
  answer: (status: number, body?: unknown) => void;
};

export function installHeldFetch() {
  const requests: HeldRequest[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve) => {
      requests.push({
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
        authorization: new Headers(init?.headers).get("Authorization"),
        body: typeof init?.body === "string" ? init.body : null,
        answer: (status, body) =>
          resolve(
            new Response(body === undefined ? null : JSON.stringify(body), {
              status,
              headers: { "Content-Type": "application/json" },
            })
          ),
      });
    });
  return { requests, fetchImpl };
}

export function storedSession(userId: string, options: { sessionId?: string; token?: string; displayName?: string } = {}) {
  const token = options.token ?? `access-${userId}-${options.sessionId ?? "legacy"}`;
  return JSON.stringify({
    accessToken: token,
    refreshToken: `refresh-${token}`,
    expiresAt: Date.now() + 3_600_000,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    user: {
      id: userId,
      email: `${userId}@example.test`,
      displayName: options.displayName ?? `${userId} account`,
      roles: ["Owner"],
      status: "Active",
    },
    ownerProfile: null,
  });
}

/** Writes a session the way another tab would, and tells this tab as the browser does. */
export function sessionChangedInAnotherTab(next: string | null) {
  const previous = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (next === null) window.localStorage.removeItem(SESSION_STORAGE_KEY);
  else window.localStorage.setItem(SESSION_STORAGE_KEY, next);
  window.dispatchEvent(
    new StorageEvent("storage", { key: SESSION_STORAGE_KEY, oldValue: previous, newValue: next })
  );
}

export function backendPet(id: string, name: string) {
  return {
    id,
    name,
    species: "Cat",
    customSpecies: null,
    breed: null,
    gender: null,
    birthday: null,
    estimatedBirthYear: null,
    age: null,
    adoptionDay: null,
    bio: null,
    publicSlug: `${name.toLowerCase()}-${id}`,
    publicCode: id,
    publicProfileVersion: "1",
    safetyCode: `S${id}`,
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    publicProfilePath: `/p/${name.toLowerCase()}-${id}`,
    qrSafetyPath: `/q/S${id}`,
    profileMediaId: null,
    coverMediaId: null,
    profilePhotoUrl: `https://media.example.test/${id}.jpg`,
    coverPhotoUrl: null,
    coverPositionX: 50,
    coverPositionY: 50,
    personalityTags: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    qrSafetyEnabled: true,
    publicProfileEnabled: true,
  };
}
