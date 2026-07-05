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
