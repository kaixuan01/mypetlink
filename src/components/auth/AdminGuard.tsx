"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAdminAuthenticated } from "@/services/authService";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      router.replace(`/admin/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f9] px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Checking admin session...
          </p>
        </div>
      </div>
    );
  }

  return children;
}
