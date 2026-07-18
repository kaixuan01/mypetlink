"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import {
  getFriendlyApiErrorMessage,
  restorePetProfile,
  updatePetLifecycle,
} from "@/services/petService";
import type { Pet, PetLifecycleStatus } from "@/types";

type PetLifecycleActionsProps = {
  pet: Pet;
  compact?: boolean;
};

export function PetLifecycleActions({
  pet,
  compact = false,
}: PetLifecycleActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<
    "active" | "memorial" | "archive" | "restore" | null
  >(null);
  const [message, setMessage] = useState("");
  const copy = action ? getActionCopy(action, pet.name) : null;
  const isArchived = isArchivedPet(pet);
  const isMemorial = isMemorialPet(pet);

  async function updateLifecycle(status: PetLifecycleStatus) {
    try {
      const response = await updatePetLifecycle(pet.id, status);

      if (response.data) {
        setMessage(
          status === "Memorial"
            ? `${pet.name} is now in Memorial Mode.`
            : status === "Active"
              ? `${pet.name} is back in your active pet list.`
              : `${pet.name} has been archived.`
        );
        router.refresh();
      } else {
        setMessage(
          "We could not find this pet profile. Please refresh and try again."
        );
      }
    } catch (caught) {
      setMessage(getFriendlyApiErrorMessage(caught));
    } finally {
      setAction(null);
    }
  }

  async function restore() {
    try {
      const response = await restorePetProfile(pet.id);

      if (response.data.pet) {
        setMessage(`${response.data.pet.name} is back in your main list.`);
        router.refresh();
      } else {
        setMessage(
          response.data.blockedReason ??
            "You've reached the Free profile limit. Archive another pet first, or wait for Premium plans for more profiles."
        );
      }
    } catch (caught) {
      setMessage(getFriendlyApiErrorMessage(caught));
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className={`flex flex-col gap-3 ${compact ? "" : "sm:flex-row"}`}>
        {isArchived ? (
          <CTAButton
            icon="paw"
            onClick={() => setAction("restore")}
            variant="secondary"
            fullWidth={compact}
          >
            Restore to List
          </CTAButton>
        ) : (
          <>
            {isMemorial ? (
              <CTAButton
                icon="paw"
                onClick={() => setAction("active")}
                variant="secondary"
                fullWidth={compact}
              >
                Restore to Active
              </CTAButton>
            ) : (
              <CTAButton
                icon="heart"
                onClick={() => setAction("memorial")}
                variant="outline"
                fullWidth={compact}
              >
                Move to Memorial
              </CTAButton>
            )}
            <CTAButton
              icon="record"
              onClick={() => setAction("archive")}
              variant="outline"
              fullWidth={compact}
            >
              Archive Pet
            </CTAButton>
          </>
        )}
      </div>

      {message ? (
        <p className="rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          {message}
        </p>
      ) : null}

      {copy ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel={copy.confirmLabel}
          destructive={action === "archive"}
          message={copy.message}
          onCancel={() => setAction(null)}
          onConfirm={() => {
            if (action === "restore") {
              void restore();
              return;
            }

            void updateLifecycle(
              action === "memorial"
                ? "Memorial"
                : action === "active"
                  ? "Active"
                  : "Archived"
            );
          }}
          open={Boolean(action)}
          title={copy.title}
        />
      ) : null}
    </div>
  );
}

function getActionCopy(
  action: "active" | "memorial" | "archive" | "restore",
  petName: string
) {
  if (action === "active") {
    return {
      title: "Restore to Active?",
      message: `This will show ${petName} in active pet pages again and use the pet's Safety Profile settings for finder contact actions.`,
      confirmLabel: "Restore to Active",
    };
  }

  if (action === "memorial") {
    return {
      title: "Move to Memorial?",
      message: `This keeps ${petName}'s profile, memories, and timeline, but the Safety Profile will no longer show emergency finder contact actions.`,
      confirmLabel: "Move to Memorial",
    };
  }

  if (action === "archive") {
    return {
      title: "Archive this pet?",
      message: `This hides ${petName} from your main pet list. Memories, records, tags, and order history stay saved.`,
      confirmLabel: "Archive Pet",
    };
  }

  return {
    title: "Restore this pet?",
    message: `This will show ${petName} in your main pet list again and count toward your Free profile limit.`,
    confirmLabel: "Restore to List",
  };
}
