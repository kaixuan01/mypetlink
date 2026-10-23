"use client";

const API_AUTH_SESSION_KEY = "mypetlink_api_auth_session";

export type StoredAuthUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status: string;
};

export type StoredOwnerProfileSummary = {
  id: string;
  ownerDisplayName: string;
  planCode: string;
  planName: string;
};

export type StoredAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: StoredAuthUser;
  ownerProfile?: StoredOwnerProfileSummary | null;
  /**
   * One sign-in. Created when a session begins and kept, unchanged, through
   * every token refresh, so "the same session" and "signed out and back in,
   * even as the same person" can be told apart. Sessions stored before this
   * field existed have none and are identified by their user instead.
   */
  sessionId?: string;
};

/**
 * Which sign-in a stored session belongs to: stable across token refreshes,
 * different after any sign-out and sign-in. Never contains a token. Null when
 * no one is signed in.
 */
export type AuthSessionKey = string;

/**
 * A change of sign-in. `previous` is the session that ended (or "unknown"
 * when another tab cleared all storage), `next` the session now stored.
 * A token refresh is not a change.
 */
export type AuthSessionChange = {
  previous: AuthSessionKey | "unknown" | null;
  next: AuthSessionKey | null;
};

export function authSessionKey(
  session: Pick<StoredAuthSession, "sessionId" | "user"> | null | undefined
): AuthSessionKey | null {
  if (!session?.user?.id) {
    return null;
  }

  return session.sessionId ? `session:${session.sessionId}` : `user:${session.user.id}`;
}

function sessionKeyOfStoredValue(value: string | null): AuthSessionKey | null {
  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as StoredAuthSession;
    return session.accessToken && session.refreshToken ? authSessionKey(session) : null;
  } catch {
    return null;
  }
}

export function readStoredAuthSession(): StoredAuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(API_AUTH_SESSION_KEY);

  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as StoredAuthSession;
    return session.accessToken && session.refreshToken ? session : null;
  } catch {
    clearStoredAuthSession();
    return null;
  }
}

/** The sign-in currently stored in this browser, or null. */
export function getAuthSessionKey(): AuthSessionKey | null {
  return authSessionKey(readStoredAuthSession());
}

/**
 * Whether work started for `key` may still affect this browser: the same
 * sign-in is still stored. Anything that writes session-derived data after
 * waiting on the network checks this first, so an answer for a session that
 * has since ended — or been replaced, even by the same person — is dropped.
 */
export function isAuthSessionCurrent(key: AuthSessionKey | null): boolean {
  return key !== null && getAuthSessionKey() === key;
}

const sessionListeners = new Set<(change: AuthSessionChange) => void>();

function announce(previous: AuthSessionKey | null, next: AuthSessionKey | null) {
  if (previous === next) {
    return;
  }

  sessionListeners.forEach((listener) => listener({ previous, next }));
}

/**
 * Be told whenever the sign-in changes: signed out, signed in, or replaced —
 * in this tab (a write or a clear here, including the API client forgetting a
 * session whose refresh failed) or in another tab. Another tab's change is
 * read from the storage event's own old and new values, never from storage
 * as it is when the event is handled, so a sign-out followed at once by a
 * sign-in of the same person is still seen as an ending.
 */
export function subscribeAuthSession(
  listener: (change: AuthSessionChange) => void
): () => void {
  sessionListeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key === null) {
      // Another tab cleared all of storage.
      listener({ previous: "unknown", next: getAuthSessionKey() });
      return;
    }

    if (event.key !== API_AUTH_SESSION_KEY) {
      return;
    }

    const previous = sessionKeyOfStoredValue(event.oldValue);
    const next = sessionKeyOfStoredValue(event.newValue);

    if (previous !== next) {
      listener({ previous, next });
    }
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    sessionListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function writeStoredAuthSession(session: StoredAuthSession) {
  if (typeof window === "undefined") {
    return;
  }

  const previous = sessionKeyOfStoredValue(window.localStorage.getItem(API_AUTH_SESSION_KEY));
  window.localStorage.setItem(API_AUTH_SESSION_KEY, JSON.stringify(session));
  announce(previous, authSessionKey(session));
}

function newSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Stores a session that has just been signed in to, as a new sign-in. */
export function beginStoredAuthSession(session: StoredAuthSession) {
  writeStoredAuthSession({ ...session, sessionId: newSessionId() });
}

export function updateStoredAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const session = readStoredAuthSession();

  if (!session) {
    return null;
  }

  // The spread keeps sessionId: a refresh continues the same sign-in.
  const nextSession: StoredAuthSession = {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };

  writeStoredAuthSession(nextSession);
  return nextSession;
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  // Read raw: readStoredAuthSession clears unreadable data by calling this.
  const previous = sessionKeyOfStoredValue(window.localStorage.getItem(API_AUTH_SESSION_KEY));
  window.localStorage.removeItem(API_AUTH_SESSION_KEY);
  announce(previous, null);
}

/**
 * Forgets the stored session only if it is still `key`. Used where a failure
 * observed for one sign-in would otherwise sign out whoever has signed in
 * since.
 */
export function clearStoredAuthSessionIfCurrent(key: AuthSessionKey | null) {
  if (isAuthSessionCurrent(key)) {
    clearStoredAuthSession();
  }
}
