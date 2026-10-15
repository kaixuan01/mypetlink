"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

function sameMerchantContext(first: string, second: string) {
  const a = new URL(first), b = new URL(second);
  return a.origin === b.origin && a.pathname === b.pathname && ["tab", "open", "edit"].every(key => a.searchParams.get(key) === b.searchParams.get(key));
}
// Scoped to the merchant workspace. Protect button navigation, links, Back and
// reload; drafts remain in memory until an explicit discard or successful save.
export function useMerchantDraftGuard() {
  const dirty = useRef(false);
  const retained = useRef<{ url: string; state: unknown } | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const onDirtyChange = useCallback((value: boolean) => {
    if (value && !dirty.current) retained.current = { url: window.location.href, state: window.history.state };
    dirty.current = value;
  }, []);
  const navigate = useCallback((action: () => void) => {
    if (dirty.current) setPending(() => action); else action();
  }, []);
  useLayoutEffect(() => {
    retained.current = { url: window.location.href, state: window.history.state };
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const link = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (sameMerchantContext(destination.href, window.location.href)) return;
      event.preventDefault(); event.stopPropagation();
      navigate(() => window.location.assign(anchor.href));
    };
    const back = (event: PopStateEvent, delta = 0) => {
      const destination = window.location.href;
      const destinationState = window.history.state;
      if (dirty.current && retained.current && !sameMerchantContext(destination, retained.current.url)) {
        event.stopImmediatePropagation();
        if (delta !== 0) {
          // Undo traversal without replacing either entry. Next sees only the
          // retained route; explicit discard repeats the original traversal.
          window.history.go(-delta);
          navigate(() => window.history.go(delta));
        } else {
          // Unindexed entries (including embedded hosts) retain a safe fallback.
          const replace = window.__merchantDraftHistory?.replace ?? window.history.replaceState.bind(window.history);
          replace(retained.current.state, "", retained.current.url);
          navigate(() => { replace(destinationState, "", destination); window.dispatchEvent(new PopStateEvent("popstate", { state: destinationState })); });
        }
      } else { retained.current = { url: destination, state: destinationState }; }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", link, true);
    const bridge = window.__merchantDraftHistory;
    if (bridge) bridge.guard = back;
    else window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", warn); document.removeEventListener("click", link, true);
      if (bridge?.guard === back) bridge.guard = null;
      window.removeEventListener("popstate", back, true);
    };
  }, [navigate]);
  return { onDirtyChange, navigate, pending,
    cancel: () => setPending(null),
    discard: () => { const action = pending; dirty.current = false; setPending(null); action?.(); } };
}
