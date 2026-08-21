"use client";

import { useSyncExternalStore } from "react";
import { TagOrderFlow } from "@/components/portal/TagOrderFlow";
import { getPreferredSmartTagOrderPetId } from "@/lib/smartTagOrder";
import type { PetListItem } from "@/types";

const noInitialPets: PetListItem[] = [];

export function SmartTagOrderEntry() {
  const preferredPetId = useSyncExternalStore(
    subscribeNoop,
    getBrowserPreferredPetId,
    getDefaultPreferredPetId
  );

  return (
    <TagOrderFlow
      initialTagType="MyPetLink QR Pet Tag"
      pets={noInitialPets}
      preselectedPetId={preferredPetId || undefined}
    />
  );
}

function subscribeNoop() {
  return () => {};
}

function getDefaultPreferredPetId() {
  return "";
}

function getBrowserPreferredPetId() {
  return getPreferredSmartTagOrderPetId(window.location.href);
}
