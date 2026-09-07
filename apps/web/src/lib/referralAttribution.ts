export const REFERRAL_ATTRIBUTION_STORAGE_KEY =
  "mypetlink_referral_first_touch_v1";
export const REFERRAL_ATTRIBUTION_WINDOW_DAYS = 90;

export type StoredReferralAttribution = {
  code: string;
  capturedAt: string;
};

const codePattern = /^[A-Z0-9]{3,24}$/;
const reservedCodes = new Set(["ADMIN", "API", "LOGIN", "WWW", "AUTH"]);

export function normalizeReferralCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return codePattern.test(normalized) && !reservedCodes.has(normalized)
    ? normalized
    : null;
}

export function captureReferralFromUrl(
  href: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  now: Date,
  ownerIsAuthenticated: boolean
) {
  const url = new URL(href);
  const rawCode = url.searchParams.get("ref");
  if (rawCode === null) return null;

  url.searchParams.delete("ref");
  const cleanedUrl = `${url.pathname}${url.search}${url.hash}`;
  if (ownerIsAuthenticated) return cleanedUrl;

  const existing = readStoredReferral(storage, now);
  if (!existing) {
    const code = normalizeReferralCode(rawCode);
    if (code) {
      storage.setItem(
        REFERRAL_ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({ code, capturedAt: now.toISOString() })
      );
    }
  }
  return cleanedUrl;
}

export function readStoredReferral(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = new Date()
): StoredReferralAttribution | null {
  const raw = storage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredReferralAttribution>;
    const code = normalizeReferralCode(parsed.code);
    const capturedAt = new Date(parsed.capturedAt ?? "");
    const maxAgeMs = REFERRAL_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (
      !code ||
      !Number.isFinite(capturedAt.getTime()) ||
      capturedAt.getTime() > now.getTime() ||
      now.getTime() - capturedAt.getTime() > maxAgeMs
    ) {
      storage.removeItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return { code, capturedAt: capturedAt.toISOString() };
  } catch {
    storage.removeItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
    return null;
  }
}

export function clearStoredReferral(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
}

export function referralUrl(siteUrl: string, code: string) {
  const url = new URL(siteUrl);
  url.searchParams.set("ref", code);
  return url.toString();
}
