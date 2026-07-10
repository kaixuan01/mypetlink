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
};

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

export function writeStoredAuthSession(session: StoredAuthSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(API_AUTH_SESSION_KEY, JSON.stringify(session));
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

  window.localStorage.removeItem(API_AUTH_SESSION_KEY);
}
