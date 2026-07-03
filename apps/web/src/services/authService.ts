"use client";

import { apiRequest } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession,
  type StoredAuthSession,
} from "@/services/authStorage";
import type {
  BackendAuthTokenResponse,
  BackendCurrentUser,
} from "@/services/apiDtos";

const OWNER_KEY = "mypetlink_mock_owner";
const ADMIN_KEY = "mypetlink_mock_admin";

export type MockSession = {
  role: "owner" | "admin";
  name: string;
  email: string;
};

const ownerSession: MockSession = {
  role: "owner",
  name: "Aina Rahman",
  email: "aina@example.com",
};

const adminSession: MockSession = {
  role: "admin",
  name: "MyPetLink Admin",
  email: "admin@mypetlink.com.my",
};

function readSession(key: string): MockSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(key);
  return value ? (JSON.parse(value) as MockSession) : null;
}

function writeSession(key: string, session: MockSession) {
  window.localStorage.setItem(key, JSON.stringify(session));
}

export function loginMockOwner() {
  if (canUseApi()) {
    return getOwnerSession() ?? ownerSession;
  }

  writeSession(OWNER_KEY, ownerSession);
  return ownerSession;
}

export function loginMockAdmin() {
  writeSession(ADMIN_KEY, adminSession);
  return adminSession;
}

export function getOwnerSession() {
  if (canUseApi()) {
    const session = readStoredAuthSession();

    if (!session) {
      return null;
    }

    return {
      role: "owner" as const,
      name:
        session.ownerProfile?.ownerDisplayName ??
        session.user.displayName ??
        "Pet owner",
      email: session.user.email,
    };
  }

  return readSession(OWNER_KEY);
}

export function getAdminSession() {
  return readSession(ADMIN_KEY);
}

export function logoutOwner() {
  if (canUseApi()) {
    const refreshToken = readStoredAuthSession()?.refreshToken;

    if (refreshToken) {
      void apiRequest<void>("/api/v1/auth/logout", {
        method: "POST",
        body: { refreshToken },
      }).catch(() => undefined);
    }

    clearStoredAuthSession();
    return;
  }

  window.localStorage.removeItem(OWNER_KEY);
}

export function logoutAdmin() {
  if (canUseApi()) {
    logoutOwner();
    return;
  }

  window.localStorage.removeItem(ADMIN_KEY);
}

export function isOwnerAuthenticated() {
  if (canUseApi()) {
    return Boolean(readStoredAuthSession());
  }

  return Boolean(getOwnerSession());
}

// In API mode this only checks that a signed-in session exists; whether that
// session actually has operations access is decided by the backend through
// checkAdminAccess (an active AdminUsers record, not a role claim).
export function isAdminAuthenticated() {
  if (canUseApi()) {
    return Boolean(readStoredAuthSession());
  }

  return Boolean(getAdminSession());
}

export type AdminAccessCheck = {
  user: BackendCurrentUser["user"];
  admin: {
    role: string;
    isActive: boolean;
  };
};

export async function checkAdminAccess() {
  const response = await apiRequest<AdminAccessCheck>("/api/v1/admin/auth/check");
  return response.data ?? null;
}

export async function loginWithGoogleIdToken(idToken: string) {
  const response = await apiRequest<BackendAuthTokenResponse>(
    "/api/v1/auth/google",
    {
      method: "POST",
      body: { idToken },
      auth: false,
    }
  );

  if (!response.data) {
    throw new Error("Sign in did not return a session.");
  }

  storeBackendSession(response.data);
  return getOwnerSession();
}

export async function getCurrentOwnerSession() {
  const response = await apiRequest<BackendCurrentUser>("/api/v1/auth/me");

  if (response.data) {
    const current = readStoredAuthSession();

    if (current) {
      writeStoredAuthSession({
        ...current,
        user: response.data.user,
        ownerProfile: response.data.ownerProfile,
      });
    }
  }

  return response.data;
}

function storeBackendSession(response: BackendAuthTokenResponse) {
  const session: StoredAuthSession = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: Date.now() + response.expiresIn * 1000,
    user: response.user,
    ownerProfile: response.ownerProfile,
  };

  writeStoredAuthSession(session);
}
