"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { checkAdminAccess, isAdminAuthenticated } from "@/services/authService";

type GuardState = "checking" | "ready" | "denied" | "error";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GuardState>("checking");

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      router.replace(`/admin/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    if (canUseApi()) {
      let active = true;

      // The backend decides operations access from an active AdminUsers
      // record; a signed-in owner without one gets 403 here.
      checkAdminAccess()
        .then((access) => {
          if (active) {
            setState(access?.admin.isActive ? "ready" : "denied");
          }
        })
        .catch((caught) => {
          if (!active) {
            return;
          }

          if (isApiClientError(caught) && caught.status === 403) {
            setState("denied");
            return;
          }

          if (isApiClientError(caught) && caught.status === 401) {
            router.replace(`/admin/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setState("error");
        });

      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(() => setState("ready"), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  if (state === "denied") {
    return (
      <GuardShell>
        <p className="text-sm font-bold uppercase text-slate-400">Admin access</p>
        <h1 className="mt-2 text-xl font-black text-slate-950">
          This account does not have operations access
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This area is for MyPetLink operations. If you need access, please
          contact the MyPetLink team.
        </p>
      </GuardShell>
    );
  }

  if (state === "error") {
    return (
      <GuardShell>
        <h1 className="text-xl font-black text-slate-950">
          We could not confirm your access
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Please check that MyPetLink is reachable, then try again.
        </p>
        <button
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-slate-950 bg-slate-950 px-5 text-sm font-extrabold text-white"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try Again
        </button>
      </GuardShell>
    );
  }

  if (state === "checking") {
    return (
      <GuardShell>
        <p className="text-sm font-semibold text-slate-500">
          Checking admin session...
        </p>
      </GuardShell>
    );
  }

  return children;
}

function GuardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f8f9] px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}
