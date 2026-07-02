"use client";

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
  writeSession(OWNER_KEY, ownerSession);
  return ownerSession;
}

export function loginMockAdmin() {
  writeSession(ADMIN_KEY, adminSession);
  return adminSession;
}

export function getOwnerSession() {
  return readSession(OWNER_KEY);
}

export function getAdminSession() {
  return readSession(ADMIN_KEY);
}

export function logoutOwner() {
  window.localStorage.removeItem(OWNER_KEY);
}

export function logoutAdmin() {
  window.localStorage.removeItem(ADMIN_KEY);
}

export function isOwnerAuthenticated() {
  return Boolean(getOwnerSession());
}

export function isAdminAuthenticated() {
  return Boolean(getAdminSession());
}
