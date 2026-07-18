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
    expect(resolve()).toMatchObject({
      type: "home-menu",
      label: "Add",
      compactTitle: "Home",
    });
    expect(resolve({ currentPets: [] })).toBeNull();
    expect(resolve({ petsStatus: "loading" })).toBeNull();
  });

  it("shows Add Pet on the populated Pets list and hides it for zero pets", () => {
    expect(resolve({ pathname: "/pets" })).toMatchObject({
      type: "add-pet",
      label: "Add Pet",
      limitReached: false,
      compactTitle: "My pets",
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
      compactTitle: "Pet 1's memories",
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

  it("hides a Moments action while loading, unavailable, or missing pet context", () => {
    for (const context of [
      pageContext({ status: "loading" }),
      pageContext({ status: "error" }),
      pageContext({ canCreate: false }),
      pageContext({ canCreate: undefined }),
      pageContext({ petId: "stale_pet" }),
    ]) {
      expect(
        resolve({ pathname: "/moments", currentPageContext: context })
      ).toBeNull();
    }
  });

  it("shows the section action again once a loading or failed load becomes ready", () => {
    // The same registered context transitions loading -> error -> ready; only
    // the final ready state may decide visibility, so a retry that succeeds
    // always restores the action.
    expect(
      resolve({
        pathname: "/moments",
        currentPageContext: pageContext({ status: "loading" }),
      })
    ).toBeNull();
    expect(
      resolve({
        pathname: "/moments",
        currentPageContext: pageContext({ status: "error" }),
      })
    ).toBeNull();
    expect(
      resolve({
        pathname: "/moments",
        currentPageContext: pageContext({ status: "ready" }),
      })
    ).toMatchObject({ type: "link", label: "Add Moment" });
  });

  it("switching between pets keeps the action pointed at the current pet", () => {
    const twoPets = pets(2);

    const first = resolve({
      pathname: "/pets/pet_0/moments",
      currentPets: twoPets,
      currentPageContext: pageContext({ pathname: "/pets/pet_0/moments" }),
    });
    expect(first).toMatchObject({
      type: "link",
      href: "/pets/pet_0/moments/new",
      compactTitle: "Pet 1's memories",
    });

    const second = resolve({
      pathname: "/pets/pet_1/moments",
      currentPets: twoPets,
      currentPageContext: pageContext({
        pathname: "/pets/pet_1/moments",
        petId: "pet_1",
      }),
    });
    expect(second).toMatchObject({
      type: "link",
      href: "/pets/pet_1/moments/new",
      compactTitle: "Pet 2's memories",
    });

    const backToFirst = resolve({
      pathname: "/pets/pet_0/moments",
      currentPets: twoPets,
      currentPageContext: pageContext({ pathname: "/pets/pet_0/moments" }),
    });
    expect(backToFirst).toMatchObject({
      type: "link",
      href: "/pets/pet_0/moments/new",
      compactTitle: "Pet 1's memories",
    });
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

    expect(action).toMatchObject({
      type: "button",
      label: "Add Record",
      compactTitle: "Care records",
    });
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
