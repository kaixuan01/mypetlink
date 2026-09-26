import { momentPath, ownerRoutes, ownerSocialProfilePath, petPublicProfilePath, socialRoutes } from "@/lib/routes";
import type { PublicMomentListItem } from "@/services/publicSocialService";

type BackDestination = { href: string; label: string };

/** Only these browsing surfaces may be a Moment's return destination. */
export function sanitizeMomentReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || /[\\\s\u0000-\u001f\u007f]/.test(value.split("?")[0])) return null;
  const [path, query = ""] = value.split("?");
  const params = new URLSearchParams(query);
  if (path === socialRoutes.search) {
    return params.has("q") ? socialRoutes.searchFor(params.get("q")!.slice(0, 200)) : path;
  }
  if (path === socialRoutes.explore) {
    const species = params.get("species");
    return species && /^[a-zA-Z][a-zA-Z -]{0,49}$/.test(species)
      ? socialRoutes.exploreFor(species)
      : path;
  }
  if ([socialRoutes.feed, socialRoutes.notifications, ownerRoutes.socialProfile].includes(path)) return path;
  if (/^\/u\/[a-z][a-z0-9._]{1,28}[a-z0-9]$/.test(path)) return ownerSocialProfilePath(path.slice(3));
  if (/^\/p\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return petPublicProfilePath(path.slice(3));
  return null;
}

/** Internal links carry context; share links continue to use momentPath alone. */
export function momentNavigationPath(momentId: string, returnTo?: string | null) {
  const safe = sanitizeMomentReturnTo(returnTo);
  return `${momentPath(momentId)}${safe ? `?returnTo=${encodeURIComponent(safe)}` : ""}`;
}

export function momentBackDestination(
  returnTo: string | null,
  moment: PublicMomentListItem | null,
): BackDestination {
  const safe = sanitizeMomentReturnTo(returnTo);
  if (safe === socialRoutes.feed) return { href: safe, label: "Back to Home" };
  if (safe?.split("?")[0] === socialRoutes.explore) return { href: safe, label: "Back to Explore" };
  if (safe?.split("?")[0] === socialRoutes.search) return { href: safe, label: "Back to Search" };
  if (safe === socialRoutes.notifications) return { href: safe, label: "Back to Activity" };
  if (safe === ownerRoutes.socialProfile) return { href: safe, label: "Back to My profile" };
  if (safe?.startsWith("/p/")) return { href: safe, label: "Back to Share Profile" };

  // Names come only from the visible Moment's social identities, never the URL.
  const identities = [moment?.author, ...(moment?.collaborations ?? []).map((item) => item.household)];
  const sourceHousehold = safe?.startsWith("/u/")
    ? identities.find((identity) => identity && ownerSocialProfilePath(identity.handle) === safe)
    : null;
  if (sourceHousehold) return { href: safe!, label: `Back to ${sourceHousehold.displayName}` };
  // A known profile origin without a currently visible identity must not name it.
  if (!safe?.startsWith("/u/") && moment?.author) {
    const profile = sanitizeMomentReturnTo(ownerSocialProfilePath(moment.author.handle));
    if (profile) return { href: profile, label: `Back to ${moment.author.displayName}` };
  }
  return { href: socialRoutes.explore, label: "Explore MyPetLink" };
}
