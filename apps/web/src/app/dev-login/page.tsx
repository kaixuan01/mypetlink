"use client";

// DEVELOPMENT-ONLY test login page.
//
// Lets a developer create Owner/Admin sessions locally without the Google
// popup, for manual/E2E testing. It is not a real login method and is not
// linked from any customer-facing UI. In a production build this page renders
// only an "unavailable" notice and never calls the backend (which also returns
// 404 for /api/v1/dev/test-login outside Development).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithDevTestUser } from "@/services/authService";
import { isApiConfigured } from "@/services/apiConfig";

const isDevelopment = process.env.NODE_ENV === "development";

const testUsers: {
  label: string;
  email: string;
  role: "Owner" | "Admin";
  destination: string;
}[] = [
  {
    label: "Owner test user",
    email: "owner.test@mypetlink.local",
    role: "Owner",
    destination: "/dashboard",
  },
  {
    label: "Second owner (cross-owner tests)",
    email: "other.owner@mypetlink.local",
    role: "Owner",
    destination: "/dashboard",
  },
  {
    label: "Admin test user",
    email: "admin.test@mypetlink.local",
    role: "Admin",
    destination: "/admin",
  },
];

export default function DevLoginPage() {
  const router = useRouter();
  const [busyEmail, setBusyEmail] = useState("");
  const [error, setError] = useState("");

  if (!isDevelopment) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-black text-slate-900">Not available</h1>
        <p className="mt-2 text-sm text-slate-500">
          This page is only available in local development.
        </p>
      </main>
    );
  }

  async function signIn(email: string, role: "Owner" | "Admin", destination: string) {
    if (busyEmail) {
      return;
    }

    setBusyEmail(email);
    setError("");

    try {
      await loginWithDevTestUser(email, role);
      router.replace(destination);
    } catch {
      setError(
        "Test login failed. Is the API running in Development on the configured base URL?"
      );
      setBusyEmail("");
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
        Development-only test login. This is not a real sign-in method and is
        disabled in production builds.
      </div>

      <h1 className="mt-6 text-2xl font-black text-slate-900">Dev test login</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create a local session without the Google popup for manual and E2E
        testing.
      </p>

      {!isApiConfigured() ? (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
          No API base URL is configured, so test login cannot reach the backend.
        </p>
      ) : null}

      <div className="mt-6 grid gap-3">
        {testUsers.map((user) => (
          <button
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
            disabled={Boolean(busyEmail)}
            key={user.email}
            onClick={() => void signIn(user.email, user.role, user.destination)}
            type="button"
          >
            <span>
              <span className="block text-sm font-black text-slate-900">
                {user.label}
              </span>
              <span className="block text-xs font-semibold text-slate-500">
                {user.email} · {user.role}
              </span>
            </span>
            <span className="text-xs font-extrabold text-[#1570ef]">
              {busyEmail === user.email ? "Signing in..." : "Sign in"}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 text-sm font-bold text-[#a63c2e]">{error}</p>
      ) : null}
    </main>
  );
}
