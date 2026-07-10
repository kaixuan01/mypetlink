import { getApiBaseUrl } from "@/services/apiConfig";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  updateStoredAuthTokens,
} from "@/services/authStorage";

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
  };
};

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[]> | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string[]> | null
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
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

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? (hasBody ? "POST" : "GET"),
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      0,
      "service_unavailable",
      "We could not reach MyPetLink right now. Please try again."
    );
  }

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
      error?.message ?? "Something went wrong.",
      error?.details
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
  options: { auth?: boolean; retryOnUnauthorized?: boolean } = {}
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
  options: { auth?: boolean; retryOnUnauthorized?: boolean }
): Promise<BlobResponse> {
  const headers = new Headers();
  const session = options.auth === false ? null : readStoredAuthSession();

  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, { method: "GET", headers });
  } catch {
    throw new ApiClientError(
      0,
      "service_unavailable",
      "We could not reach MyPetLink right now. Please try again."
    );
  }

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
        message = envelope.error.message ?? message;
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
    return false;
  }

  if (!response.ok) {
    clearStoredAuthSession();
    return false;
  }

  const envelope = (await response.json()) as ApiEnvelope<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>;

  if (!envelope.data?.accessToken || !envelope.data.refreshToken) {
    clearStoredAuthSession();
    return false;
  }

  updateStoredAuthTokens(envelope.data);
  return true;
}
