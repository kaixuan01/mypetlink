import { ownerRoutes, socialRoutes } from "@/lib/routes";

/**
 * Which half of MyPetLink a route belongs to.
 *
 * The product does two genuinely different jobs. **Community** is where
 * somebody browses and takes part: a feed, Explore, activity, their public
 * profile. **My Pets** is where they look after a real animal: pets, care
 * records, Smart Tags, orders, account settings.
 *
 * They share one account, one shell and one component system — but not one
 * navigation list. Showing eleven destinations at once served neither job, and
 * left the sidebar with two highlighted items because each half answered "am I
 * active" on its own.
 *
 * So the answer lives here, once. Every surface asks this file which mode it is
 * in rather than pattern-matching paths of its own, which is what stops the two
 * halves drifting apart again.
 */
export type AppMode = "community" | "pets";

export const appModeLabels: Record<AppMode, string> = {
  community: "Community",
  pets: "My Pets",
};

/**
 * Where each mode starts.
 *
 * Switching modes goes to a fixed, predictable destination rather than trying
 * to remember where somebody last was. A remembered route sounds helpful and
 * behaves unpredictably — it can drop you somewhere you have since lost access
 * to, or somewhere that no longer exists.
 */
export const appModeHome: Record<AppMode, string> = {
  community: socialRoutes.feed,
  pets: ownerRoutes.dashboard,
};

/** The Community routes, as prefixes or exact paths. */
const communityExact: string[] = [
  socialRoutes.feed,
  socialRoutes.explore,
  socialRoutes.search,
  socialRoutes.notifications,
  // Both the owner's own profile and its editor. The prefix rule below means
  // /community/profile also covers /community/profile/edit.
  ownerRoutes.socialProfile,
];

// A household's public profile, and one Moment on its own page. Both render
// outside the signed-in shell — a shared link has to work without an account —
// but they are Community content, and anything that asks which half of the
// product they belong to should hear the same answer.
const communityPrefixes: string[] = ["/u/", "/moments/"];

function normalise(pathname: string) {
  if (!pathname) {
    return "/";
  }

  // A trailing slash is the same page. Keep "/" itself intact.
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;

  return withoutQuery.length === 0 ? "/" : withoutQuery;
}

/**
 * Whether a route belongs to Community.
 *
 * Nested routes count: `/u/tanfamily/followers` is as much a Community page as
 * `/u/tanfamily`, and the sidebar must not switch modes underneath somebody who
 * tapped through to a follower list.
 */
export function isCommunityPath(pathname: string) {
  const path = normalise(pathname);

  return (
    communityExact.includes(path) ||
    communityExact.some((route) => path.startsWith(`${route}/`)) ||
    communityPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

export function getAppMode(pathname: string): AppMode {
  return isCommunityPath(pathname) ? "community" : "pets";
}

export function getOtherMode(mode: AppMode): AppMode {
  return mode === "community" ? "pets" : "community";
}

/** "Switch to My Pets" / "Switch to Community". */
export function getModeSwitchLabel(currentMode: AppMode) {
  return `Switch to ${appModeLabels[getOtherMode(currentMode)]}`;
}

export function getModeSwitchHref(currentMode: AppMode) {
  return appModeHome[getOtherMode(currentMode)];
}
