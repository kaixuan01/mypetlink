// Persisted Admin navigation preferences: which sidebar sections are open, and
// whether the whole desktop sidebar is collapsed to an icon rail.
//
// Read through useSyncExternalStore for the same reasons as the owner-portal
// sidebar: the value comes from localStorage on the client without a hydration
// mismatch (the server snapshot is always the default) and without calling
// setState inside an effect.
//
// Keys are versioned. If the stored shape ever changes, bump the suffix rather
// than trying to migrate a value that lives in someone's browser.

const SECTIONS_KEY = "mypetlink_admin_nav_sections_v1";
const RAIL_KEY = "mypetlink_admin_sidebar_collapsed_v1";

const sectionListeners = new Set<() => void>();
const railListeners = new Set<() => void>();

/** Section ids the user has explicitly collapsed. Absent = open. */
export type AdminNavSectionState = Record<string, boolean>;

const EMPTY: AdminNavSectionState = {};

let cachedRaw: string | null = null;
let cachedValue: AdminNavSectionState = EMPTY;

function readSections(): AdminNavSectionState {
  if (typeof window === "undefined") {
    return EMPTY;
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SECTIONS_KEY);
  } catch {
    return EMPTY;
  }

  if (raw === null) {
    return EMPTY;
  }

  // useSyncExternalStore compares snapshots by identity, so parsing on every
  // call would loop forever. Re-parse only when the stored text changed.
  if (raw === cachedRaw) {
    return cachedValue;
  }

  cachedRaw = raw;
  cachedValue = parseSections(raw);
  return cachedValue;
}

function parseSections(raw: string): AdminNavSectionState {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY;
    }

    // Trust nothing from storage: keep only string→boolean pairs.
    const safe: AdminNavSectionState = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        safe[key] = value;
      }
    }

    return safe;
  } catch {
    return EMPTY;
  }
}

export function getAdminNavSections(): AdminNavSectionState {
  return readSections();
}

export function getServerAdminNavSections(): AdminNavSectionState {
  return EMPTY;
}

export function setAdminNavSectionOpen(sectionId: string, open: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = { ...readSections(), [sectionId]: open };

  try {
    window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or quota: the click still works for this page view.
  }

  cachedRaw = null;
  sectionListeners.forEach((listener) => listener());
}

export function subscribeAdminNavSections(callback: () => void): () => void {
  sectionListeners.add(callback);

  function handleStorage(event: StorageEvent) {
    if (event.key === SECTIONS_KEY) {
      cachedRaw = null;
      callback();
    }
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    sectionListeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getAdminSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(RAIL_KEY) === "true";
  } catch {
    return false;
  }
}

export function getServerAdminSidebarCollapsed(): boolean {
  return false;
}

export function setAdminSidebarCollapsed(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(RAIL_KEY, value ? "true" : "false");
  } catch {
    // Ignore storage failures; the rail still toggles for this page view.
  }
  railListeners.forEach((listener) => listener());
}

export function subscribeAdminSidebarCollapsed(callback: () => void): () => void {
  railListeners.add(callback);

  function handleStorage(event: StorageEvent) {
    if (event.key === RAIL_KEY) {
      callback();
    }
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    railListeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}
