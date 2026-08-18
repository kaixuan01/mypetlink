// Frontend feature flags. These mirror the backend toggles so the UI hides
// actions the API would reject. They are build-time (NEXT_PUBLIC_*) values
// baked into the static export.
//
// Smart Tag ordering is OFF by default for the initial free-profiles launch,
// before physical tags are available from a manufacturer. Set
// NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=true to re-open ordering once the
// backend flag (Features:SmartTagOrderingEnabled) is also enabled.
function readPublicBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return defaultValue;
}

export const smartTagOrderingEnabled = readPublicBoolean(
  process.env.NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED,
  false
);

// Product availability for the current release. These gate owner-facing
// navigation, dashboard widgets, and pet actions only — routes, data, admin
// tools, and the public pages themselves keep working so existing links,
// QR codes, and NFC tags stay valid. Flip the env value to re-launch a
// feature; nothing is deleted while it is hidden.

/** The shareable Public Profile experience (launched). */
export const publicProfilesEnabled = readPublicBoolean(
  process.env.NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED,
  true
);

/**
 * Owner-facing Safety Profile management UI (badges, metrics, settings entry
 * points). The /q/{code} pages themselves stay reachable regardless.
 */
export const safetyProfilesOwnerUiEnabled = readPublicBoolean(
  process.env.NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED,
  false
);

/** Smart Tags navigation, metrics, and pet actions. */
export const smartTagsEnabled = readPublicBoolean(
  process.env.NEXT_PUBLIC_SMART_TAGS_ENABLED,
  false
);

/** Tag order history and owner entry points; direct routes remain compatible. */
export const tagOrdersEnabled =
  smartTagsEnabled &&
  readPublicBoolean(process.env.NEXT_PUBLIC_TAG_ORDERS_ENABLED, false);

/**
 * Shared owner-product availability used by navigation and tests. All values
 * are resolved once at build time, which keeps the static export and client
 * hydration consistent.
 */
export const ownerProductFeatures = Object.freeze({
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
  smartTagsEnabled,
  tagOrdersEnabled,
});

export type OwnerProductFeatures = typeof ownerProductFeatures;
