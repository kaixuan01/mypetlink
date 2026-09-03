"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getAdminDashboardData,
  type AdminDashboardData,
} from "@/services/adminService";

type AdminOperationalContextValue = {
  dashboard: AdminDashboardData | null;
  error: string;
  refresh: () => Promise<void>;
};

const emptyContext: AdminOperationalContextValue = {
  dashboard: null,
  error: "",
  refresh: async () => undefined,
};

const AdminOperationalContext = createContext<AdminOperationalContextValue>(emptyContext);

export function AdminOperationalProvider({ children }: { children: React.ReactNode }) {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    const request = getAdminDashboardData()
      .then((next) => {
        if (mounted.current) {
          setDashboard(next);
          setError("");
        }
      })
      .catch(() => {
        if (mounted.current) {
          setError("We could not load the latest operations summary. Please refresh to try again.");
        }
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useRefreshWhenVisible(refresh);

  return (
    <AdminOperationalContext.Provider value={{ dashboard, error, refresh }}>
      {children}
    </AdminOperationalContext.Provider>
  );
}

export function useAdminOperationalData() {
  return useContext(AdminOperationalContext);
}

/**
 * Refreshes operational data when an administrator returns to the tab. Focus
 * and visibility commonly fire together, so a short coalescing window keeps
 * one return from becoming two requests. Initial loading remains owned by the
 * caller's existing effect.
 */
export function useRefreshWhenVisible(refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh);
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const handleReturn = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRefreshAt.current < 500) return;
      lastRefreshAt.current = now;
      void refreshRef.current();
    };

    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);
    return () => {
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, []);
}
