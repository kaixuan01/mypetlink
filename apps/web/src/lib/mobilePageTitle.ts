import { ownerRoutes, socialRoutes } from "@/lib/routes";

/**
 * What the compact mobile header calls the page you are on.
 *
 * One list, because the alternative is a pathname check in every component that
 * wants to name the current screen — and those drift. It is deliberately not the
 * navigation label: a bar four words wide wants "Home", not "Dashboard", and
 * "Pets", not "My Pets". It is also not the page's own heading, which is longer
 * and says more because it has a whole page to say it in.
 *
 * Longest match wins, so a nested route resolves to its section rather than
 * falling through to nothing.
 */

type TitleRule = {
  /** Matched as the whole path, or as a prefix followed by "/". */
  path: string;
  title: string;
};

const rules: TitleRule[] = [
  // Community.
  { path: socialRoutes.feed, title: "Home" },
  { path: socialRoutes.explore, title: "Explore" },
  { path: socialRoutes.search, title: "Search" },
  { path: socialRoutes.notifications, title: "Activity" },
  { path: ownerRoutes.socialProfileEdit, title: "Edit profile" },
  { path: ownerRoutes.socialProfile, title: "My profile" },

  // My Pets.
  { path: ownerRoutes.dashboard, title: "Home" },
  { path: ownerRoutes.petNew, title: "Add pet" },
  { path: ownerRoutes.pets, title: "Pets" },
  { path: ownerRoutes.records, title: "Care records" },
  { path: ownerRoutes.moments, title: "Moments" },
  { path: ownerRoutes.tags, title: "Smart Tags" },
  { path: ownerRoutes.orders, title: "Orders" },
  { path: ownerRoutes.settings, title: "Settings" },
];

/** Sections inside a single pet, which all live under /pets/{id}/…. */
const petSectionTitles: Record<string, string> = {
  edit: "Edit pet",
  records: "Care records",
  moments: "Moments",
  timeline: "Timeline",
  qr: "Safety Profile",
  tags: "Smart Tags",
};

function normalise(pathname: string) {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return withoutQuery.length > 1
    ? withoutQuery.replace(/\/+$/, "")
    : withoutQuery;
}

export function getMobilePageTitle(pathname: string): string {
  const path = normalise(pathname);

  const communityProfile = /^\/u\/[^/]+(?:\/(followers|following))?$/.exec(
    path
  );

  if (communityProfile) {
    if (communityProfile[1] === "followers") return "Followers";
    if (communityProfile[1] === "following") return "Following";
    return "Community profile";
  }

  // A pet's own pages name their section; the pet's name belongs to the page,
  // which has room for it, not to a bar four words wide.
  const petSection = /^\/pets\/[^/]+(?:\/([^/]+))?/.exec(path);

  if (petSection && path !== ownerRoutes.pets && path !== ownerRoutes.petNew) {
    const section = petSection[1];
    return (section && petSectionTitles[section]) || "Pet";
  }

  const match = rules
    .filter((rule) => path === rule.path || path.startsWith(`${rule.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];

  return match?.title ?? "MyPetLink";
}

/**
 * Pages that bring their own header and should not also get the shared one.
 *
 * A Moment's own page is a single piece of media with a Back control at the top
 * of its own content; a sticky bar repeating the app's chrome over it is noise
 * on a page whose whole job is to get out of the way. Everything else — every
 * list, every form, every settings screen — keeps the shared header, because on
 * those the thing people lose while scrolling is exactly what it restores.
 */
export function isFocusedDetailRoute(pathname: string): boolean {
  return normalise(pathname).startsWith("/moments/");
}
