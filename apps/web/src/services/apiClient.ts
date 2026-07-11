import {
  getApiBaseUrl,
  getFrontendResilienceConfig,
} from "@/services/apiConfig";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  updateStoredAuthTokens,
} from "@/services/authStorage";
import {
  createWakeUpRequestId,
  markWakeUpFailed,
  markWakeUpRetrying,
  markWakeUpSucceeded,
  registerWakeUpCancellation,
} from "@/services/serviceWakeUp";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]> | null;
  };
  meta?: {
    requestId?: string;
    page?: number | null;
    pageSize?: number | null;
    total?: number | null;
    retryAfterSeconds?: number | null;
  };
};

export type ApiRequestOptions = {
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  signal?: AbortSignal;
};

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[]> | null;
  retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string[]> | null,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiEnvelope<T>> {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw new ApiClientError(
      0,
      "connection_not_configured",
      "MyPetLink connection is not configured."
    );
  }

  return request<T>(baseUrl, path, options);
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions
): Promise<ApiEnvelope<T>> {
  const headers = new Headers();
  const hasBody = options.body !== undefined;
  const session = options.auth === false ? null : readStoredAuthSession();

  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const method = options.method ?? (hasBody ? "POST" : "GET");
  const response = await fetchWithDatabaseWakeRetry(`${baseUrl}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.retryOnUnauthorized !== false &&
    (await refreshAccessToken(baseUrl))
  ) {
    return request<T>(baseUrl, path, {
      ...options,
      retryOnUnauthorized: false,
    });
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const envelope = await readEnvelope<T>(response);

  if (!response.ok) {
    const error = envelope.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? `http_${response.status}`,
      error?.code === "database_waking_up"
        ? "MyPetLink needs a little more time. Please try again in a moment."
        : error?.message ?? "Something went wrong.",
      error?.details,
      envelope.meta?.retryAfterSeconds ?? undefined
    );
  }

  return envelope;
}

export type BlobResponse = { blob: Blob; fileName?: string };

// Fetches a binary document (e.g. a PDF) with auth, mirroring the JSON client's
// 401-refresh behavior. Non-OK responses still carry the JSON error envelope,
// so we surface the friendly server message.
export async function apiRequestBlob(
  path: string,
  options: {
    auth?: boolean;
    retryOnUnauthorized?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<BlobResponse> {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw new ApiClientError(
      0,
      "connection_not_configured",
      "MyPetLink connection is not configured."
    );
  }

  return requestBlob(baseUrl, path, options);
}

async function requestBlob(
  baseUrl: string,
  path: string,
  options: {
    auth?: boolean;
    retryOnUnauthorized?: boolean;
    signal?: AbortSignal;
  }
): Promise<BlobResponse> {
  const headers = new Headers();
  const session = options.auth === false ? null : readStoredAuthSession();

  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetchWithDatabaseWakeRetry(`${baseUrl}${path}`, {
    method: "GET",
    headers,
    signal: options.signal,
  });

  if (
    response.status === 401 &&
    options.auth !== false &&
    options.retryOnUnauthorized !== false &&
    (await refreshAccessToken(baseUrl))
  ) {
    return requestBlob(baseUrl, path, { ...options, retryOnUnauthorized: false });
  }

  if (!response.ok) {
    let code = `http_${response.status}`;
    let message = "We could not generate this document. Please try again.";

    try {
      const envelope = (await response.json()) as ApiEnvelope<unknown>;

      if (envelope.error) {
        code = envelope.error.code ?? code;
        message =
          envelope.error.code === "database_waking_up"
            ? "MyPetLink needs a little more time. Please try again in a moment."
            : envelope.error.message ?? message;
      }
    } catch {
      // Non-JSON error body; keep the default message.
    }

    throw new ApiClientError(response.status, code, message);
  }

  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFileName(
      response.headers.get("Content-Disposition")
    ),
  };
}

function parseContentDispositionFileName(headerValue: string | null) {
  if (!headerValue) {
    return undefined;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // Fall through to the plain filename form.
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return plainMatch?.[1];
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return {};
  }
}

async function refreshAccessToken(baseUrl: string) {
  const session = readStoredAuthSession();

  if (!session?.refreshToken) {
    return false;
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    throw new ApiClientError(
      0,
      "service_unavailable",
      "We could not reach MyPetLink right now. Please try again."
    );
  }

  const envelope = (await readEnvelope<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>(response));

  if (!response.ok) {
    if (response.status === 503 && envelope.error?.code === "database_waking_up") {
      throw new ApiClientError(
        response.status,
        envelope.error.code,
        "MyPetLink needs a little more time. Please try again in a moment.",
        envelope.error.details,
        envelope.meta?.retryAfterSeconds ?? undefined
      );
    }

    if (response.status === 400 || response.status === 401) {
      clearStoredAuthSession();
      return false;
    }

    throw new ApiClientError(
      response.status,
      envelope.error?.code ?? `http_${response.status}`,
      envelope.error?.message ?? "We couldn't confirm your session. Please try again."
    );
  }

  if (!envelope.data?.accessToken || !envelope.data.refreshToken) {
    clearStoredAuthSession();
    return false;
  }

  updateStoredAuthTokens(envelope.data);
  return true;
}

const fallbackRetryDelaysMs = [2000, 4000, 7000, 10000];

async function fetchWithDatabaseWakeRetry(
  url: string,
  init: RequestInit & { method: string }
) {
  const method = init.method.toUpperCase();
  const safeToRetry = method === "GET" || method === "HEAD";
  const resilience = getFrontendResilienceConfig();
  const requestId = safeToRetry ? createWakeUpRequestId() : null;
  const navigationController = safeToRetry ? new AbortController() : null;
  const callerSignal = init.signal;
  const forwardCallerAbort = () => navigationController?.abort();
  callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });
  if (callerSignal?.aborted) navigationController?.abort();
  const requestInit = navigationController
    ? { ...init, signal: navigationController.signal }
    : init;
  const unregisterCancellation =
    requestId && navigationController
      ? registerWakeUpCancellation(requestId, () => navigationController.abort())
      : () => undefined;
  let totalWaitMs = 0;

  try {
    for (let attempt = 1; attempt <= resilience.maxAttempts; attempt += 1) {
      throwIfAborted(requestInit.signal);

      let response: Response;
      try {
        response = await fetch(url, requestInit);
      } catch (error) {
        if (requestId) markWakeUpSucceeded(requestId);
        if (isAbortError(error) || requestInit.signal?.aborted) throw error;

        throw new ApiClientError(
          0,
          "service_unavailable",
          "We could not reach MyPetLink right now. Please try again."
        );
      }

      const wakeUpResponse = await isDatabaseWakeUpResponse(response);
      if (!wakeUpResponse || !safeToRetry || !requestId) {
        if (requestId) markWakeUpSucceeded(requestId);
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      const delayMs = Math.min(
        retryAfterMs ?? retryDelayWithJitter(attempt),
        Math.max(0, resilience.maximumWaitMs - totalWaitMs)
      );
      const canRetry =
        attempt < resilience.maxAttempts &&
        delayMs > 0 &&
        totalWaitMs + delayMs <= resilience.maximumWaitMs;

      if (!canRetry) {
        markWakeUpFailed(requestId, attempt);
        return response;
      }

      markWakeUpRetrying(requestId, attempt);
      try {
        await abortableDelay(delayMs, requestInit.signal);
      } catch (error) {
        markWakeUpSucceeded(requestId);
        throw error;
      }
      totalWaitMs += delayMs;
    }

    throw new Error("Unreachable retry state.");
  } finally {
    unregisterCancellation();
    callerSignal?.removeEventListener("abort", forwardCallerAbort);
  }
}

async function isDatabaseWakeUpResponse(response: Response) {
  if (response.status !== 503) return false;

  try {
    const envelope = (await response.clone().json()) as ApiEnvelope<unknown>;
    return envelope.error?.code === "database_waking_up";
  } catch {
    return false;
  }
}

function parseRetryAfterMs(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function retryDelayWithJitter(attempt: number) {
  const base = fallbackRetryDelaysMs[Math.min(attempt - 1, fallbackRetryDelaysMs.length - 1)];
  return Math.round(base * (0.9 + Math.random() * 0.2));
}

function abortableDelay(delayMs: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = window.setTimeout(finish, delayMs);
    const abort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("The request was cancelled.", "AbortError"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal | null) {
  if (signal?.aborted) {
    throw new DOMException("The request was cancelled.", "AbortError");
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
