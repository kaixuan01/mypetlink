"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isOwnerAuthenticated } from "@/services/authService";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isOwnerAuthenticated()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-pet-cream px-4">
        <div className="brand-card rounded-[2rem] p-6 text-center">
          <p className="text-sm font-semibold text-pet-muted">
            Checking your session...
          </p>
        </div>
      </div>
    );
  }

  return children;
}
