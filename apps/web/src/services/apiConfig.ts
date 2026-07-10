export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

export function isApiConfigured() {
  return Boolean(getApiBaseUrl());
}

export function canUseApi() {
  return typeof window !== "undefined" && isApiConfigured();
}

export function getGoogleClientId() {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}
