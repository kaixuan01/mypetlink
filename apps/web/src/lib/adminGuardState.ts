import { isAbortError, isApiClientError } from "@/services/apiClient";

// Distinct outcomes for an Admin access check, so the guard can react correctly
// instead of collapsing every non-success into one "connection issue" screen.
export type AdminGuardOutcome =
  | "denied" // 403: authenticated but not an active admin
  | "sessionExpired" // 401 after refresh failed: send to login
  | "temporarilyUnavailable" // 503 database_waking_up / network unreachable
  | "cancelled" // request aborted by navigation/unmount: not an error
  | "error"; // unexpected (500 or anything else)

// Maps a rejected checkAdminAccess() to an outcome. Kept pure and framework-free
// so the mapping is unit-testable and identical everywhere it is used.
export function classifyAdminAccessError(error: unknown): AdminGuardOutcome {
  if (isAbortError(error)) {
    return "cancelled";
  }

  if (isApiClientError(error)) {
    if (error.status === 403) {
      return "denied";
    }

    if (error.status === 401) {
      return "sessionExpired";
    }

    // A confirmed temporary database wake-up, or the app not being reachable at
    // all (status 0), is retryable — never a hard error and never "denied".
    if (
      error.code === "database_waking_up" ||
      error.status === 503 ||
      error.status === 0
    ) {
      return "temporarilyUnavailable";
    }

    // Real application/server errors (e.g. 500) must NOT be dressed up as a
    // temporary wake-up.
    return "error";
  }

  return "error";
}
