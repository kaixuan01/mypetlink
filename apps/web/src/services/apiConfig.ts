export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

export function isApiConfigured() {
  return Boolean(getApiBaseUrl());
}

export function assertProductionApiConfiguration(
  environment = process.env.NODE_ENV,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
) {
  if (environment === "production" && !apiBaseUrl?.trim()) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for production builds. MyPetLink will not build in local preview mode for production."
    );
  }
}

export function assertProductionSafetyProfileOwnerUiConfiguration(
  environment = process.env.NODE_ENV,
  configured = process.env.NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED
) {
  if (environment === "production" && configured !== "true") {
    throw new Error(
      "NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED must be explicitly set to true for production builds."
    );
  }
}

export function isDevelopmentAdminLoginEnabled(
  environment = process.env.NODE_ENV,
  configured = process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED
) {
  return (
    environment === "development" &&
    configured === "true" &&
    isApiConfigured()
  );
}

export function canUseApi() {
  return typeof window !== "undefined" && isApiConfigured();
}

export function getGoogleClientId() {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}

export function getFrontendResilienceConfig() {
  return {
    maxAttempts: readBoundedInteger(
      process.env.NEXT_PUBLIC_DATABASE_WAKE_MAX_ATTEMPTS,
      6,
      1,
      10
    ),
    maximumWaitMs:
      readBoundedInteger(
        process.env.NEXT_PUBLIC_DATABASE_WAKE_MAXIMUM_WAIT_SECONDS,
        45,
        5,
        60
      ) * 1000,
  };
}

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, minimum), maximum)
    : fallback;
}
