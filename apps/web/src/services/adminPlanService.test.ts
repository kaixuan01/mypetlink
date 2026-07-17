// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { freePlanLimits } from "@/lib/planLimits";
import {
  countAdminOwnerPlans,
  deriveUsageState,
  getAdminOwnerPlanExportFormats,
  listAdminOwnerPlans,
  listAdminPlanDefinitions,
  usageStateLabels,
} from "@/services/adminPlanService";

// Local-data behaviour: the same filters, sorting, and usage derivation the
// server applies, over the stored demo collections.

beforeEach(() => {
  window.localStorage.clear();
});

describe("deriveUsageState", () => {
  it("matches the service's usage bands", () => {
    expect(deriveUsageState(1, 3)).toBe("Within");
    expect(deriveUsageState(8, 10)).toBe("Near");
    expect(deriveUsageState(3, 3)).toBe("At");
    expect(deriveUsageState(4, 3)).toBe("Over");
  });

  it("falls back safely when a limit is missing", () => {
    expect(deriveUsageState(5, 0)).toBe("Within");
  });

  it("has a text label for every state", () => {
    expect(usageStateLabels.Within).toBe("Within limit");
    expect(usageStateLabels.Near).toBe("Near limit");
    expect(usageStateLabels.At).toBe("At limit");
    expect(usageStateLabels.Over).toBe("Over limit");
  });
});

describe("plan definitions (local data)", () => {
  it("mirrors the enforced Free limits and keeps Premium honest", async () => {
    const definitions = await listAdminPlanDefinitions();
    const free = definitions.find((plan) => plan.code === "Free");
    const premium = definitions.find((plan) => plan.code === "Premium");

    expect(free?.maxPets).toBe(freePlanLimits.maxPets);
    expect(free?.maxMemoriesPerPet).toBe(freePlanLimits.maxMemoriesPerPet);
    expect(free?.status).toBe("Available");
    expect(premium?.status).toBe("ComingSoon");
    expect(premium?.ownerCount).toBe(0);
  });
});

describe("owner plans (local data)", () => {
  const baseParams = { page: 1, pageSize: 100 };

  it("assigns every demo owner to the Free plan with derived usage states", async () => {
    const { items, total } = await listAdminOwnerPlans(baseParams);

    expect(total).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.planCode).toBe("Free");
      expect(item.maxPets).toBe(freePlanLimits.maxPets);
      expect(item.petUsageState).toBe(
        deriveUsageState(item.activePetCount, item.maxPets)
      );
      expect(item.memoryUsageState).toBe(
        deriveUsageState(item.highestMemoriesOnPet, item.maxMemoriesPerPet)
      );
    }
  });

  it("searches by owner and plan and filters by usage state", async () => {
    const all = await listAdminOwnerPlans(baseParams);
    const byPlanSearch = await listAdminOwnerPlans({ ...baseParams, search: "free" });
    expect(byPlanSearch.total).toBe(all.total);

    const first = all.items[0];
    const byName = await listAdminOwnerPlans({
      ...baseParams,
      search: first.displayName.toLowerCase(),
    });
    expect(byName.items.some((item) => item.ownerUserId === first.ownerUserId)).toBe(true);

    const withinOnly = await listAdminOwnerPlans({ ...baseParams, petUsage: "within" });
    expect(withinOnly.items.every((item) => item.petUsageState === "Within")).toBe(true);
  });

  it("summarizes counts consistently with the filtered rows", async () => {
    const counts = await countAdminOwnerPlans(baseParams);
    const { items } = await listAdminOwnerPlans(baseParams);

    expect(counts.all).toBe(items.length);
    expect(counts.atPetLimit).toBe(
      items.filter((item) => item.petUsageState === "At").length
    );
    expect(counts.withOverride).toBe(0);
  });

  it("sorts deterministically by owner name", async () => {
    const { items } = await listAdminOwnerPlans({
      ...baseParams,
      sortBy: "owner",
      sortDir: "asc",
    });
    const names = items.map((item) => item.displayName);

    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it("offers CSV only on local data (Excel needs the connected service)", () => {
    expect(getAdminOwnerPlanExportFormats()).toEqual(["csv"]);
  });
});
