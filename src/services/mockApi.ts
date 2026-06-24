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
    return JSON.parse(value) as T[];
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
