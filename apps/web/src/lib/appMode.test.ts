import { describe, expect, it } from "vitest";
import {
  appModeHome,
  appModeLabels,
  getAppMode,
  getModeSwitchHref,
  getModeSwitchLabel,
  getOtherMode,
  isCommunityPath,
} from "@/lib/appMode";
import { getActiveOwnerNavItemId } from "@/lib/ownerNavigation";
import { getActiveSocialNavItemId } from "@/lib/socialNavigation";
import { ownerRoutes, socialRoutes } from "@/lib/routes";

/**
 * Which half of the product a route belongs to.
 *
 * This exists because the two halves used to answer that question separately
 * and could both say yes. One file decides, every surface asks it.
 */
describe("app mode", () => {
  it.each([
    socialRoutes.feed,
    socialRoutes.explore,
    socialRoutes.search,
    socialRoutes.notifications,
    ownerRoutes.socialProfileEdit,
    "/u/tanfamily",
  ])("puts %s in Community", (path) => {
    expect(getAppMode(path)).toBe("community");
  });

  it.each([
    ownerRoutes.dashboard,
    ownerRoutes.pets,
    ownerRoutes.records,
    ownerRoutes.moments,
    ownerRoutes.tags,
    ownerRoutes.orders,
    ownerRoutes.settings,
  ])("puts %s in My Pets", (path) => {
    expect(getAppMode(path)).toBe("pets");
  });

  it("keeps nested Community routes in Community", () => {
    // Tapping through to a follower list must not switch the sidebar out from
    // under you.
    expect(isCommunityPath("/u/tanfamily/followers")).toBe(true);
    expect(isCommunityPath("/u/tanfamily/following")).toBe(true);
    expect(isCommunityPath(`${ownerRoutes.socialProfileEdit}/anything`)).toBe(true);
  });

  it("ignores a trailing slash and a query string", () => {
    expect(getAppMode("/feed/")).toBe("community");
    expect(getAppMode("/search?q=mochi")).toBe("community");
    expect(getAppMode("/dashboard/")).toBe("pets");
  });

  it("does not mistake a pet route for a Community one", () => {
    // /pets and /u/ are different halves; a prefix check that was too loose
    // would put pet management in Community.
    expect(getAppMode("/pets/abc/moments")).toBe("pets");
    expect(getAppMode("/moments")).toBe("pets");
  });

  it("sends each mode to a fixed home", () => {
    expect(appModeHome.community).toBe(socialRoutes.feed);
    expect(appModeHome.pets).toBe(ownerRoutes.dashboard);

    expect(getModeSwitchHref("community")).toBe(ownerRoutes.dashboard);
    expect(getModeSwitchHref("pets")).toBe(socialRoutes.feed);
  });

  it("names the switch after where it goes", () => {
    expect(getModeSwitchLabel("community")).toBe("Switch to My Pets");
    expect(getModeSwitchLabel("pets")).toBe("Switch to Community");

    // Product vocabulary, not internal wording.
    expect(appModeLabels.community).toBe("Community");
    expect(appModeLabels.pets).toBe("My Pets");
    expect(Object.values(appModeLabels).join(" ")).not.toMatch(
      /owner portal|social mode|management mode/i
    );
  });

  it("flips between exactly two modes", () => {
    expect(getOtherMode("community")).toBe("pets");
    expect(getOtherMode("pets")).toBe("community");
  });
});

describe("only one navigation item is ever active", () => {
  const communityRoutes = [
    socialRoutes.feed,
    socialRoutes.explore,
    socialRoutes.search,
    socialRoutes.notifications,
  ];

  it.each(communityRoutes)(
    "leaves every management item unselected on %s",
    (path) => {
      // The bug this replaces: the resolver fell through to "dashboard" for
      // anything it did not recognise, so a Community route lit Dashboard up
      // while Community Home was also lit.
      expect(getActiveOwnerNavItemId(path)).toBeNull();
      expect(getActiveSocialNavItemId(path)).not.toBeNull();
    }
  );

  it.each(["/u/tanfamily", "/u/tanfamily/followers", "/p/mochi-pubmochi", "/moments/abc"])(
    "marks nothing at all on the public detail route %s",
    (path) => {
      // These are Community routes — the shell and the mode switch say so — but
      // none of them is a navigation destination. `/u/{handle}` is usually
      // somebody else's profile, so lighting "My profile" would be a claim about
      // whose page this is, and lighting Explore would be a guess about how the
      // reader got here.
      expect(getAppMode(path)).toBe("community");
      expect(getActiveSocialNavItemId(path)).toBeNull();
      expect(getActiveOwnerNavItemId(path)).toBeNull();
    }
  );

  it.each([
    ownerRoutes.dashboard,
    ownerRoutes.pets,
    ownerRoutes.records,
    ownerRoutes.settings,
  ])("leaves every Community item unselected on %s", (path) => {
    expect(getActiveSocialNavItemId(path)).toBeNull();
    expect(getActiveOwnerNavItemId(path)).not.toBeNull();
  });

  it("still selects Dashboard on the dashboard itself", () => {
    expect(getActiveOwnerNavItemId(ownerRoutes.dashboard)).toBe("dashboard");
  });

  it("selects nothing in either half on a route belonging to neither", () => {
    // A public marketing page is not a mode. Nothing should look selected.
    expect(getActiveOwnerNavItemId("/pricing")).toBeNull();
    expect(getActiveSocialNavItemId("/pricing")).toBeNull();
  });
});
