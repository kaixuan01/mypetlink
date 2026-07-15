import { getPetLimitStateFromPets } from "@/lib/planLimits";
import { ownerRoutes } from "@/lib/routes";
import type { Pet } from "@/types";

export type OwnerHeaderSection = "moments" | "records";

export type OwnerHeaderPageContext = {
  section: OwnerHeaderSection;
  pathname: string;
  petId: string;
  status: "loading" | "ready" | "error";
  itemCount: number;
  canCreate?: boolean;
  onCreate?: () => void;
};

export type OwnerHeaderAction =
  | {
      type: "home-menu";
      label: "Add";
      ariaLabel: string;
      compactTitle: "Home";
    }
  | {
      type: "add-pet";
      label: "Add Pet";
      ariaLabel: string;
      limitReached: boolean;
      compactTitle: "My pets";
    }
  | {
      type: "link";
      label: "Add Moment";
      ariaLabel: string;
      href: string;
      compactTitle: string;
    }
  | {
      type: "button";
      label: "Add Record";
      ariaLabel: string;
      onClick: () => void;
      compactTitle: "Care records";
    };

type OwnerHeaderActionContext = {
  pathname: string;
  pets: Pet[] | null;
  petsStatus: "loading" | "ready" | "error";
  pageContext: OwnerHeaderPageContext | null;
};

/**
 * The single route policy for Owner Portal header actions.
 *
 * Page components only publish live section state (current pet, loading state,
 * and item count). They never decide which header label or action belongs to a
 * route. This prevents stale pet ids and unrelated Add Pet actions from leaking
 * into detail, edit, settings, orders, and tag-management pages.
 */
export function getOwnerHeaderAction({
  pathname,
  pets,
  petsStatus,
  pageContext,
}: OwnerHeaderActionContext): OwnerHeaderAction | null {
  if (petsStatus !== "ready" || !pets) {
    return null;
  }

  // A true zero-pet state keeps its single, explanatory page-level onboarding
  // CTA. Once a profile exists, Home owns the only generic multi-create menu.
  if (pathname === ownerRoutes.dashboard) {
    return pets.length
      ? {
          type: "home-menu",
          label: "Add",
          ariaLabel: "Add a pet, care record, or moment",
          compactTitle: "Home",
        }
      : null;
  }

  if (pathname === ownerRoutes.pets) {
    if (!pets.length) {
      return null;
    }

    return {
      type: "add-pet",
      label: "Add Pet",
      ariaLabel: "Add Pet",
      limitReached: !getPetLimitStateFromPets(pets).canCreate,
      compactTitle: "My pets",
    };
  }

  if (!pageContext || pageContext.pathname !== pathname) {
    return null;
  }

  const petHubRoute = /^\/pets\/[^/]+$/.test(pathname);
  const sectionRoute =
    pageContext.section === "moments"
      ? pathname === ownerRoutes.moments ||
        /^\/pets\/[^/]+\/moments$/.test(pathname) ||
        petHubRoute
      : pathname === ownerRoutes.records ||
        /^\/pets\/[^/]+\/records$/.test(pathname) ||
        petHubRoute;

  if (
    !sectionRoute ||
    pageContext.status !== "ready" ||
    pageContext.itemCount === 0 ||
    !pets.some((pet) => pet.id === pageContext.petId)
  ) {
    return null;
  }

  if (pageContext.section === "moments") {
    if (!pageContext.canCreate) {
      return null;
    }

    const pet = pets.find((item) => item.id === pageContext.petId);

    if (!pet) {
      return null;
    }

    return {
      type: "link",
      label: "Add Moment",
      ariaLabel: "Add Moment for the current pet",
      href: ownerRoutes.petMomentNew(pageContext.petId),
      compactTitle: `${pet.name}'s memories`,
    };
  }

  if (pageContext.section === "records" && pageContext.onCreate) {
    return {
      type: "button",
      label: "Add Record",
      ariaLabel: "Add Care Record for the current pet",
      onClick: pageContext.onCreate,
      compactTitle: "Care records",
    };
  }

  return null;
}
