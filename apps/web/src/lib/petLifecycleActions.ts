import {
  isArchivedPet,
  isMemorialPet,
  type PetLifecycleLike,
} from "@/lib/petLifecycle";
import type { PetLifecycleStatus } from "@/types";

export type PetLifecycleAction =
  | "active"
  | "memorial"
  | "archive"
  | "restore";

export type PetLifecycleActionItem = {
  action: PetLifecycleAction;
  label: string;
};

export type PetLifecycleActionExecution =
  | { kind: "update"; status: PetLifecycleStatus }
  | { kind: "restore" };

export function getPetLifecycleActions(
  pet: PetLifecycleLike
): PetLifecycleActionItem[] {
  if (isArchivedPet(pet)) {
    return [{ action: "restore", label: "Restore to List" }];
  }

  return [
    isMemorialPet(pet)
      ? { action: "active", label: "Restore to Active" }
      : { action: "memorial", label: "Move to Memorial" },
    { action: "archive", label: "Archive Pet" },
  ];
}

export function getPetLifecycleActionExecution(
  action: PetLifecycleAction
): PetLifecycleActionExecution {
  if (action === "restore") {
    return { kind: "restore" };
  }

  return {
    kind: "update",
    status:
      action === "memorial"
        ? "Memorial"
        : action === "archive"
          ? "Archived"
          : "Active",
  };
}

export function getPetLifecycleConfirmation(
  action: PetLifecycleAction,
  petName: string
) {
  if (action === "active") {
    return {
      title: "Restore to Active?",
      message: `This will show ${petName} in active pet pages again and use the pet's Safety Profile settings for finder contact actions.`,
      confirmLabel: "Restore to Active",
      cancelLabel: "Cancel",
    };
  }

  if (action === "memorial") {
    return {
      title: "Move to Memorial?",
      message: `This keeps ${petName}'s profile, memories, and timeline, but the Safety Profile will no longer show emergency finder contact actions.`,
      confirmLabel: "Move to Memorial",
      cancelLabel: "Cancel",
    };
  }

  if (action === "archive") {
    return {
      title: "Archive this pet?",
      message: `This hides ${petName} from your main pet list. Memories, records, tags, and order history stay saved.`,
      confirmLabel: "Archive Pet",
      cancelLabel: "Cancel",
    };
  }

  return {
    title: "Restore this pet?",
    message: `This will show ${petName} in your main pet list again and count toward your Free profile limit.`,
    confirmLabel: "Restore to List",
    cancelLabel: "Cancel",
  };
}
