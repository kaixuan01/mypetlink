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
  CompletionPromptViewed: "completion_prompt_viewed",
  CompletionActionClicked: "completion_action_clicked",
  ShareCardViewed: "share_card_viewed",
  ShareCardShared: "share_card_shared",
  ShareCardAction: "share_card_action",
  CreateProfileCtaClicked: "create_profile_cta_clicked",
  SocialFeedViewed: "social_feed_viewed",
  SocialFeedPageLoaded: "social_feed_page_loaded",
  SocialExploreViewed: "social_explore_viewed",
  SocialSearchPerformed: "social_search_performed",
  SocialProfileViewed: "social_profile_viewed",
  PetFollowed: "pet_followed",
  PetUnfollowed: "pet_unfollowed",
  MomentLiked: "moment_liked",
  MomentUnliked: "moment_unliked",
  SafetyToPublicProfileClicked: "safety_to_public_profile_clicked",
  WeeklyRecapOpened: "weekly_recap_opened",
  WeeklyRecapWeekChanged: "weekly_recap_week_changed",
  WeeklyRecapAction: "weekly_recap_action",
} as const;

/**
 * Where a social action happened. Categorical on purpose — this is how the
 * Explore-to-follow and feed-to-like funnels are read, and it is the only
 * thing about the content that ever leaves the browser.
 */
export type AnalyticsSocialSource =
  | "feed"
  | "explore"
  | "search"
  | "direct"
  | "safety";

/** Which kind of profile was opened. Never which one. */
export type AnalyticsProfileType = "pet" | "owner";

/** The two search tabs, named as the UI names them. */
export type AnalyticsSearchTab = "pets" | "pet_parents";

/**
 * How many results came back, in buckets.
 *
 * A bucket answers "did search work" without recording what anybody looked
 * for. An exact count plus a timestamp is most of the way to a query log.
 */
export type AnalyticsCountBucket = "0" | "1_5" | "6_plus";

/**
 * How long the query was, in buckets. Never the query itself — not truncated,
 * not hashed, not "just the first letters".
 */
export type AnalyticsQueryLengthBucket = "2_3" | "4_8" | "9_plus";

export type AnalyticsLostModeState = "on" | "off";

/** How the owner reached a Weekly Recap. Never which pet or which week. */
export type AnalyticsRecapSource = "dashboard" | "pet_hub" | "direct";

/**
 * What the recap showed when it opened. "unavailable" covers a pet that has
 * no recap (memorial, archived, not found); "error" a failed read.
 */
export type AnalyticsRecapState = "has_activity" | "quiet" | "error" | "unavailable";

/** The next step an owner took from a recap — the habit loop it is for. */
export type AnalyticsRecapAction =
  | "add_moment"
  | "open_moment"
  | "log_care"
  | "log_as_done"
  | "view_planner";

export function toAnalyticsCountBucket(count: number): AnalyticsCountBucket {
  if (count <= 0) return "0";
  return count <= 5 ? "1_5" : "6_plus";
}

export function toAnalyticsQueryLengthBucket(
  length: number
): AnalyticsQueryLengthBucket {
  if (length <= 3) return "2_3";
  return length <= 8 ? "4_8" : "9_plus";
}

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
export type AnalyticsCardVariant = "profile" | "birthday";
/**
 * What an owner did with a Share Card in the app. Handing the card to the
 * system share sheet stays its own event (`share_card_shared`) because it is a
 * different moment: these three are actions the app can see complete.
 */
export type AnalyticsCardAction = "save" | "copy_link" | "open_image";
export type AnalyticsCompletionItem =
  | "photo"
  | "basics"
  | "personality"
  | "birthday"
  | "moment"
  | "contact"
  | "bio"
  | "care_record";

