import { describe, expect, it } from "vitest";
import {
  getActiveOwnerNavItemId,
  getOwnerNavItems,
} from "./ownerNavigation";

const currentRelease = {
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: false,
  smartTagsEnabled: false,
  tagOrdersEnabled: false,
} as const;

describe("owner navigation availability", () => {
  it("uses only launched modules for the current release", () => {
    expect(getOwnerNavItems(currentRelease).map((item) => item.id)).toEqual([
      "dashboard",
      "pets",
      "records",
      "moments",
      "settings",
    ]);
  });

  it("restores Smart Tags and Orders from the same configuration", () => {
    expect(
      getOwnerNavItems({
        ...currentRelease,
        smartTagsEnabled: true,
        tagOrdersEnabled: true,
      }).map((item) => item.id)
    ).toEqual([
      "dashboard",
      "pets",
      "records",
      "moments",
      "tags",
      "orders",
      "settings",
    ]);
  });

  it("keeps active-route matching stable for direct compatibility routes", () => {
    expect(getActiveOwnerNavItemId("/pets/pet-1/moments/new")).toBe("moments");
    expect(getActiveOwnerNavItemId("/pets/pet-1/tags/order")).toBe("tags");
    expect(getActiveOwnerNavItemId("/orders/MPL-ORDER-1")).toBe("orders");
  });
});
