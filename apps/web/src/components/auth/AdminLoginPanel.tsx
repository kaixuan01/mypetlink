"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { isApiClientError } from "@/services/apiClient";
import {
  isApiConfigured,
  isDevelopmentAdminLoginEnabled,
} from "@/services/apiConfig";
import {
  checkAdminAccess,
  isOwnerAuthenticated,
  loginAsDevelopmentAdmin,
  loginMockAdmin,
} from "@/services/authService";

export function AdminLoginPanel() {
  const router = useRouter();
  const apiMode = isApiConfigured();
  const developmentLoginEnabled = isDevelopmentAdminLoginEnabled();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  function resolveDestination() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");

    return redirect && redirect.startsWith("/admin") && !redirect.startsWith("//")
      ? redirect
      : "/admin";
  }

  async function handleApiContinue() {
    if (!isOwnerAuthenticated()) {
      router.replace(`/login?redirect=${encodeURIComponent(resolveDestination())}`);
      return;
    }

    setChecking(true);
    setMessage("");

    try {
      const access = await checkAdminAccess();

      if (access?.admin.isActive) {
        router.replace(resolveDestination());
        return;
      }

      setMessage("This account does not have operations access.");
    } catch (caught) {
      if (isApiClientError(caught) && caught.status === 403) {
        setMessage("This account does not have operations access.");
      } else if (isApiClientError(caught) && caught.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(resolveDestination())}`);
        return;
      } else {
        setMessage("We could not confirm your access. Please try again.");
      }
    } finally {
      setChecking(false);
    }
  }

  function handleLogin() {
    if (apiMode) {
      void handleApiContinue();
      return;
    }

    loginMockAdmin();
    router.replace(resolveDestination());
  }

  async function handleDevelopmentLogin() {
    setChecking(true);
    setMessage("");

    try {
      await loginAsDevelopmentAdmin();
      const access = await checkAdminAccess();

      if (!access?.admin.isActive) {
        setMessage("This account does not have operations access.");
        return;
      }

      router.replace(resolveDestination());
    } catch {
      setMessage("Development sign in is not available. Check the local setup and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white">
        <Icon name="shield" className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-3xl font-black text-slate-950">
        Admin access
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        This area is for MyPetLink operations.
      </p>
      <button
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={checking}
        onClick={handleLogin}
        type="button"
      >
        <Icon name="shield" className="h-4 w-4" />
        {checking
          ? "Checking access..."
          : apiMode
            ? "Continue to Operations"
            : "Continue as Admin"}
      </button>
      {developmentLoginEnabled ? (
        <button
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={checking}
          onClick={() => void handleDevelopmentLogin()}
          type="button"
        >
          <Icon name="shield" className="h-4 w-4" />
          Development login
        </button>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-xl bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
