import type { ApiResponse } from "@/types";

export async function mockDelay(ms = 80) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function mockResponse<T>(
  data: T,
  meta?: Partial<ApiResponse<T>["meta"]>
): ApiResponse<T> {
  return {
    data,
    meta: {
      requestId: `mock_${Date.now()}`,
      source: "mock",
      ...meta,
    },
  };
}

export function readStoredCollection<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    const stored = JSON.parse(value) as T[];

    if (!Array.isArray(stored)) {
      return fallback;
    }

    return mergeStoredWithFallback(stored, fallback);
  } catch {
    return fallback;
  }
}

export function writeStoredCollection<T>(key: string, values: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(values));
}

function mergeStoredWithFallback<T>(stored: T[], fallback: T[]) {
  const seenIds = new Set<string>();
  const merged: T[] = [];

  for (const item of stored) {
    const id = collectionId(item);

    if (id) {
      if (seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
    }

    merged.push(item);
  }

  for (const item of fallback) {
    const id = collectionId(item);

    if (id) {
      if (seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
    }

    merged.push(item);
  }

  return merged;
}

function collectionId(value: unknown) {
  if (!value || typeof value !== "object" || !("id" in value)) {
    return "";
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : "";
}
