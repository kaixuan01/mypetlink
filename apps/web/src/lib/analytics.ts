export const AnalyticsEvent = {
  PageView: "page_view",
  PetCreateStarted: "pet_create_started",
  PetCreated: "pet_created",
  PublicProfileViewed: "public_profile_viewed",
  MomentCreated: "moment_created",
  ShareClicked: "share_clicked",
  ShareLinkCopied: "share_link_copied",
  CareRecordCreated: "care_record_created",
  SmartTagViewed: "smart_tag_viewed",
  OrderStarted: "order_started",
  OrderSubmitted: "order_submitted",
} as const;

export type AnalyticsSurface =
  | "public_profile"
  | "owner_portal"
  | "owner_tags"
  | "pet_tags";

export type AnalyticsRecordType =
  | "vaccine"
  | "deworming"
  | "grooming"
  | "vet_visit"
  | "medication"
  | "allergy"
  | "surgery"
  | "lab_test"
  | "other";

export type AnalyticsTagType = "qr" | "qr_nfc" | "mixed";

type AnalyticsPayloads = {
  pet_create_started: { source: "owner_portal" };
  pet_created: { source: "owner_portal" };
  public_profile_viewed: { surface: "public_profile" };
  moment_created: { source: "owner_portal" };
  share_clicked: { surface: "public_profile" | "owner_portal" };
  share_link_copied: { surface: "public_profile" | "owner_portal" };
  care_record_created: {
    source: "owner_portal";
    record_type: AnalyticsRecordType;
  };
  smart_tag_viewed: { surface: "owner_tags" | "pet_tags" };
  order_started: { source: "owner_portal"; tag_type: AnalyticsTagType };
  order_submitted: {
    source: "owner_portal";
    tag_type: AnalyticsTagType;
    item_count: number;
  };
};

type AnalyticsEventName = keyof AnalyticsPayloads;
type AnalyticsValue = string | number;
type AnalyticsParameters = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __myPetLinkGaMeasurementId?: string;
  }
}

const measurementIdPattern = /^G-[A-Z0-9]{6,20}$/i;
const allowedValues = {
  source: new Set(["owner_portal"]),
  surface: new Set(["public_profile", "owner_portal", "owner_tags", "pet_tags"]),
  record_type: new Set([
    "vaccine",
    "deworming",
    "grooming",
    "vet_visit",
    "medication",
    "allergy",
    "surgery",
    "lab_test",
    "other",
  ]),
  tag_type: new Set(["qr", "qr_nfc", "mixed"]),
} as const;

const allowedKeys: Record<AnalyticsEventName, readonly string[]> = {
  pet_create_started: ["source"],
  pet_created: ["source"],
  public_profile_viewed: ["surface"],
  moment_created: ["source"],
  share_clicked: ["surface"],
  share_link_copied: ["surface"],
  care_record_created: ["source", "record_type"],
  smart_tag_viewed: ["surface"],
  order_started: ["source", "tag_type"],
  order_submitted: ["source", "tag_type", "item_count"],
};

export function getAnalyticsMeasurementId(
  value = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
) {
  const trimmed = value?.trim();
  return trimmed && measurementIdPattern.test(trimmed)
    ? trimmed.toUpperCase()
    : null;
}

export function sanitizeAnalyticsPath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  const segments = path.split("/").filter(Boolean);

  if (["p", "q", "t", "n", "activate"].includes(segments[0]) && segments[1]) {
    const labels: Record<string, string> = {
      p: "profile",
      q: "safety-profile",
      t: "tag",
      n: "tag",
      activate: "tag",
    };
    segments[1] = `[${labels[segments[0]]}]`;
  } else if (segments[0] === "pets" && segments[1] && segments[1] !== "new") {
    segments[1] = "[pet]";
  }

  return segments.length ? `/${segments.join("/")}` : "/";
}

export function toAnalyticsRecordType(value: string): AnalyticsRecordType {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  return allowedValues.record_type.has(normalized as AnalyticsRecordType)
    ? (normalized as AnalyticsRecordType)
    : "other";
}

export function initializeAnalytics() {
  const measurementId = getAnalyticsMeasurementId();
  if (!measurementId || typeof window === "undefined") return false;
  if (window.__myPetLinkGaMeasurementId === measurementId && window.gtag) {
    return true;
  }

  window.dataLayer ??= [];
  window.gtag ??= function gtag(..._args: unknown[]) {
    window.dataLayer?.push(arguments);
  };
  sendToProvider("js", new Date());
  sendToProvider("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    anonymize_ip: true,
  });
  window.__myPetLinkGaMeasurementId = measurementId;
  return true;
}

export function trackPageView(pathname: string) {
  if (!initializeAnalytics()) return;
  sendToProvider("event", AnalyticsEvent.PageView, pageContext(pathname));
}

export function trackEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  payload: AnalyticsPayloads[EventName]
) {
  if (!initializeAnalytics()) return;
  sendToProvider("event", eventName, {
    ...sanitizeParameters(eventName, payload as Record<string, unknown>),
    ...pageContext(window.location.pathname),
  });
}

function sendToProvider(...args: unknown[]) {
  try {
    window.gtag?.(...args);
  } catch {
    // Analytics must never interrupt the user action being measured.
  }
}

function pageContext(pathname: string): AnalyticsParameters {
  const pagePath = sanitizeAnalyticsPath(pathname);
  return {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: pagePath,
  };
}

function sanitizeParameters(
  eventName: AnalyticsEventName,
  payload: Record<string, unknown>
): AnalyticsParameters {
  const result: AnalyticsParameters = {};

  for (const key of allowedKeys[eventName]) {
    const value = payload[key];
    if (key === "item_count") {
      if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20) {
        result[key] = value;
      }
      continue;
    }

    const values = allowedValues[key as keyof typeof allowedValues];
    if (typeof value === "string" && values?.has(value as never)) {
      result[key] = value;
    }
  }

  return result;
}
