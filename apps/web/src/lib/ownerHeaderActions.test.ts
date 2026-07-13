import { describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import {
  getOwnerHeaderAction,
  type OwnerHeaderPageContext,
} from "@/lib/ownerHeaderActions";
import type { Pet } from "@/types";

function pets(count = 1): Pet[] {
  return Array.from({ length: count }, (_, index) => ({
    ...mockPets[0],
    id: `pet_${index}`,
    name: `Pet ${index + 1}`,
    lifecycleStatus: "Active",
  }));
}

function pageContext(
  overrides: Partial<OwnerHeaderPageContext> = {}
): OwnerHeaderPageContext {
  return {
    section: "moments",
    pathname: "/moments",
    petId: "pet_0",
    status: "ready",
    itemCount: 1,
    canCreate: true,
    ...overrides,
  };
}

function resolve({
  pathname = "/dashboard",
  currentPets = pets(),
  petsStatus = "ready",
  currentPageContext = null,
}: {
  pathname?: string;
  currentPets?: Pet[];
  petsStatus?: "loading" | "ready" | "error";
  currentPageContext?: OwnerHeaderPageContext | null;
} = {}) {
  return getOwnerHeaderAction({
    pathname,
    pets: currentPets,
    petsStatus,
    pageContext: currentPageContext,
  });
}

describe("getOwnerHeaderAction", () => {
  it("shows the generic menu only on a populated Home dashboard", () => {
    expect(resolve()).toMatchObject({ type: "home-menu", label: "Add" });
    expect(resolve({ currentPets: [] })).toBeNull();
    expect(resolve({ petsStatus: "loading" })).toBeNull();
  });

  it("shows Add Pet on the populated Pets list and hides it for zero pets", () => {
    expect(resolve({ pathname: "/pets" })).toMatchObject({
      type: "add-pet",
      label: "Add Pet",
      limitReached: false,
    });
    expect(resolve({ pathname: "/pets", currentPets: [] })).toBeNull();
    expect(
      resolve({ pathname: "/pets", currentPets: pets(3) })
    ).toMatchObject({ type: "add-pet", limitReached: true });
  });

  it("uses the current pet for a populated Moments section", () => {
    expect(
      resolve({
        pathname: "/moments",
        currentPageContext: pageContext(),
      })
    ).toMatchObject({
      type: "link",
      label: "Add Moment",
      href: "/pets/pet_0/moments/new",
    });
  });

  it("supports the Moments tab in the pet hub without leaking to other routes", () => {
    expect(
      resolve({
        pathname: "/pets/pet_0",
        currentPageContext: pageContext({ pathname: "/pets/pet_0" }),
      })
    ).toMatchObject({ type: "link", label: "Add Moment" });
    expect(
      resolve({
        pathname: "/settings",
        currentPageContext: pageContext({ pathname: "/settings" }),
      })
    ).toBeNull();
  });

  it("hides a Moments action while loading, empty, unavailable, or missing pet context", () => {
    for (const context of [
      pageContext({ status: "loading" }),
      pageContext({ status: "error" }),
      pageContext({ itemCount: 0 }),
      pageContext({ canCreate: false }),
      pageContext({ petId: "stale_pet" }),
    ]) {
      expect(
        resolve({ pathname: "/moments", currentPageContext: context })
      ).toBeNull();
    }
  });

  it("exposes the registered Add Record callback for populated care records", () => {
    const onCreate = vi.fn();
    const action = resolve({
      pathname: "/pets/pet_0/records",
      currentPageContext: pageContext({
        section: "records",
        pathname: "/pets/pet_0/records",
        onCreate,
      }),
    });

    expect(action).toMatchObject({ type: "button", label: "Add Record" });
    if (action?.type === "button") {
      action.onClick();
    }
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("hides stale page context after route navigation", () => {
    expect(
      resolve({
        pathname: "/pets/pet_0/records",
        currentPageContext: pageContext({
          section: "records",
          pathname: "/records",
          onCreate: vi.fn(),
        }),
      })
    ).toBeNull();
  });

  it.each([
    "/tags",
    "/orders",
    "/orders/view",
    "/settings",
    "/pets/new",
    "/pets/pet_0/edit",
    "/pets/pet_0/tags",
    "/pets/pet_0/tags/order",
    "/pets/pet_0/moments/new",
    "/pets/pet_0/timeline",
  ])("shows no generic Add Pet action on %s", (pathname) => {
    expect(resolve({ pathname })).toBeNull();
  });
});
