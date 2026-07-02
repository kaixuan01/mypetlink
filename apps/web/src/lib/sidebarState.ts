// Persisted collapse state for the owner-portal desktop sidebar.
//
// Read through useSyncExternalStore so the value comes from localStorage on the
// client without a hydration mismatch (the server snapshot is always
// "expanded") and without calling setState inside an effect.

const STORAGE_KEY = "mypetlink_sidebar_collapsed";

const listeners = new Set<() => void>();

export function getSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function getServerSidebarCollapsed(): boolean {
  return false;
}

export function setSidebarCollapsed(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Ignore storage failures (private mode, quota); state stays in-memory.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSidebarCollapsed(callback: () => void): () => void {
  listeners.add(callback);

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}
