"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { loginMockAdmin } from "@/services/authService";

export function AdminLoginPanel() {
  const router = useRouter();

  function handleLogin() {
    loginMockAdmin();
    router.replace("/admin");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white">
        <Icon name="shield" className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-3xl font-black text-slate-950">
        Admin Sign In
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Manage users, pet profiles, smart tags, and plans.
      </p>
      <button
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        onClick={handleLogin}
        type="button"
      >
        <Icon name="shield" className="h-4 w-4" />
        Continue as Demo Admin
      </button>
    </div>
  );
}
