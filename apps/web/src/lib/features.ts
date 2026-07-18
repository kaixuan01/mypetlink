// Frontend feature flags. These mirror the backend toggles so the UI hides
// actions the API would reject. They are build-time (NEXT_PUBLIC_*) values
// baked into the static export.
//
// Smart Tag ordering is OFF by default for the initial free-profiles launch,
// before physical tags are available from a manufacturer. Set
// NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=true to re-open ordering once the
// backend flag (Features:SmartTagOrderingEnabled) is also enabled.
export const smartTagOrderingEnabled =
  process.env.NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED === "true";

// Product availability for the current release. These gate owner-facing
// navigation, dashboard widgets, and pet actions only — routes, data, admin
// tools, and the public pages themselves keep working so existing links,
// QR codes, and NFC tags stay valid. Flip the env value to re-launch a
// feature; nothing is deleted while it is hidden.

/** The shareable Public Profile experience (launched). */
export const publicProfilesEnabled =
  process.env.NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED !== "false";

/**
 * Owner-facing Safety Profile management UI (badges, metrics, settings entry
 * points). The /q/{code} pages themselves stay reachable regardless.
 */
export const safetyProfilesOwnerUiEnabled =
  process.env.NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED === "true";

/** Smart Tags navigation, metrics, and pet actions. */
export const smartTagsEnabled =
  process.env.NEXT_PUBLIC_SMART_TAGS_ENABLED === "true";

/** Tag order history and purchase prompts; requires Smart Tags. */
export const tagOrdersEnabled = smartTagsEnabled && smartTagOrderingEnabled;