type AnalyticsPayloads = {
  pet_create_started: { source: "owner_portal" };
  pet_created: { source: "owner_portal" };
  public_profile_viewed: { surface: "public_profile" };
  moment_created: { source: "owner_portal" | "community" };
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
  completion_prompt_viewed: { surface: "owner_portal" };
  completion_action_clicked: {
    surface: "owner_portal";
    completion_item: AnalyticsCompletionItem;
  };
  share_card_viewed: { card_variant: AnalyticsCardVariant };
  share_card_shared: { card_variant: AnalyticsCardVariant };
  share_card_action: {
    card_variant: AnalyticsCardVariant;
    card_action: AnalyticsCardAction;
  };
  create_profile_cta_clicked: { surface: "public_profile" };

  /** Once, when the feed screen opens. */
  social_feed_viewed: { source: "feed" };

  /**
   * Each successful page fetched WITH a cursor — so the first page is counted
   * once, by social_feed_viewed, and never twice.
   */
  social_feed_page_loaded: { source: "feed" };

  social_explore_viewed: { source: "explore" };

  social_search_performed: {
    source: "search";
    result_tab: AnalyticsSearchTab;
    result_count_bucket: AnalyticsCountBucket;
    query_length_bucket: AnalyticsQueryLengthBucket;
  };

  social_profile_viewed: {
    source: AnalyticsSocialSource;
    profile_type: AnalyticsProfileType;
  };

  pet_followed: { source: AnalyticsSocialSource };
  pet_unfollowed: { source: AnalyticsSocialSource };
  moment_liked: { source: AnalyticsSocialSource };
  moment_unliked: { source: AnalyticsSocialSource };

  safety_to_public_profile_clicked: {
    source: "safety";
    lost_mode: AnalyticsLostModeState;
  };

  /** Once per visit, when the first read settles. */
  weekly_recap_opened: {
    source: AnalyticsRecapSource;
    recap_state: AnalyticsRecapState;
  };
  weekly_recap_week_changed: { direction: "previous" | "next" };
  weekly_recap_action: { recap_action: AnalyticsRecapAction };
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
  source: new Set([
    "owner_portal",
    "feed",
    "explore",
    "search",
    "direct",
    "safety",
    "dashboard",
    "pet_hub",
  ]),
  recap_state: new Set(["has_activity", "quiet", "error", "unavailable"]),
  direction: new Set(["previous", "next"]),
  recap_action: new Set([
    "add_moment",
    "open_moment",
    "log_care",
    "log_as_done",
    "view_planner",
  ]),
  profile_type: new Set(["pet", "owner"]),
  result_tab: new Set(["pets", "pet_parents"]),
  result_count_bucket: new Set(["0", "1_5", "6_plus"]),
  query_length_bucket: new Set(["2_3", "4_8", "9_plus"]),
  lost_mode: new Set(["on", "off"]),
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
  completion_item: new Set([
    "photo",
    "basics",
    "personality",
    "birthday",
    "moment",
    "contact",
    "bio",
    "care_record",
  ]),
  card_variant: new Set(["profile", "birthday"]),
  card_action: new Set(["save", "copy_link", "open_image"]),
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
  completion_prompt_viewed: ["surface"],
  completion_action_clicked: ["surface", "completion_item"],
  share_card_viewed: ["card_variant"],
  share_card_shared: ["card_variant"],
  share_card_action: ["card_variant", "card_action"],
  create_profile_cta_clicked: ["surface"],
  social_feed_viewed: ["source"],
  social_feed_page_loaded: ["source"],
  social_explore_viewed: ["source"],
  // Deliberately no "q", no "query", no "term". There is no key here through
  // which raw search text could travel, so it cannot be added by accident.
  social_search_performed: [
    "source",
    "result_tab",
    "result_count_bucket",
    "query_length_bucket",
  ],
  social_profile_viewed: ["source", "profile_type"],
  pet_followed: ["source"],
  pet_unfollowed: ["source"],
  moment_liked: ["source"],
  moment_unliked: ["source"],
  safety_to_public_profile_clicked: ["source", "lost_mode"],
  weekly_recap_opened: ["source", "recap_state"],
  weekly_recap_week_changed: ["direction"],
  weekly_recap_action: ["recap_action"],
};

function parseMeasurementId(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && measurementIdPattern.test(trimmed)
    ? trimmed.toUpperCase()
    : null;
}

/**
 * The GA4 stream analytics may send to, or null — and null unless a person
 * has checked that stream's own settings.
 *
 * This file controls only what the app itself sends. Google's tag also
 * collects on its own, by the stream's Enhanced Measurement settings: page
 * views on every history change (with the full address and query), outbound
 * link clicks (a WhatsApp link carries the owner's number and the pet's name),
 * site search terms, file downloads and form interactions. None of that
 * passes through the allowlist below. So analytics fails closed: it runs
 * only when `NEXT_PUBLIC_GA_PRIVACY_VERIFIED_ID` names the same measurement
 * id, set after those settings were checked as
 * `docs/operations/product-analytics.md` describes. A new or changed stream
 * id needs its own check.
 */
export function getAnalyticsMeasurementId(
  value = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  verifiedValue = process.env.NEXT_PUBLIC_GA_PRIVACY_VERIFIED_ID
) {
  const measurementId = parseMeasurementId(value);
  return measurementId && parseMeasurementId(verifiedValue) === measurementId
    ? measurementId
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
  } else if (segments[0] === "u" && segments[1]) {
    segments[1] = "[handle]";
  } else if (segments[0] === "moments" && segments[1]) {
    // `/moments` alone is the owner's Moments page; anything below it is one
    // Moment's public page and its id.
    segments[1] = "[moment]";
  } else if (segments[0] === "social" && segments[1] === "pets" && segments[2]) {
    segments[2] = "[profile]";
  }

  return segments.length ? `/${segments.join("/")}` : "/";
}

/**
 * The referrer as the provider may see it: another site by its origin only,
 * and MyPetLink's own pages by their sanitized path. A referrer is a full URL
 * and would otherwise carry the slugs, codes and query strings that page
 * paths never do.
 */
export function sanitizeAnalyticsReferrer(referrer: string, origin: string) {
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "";
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  return url.origin === origin
    ? `${url.origin}${sanitizeAnalyticsPath(url.pathname)}`
    : url.origin;
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
  // Google's tag runs a queued entry as a command only when it is the
  // function's own `arguments` object, as in Google's install snippet. A rest
  // array is read as a data-layer push instead, so every config and event
  // would be ignored without any error.
  window.gtag ??= function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  const initialPath = sanitizeAnalyticsPath(window.location.pathname);
  sendToProvider("js", new Date());
  sendToProvider("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    anonymize_ip: true,
    // Without these the tag reads the raw address bar and referrer for every
    // hit, slugs and query strings included.
    // The document title carries pet and owner names; the path stands in.
    page_location: `${window.location.origin}${initialPath}`,
    page_title: initialPath,
    page_referrer: sanitizeAnalyticsReferrer(
      document.referrer,
      window.location.origin
    ),
  });
  window.__myPetLinkGaMeasurementId = measurementId;
  return true;
}

export function trackPageView(pathname: string) {
  if (!initializeAnalytics()) return;
  const context = pageContext(pathname);
  // Events the tag sends by itself (engagement, session start) take the
  // current page from here, not from the address bar or the title.
  sendToProvider("set", {
    page_location: context.page_location,
    page_title: context.page_title,
  });
  sendToProvider("event", AnalyticsEvent.PageView, context);
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
