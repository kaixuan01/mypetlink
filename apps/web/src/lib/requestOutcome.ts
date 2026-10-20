import { isApiClientError } from "@/services/apiClient";

/**
 * Whether a failed write may still have been applied.
 *
 * A request that never left (no connection configured) or that the service
 * refused — validation, permission, conflict, rate limit — wrote nothing. A
 * request whose response was lost can have been applied, or still be
 * running: the API client reports a dropped connection as status 0
 * ("service_unavailable"), and a timeout or server failure (408, 5xx) can
 * arrive after the change was committed. Anything that is not a client
 * error — an aborted request, a response that could not be read — is treated
 * as unknown too.
 */
export function isUncertainRequestOutcome(error: unknown) {
  if (!isApiClientError(error)) return true;
  if (error.status === 0) return error.code !== "connection_not_configured";
  return error.status === 408 || error.status >= 500;
}
