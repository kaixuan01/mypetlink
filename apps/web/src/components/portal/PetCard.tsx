"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getQrStatusBadge,
  getSmartTagStatusBadge,
} from "@/components/portal/ProfileAccessStatus";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { isActivePet, isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import {
  getFriendlyApiErrorMessage,
  restorePetProfile,
  updatePetLifecycle,
} from "@/services/petService";
import type { Pet, PetLifecycleStatus, PetTag, TagOrder } from "@/types";

type PetCardProps = {
  pet: Pet;
  orders?: TagOrder[];
  tags?: PetTag[];
  onPetUpdated?: (pet: Pet) => void;
};

const moreLinks = (pet: Pet) => {
  const links = [
    { label: "Edit profile", href: ownerRoutes.petEdit(pet.id) },
    { label: "QR safety page", href: ownerRoutes.petQr(pet.id) },
    { label: "Care records", href: ownerRoutes.petRecords(pet.id) },
    { label: "Moments", href: ownerRoutes.petMoments(pet.id) },
    { label: "Smart tags", href: ownerRoutes.petTags(pet.id) },
  ];

  if (isActivePet(pet)) {
    links.push({ label: "Order tag", href: ownerRoutes.petTagOrder(pet.id) });
  }

  return links;
};

export function PetCard({
  pet,
  orders = [],
  tags = [],
  onPetUpdated,
}: PetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    "active" | "memorial" | "archive" | "restore" | null
  >(null);
  const qrBadge = getQrStatusBadge(pet.qrStatus, pet.qrSafetyPath, pet);
  const tagBadge = getSmartTagStatusBadge(tags, orders, pet);
  const isMemorial = isMemorialPet(pet);
  const isArchived = isArchivedPet(pet);
  const confirmCopy = getConfirmCopy(confirmAction, pet);

  async function handleLifecycleUpdate(status: PetLifecycleStatus) {
    try {
      const response = await updatePetLifecycle(pet.id, status);

      if (response.data) {
        onPetUpdated?.(response.data);
        setStatusMessage(
          status === "Memorial"
            ? `${pet.name} is now in Memorial Mode.`
            : status === "Active"
              ? `${pet.name} is back in your active pet list.`
              : `${pet.name} has been archived.`
        );
      } else {
        setStatusMessage(
          "We could not find this pet profile. Please refresh and try again."
        );
      }
    } catch (caught) {
      setStatusMessage(getFriendlyApiErrorMessage(caught));
    } finally {
      setConfirmAction(null);
      setMenuOpen(false);
    }
  }

  async function handleRestore() {
    try {
      const response = await restorePetProfile(pet.id);

      if (response.data.pet) {
        onPetUpdated?.(response.data.pet);
        setStatusMessage(`${pet.name} is back in your main list.`);
      } else {
        setStatusMessage(
          response.data.blockedReason ??
            "You've reached the Free profile limit. Archive another pet first, or wait for Premium plans for more profiles."
        );
      }
    } catch (caught) {
      setStatusMessage(getFriendlyApiErrorMessage(caught));
    } finally {
      setConfirmAction(null);
      setMenuOpen(false);
    }
  }

  return (
    <article className="brand-card flex flex-col rounded-[1.75rem] p-5">
      <div className="flex items-start gap-4">
        <PetAvatar pet={pet} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-pet-ink">{pet.name}</h3>
            {isMemorial ? <Badge tone="soft">Memorial</Badge> : null}
            {isArchived ? <Badge tone="soft">Archived</Badge> : null}
            <Badge tone={qrBadge.tone}>{qrBadge.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-pet-muted">
            {getPetSummaryLabel(pet)}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pet-cream px-3 py-1 text-xs font-bold text-pet-muted">
            <Icon name="tag" className="h-3.5 w-3.5 text-pet-teal" />
            {tagBadge.label}
          </div>
          {isMemorial || isArchived || pet.emergencyNote ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-pet-muted">
              {isMemorial
                ? pet.memorial.memorialMessage ||
                  "Memories, records, and timeline stay saved here."
                : isArchived
                  ? "This profile is archived. Memories and records stay saved."
                  : pet.emergencyNote}
            </p>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          {statusMessage}
        </p>
      ) : null}

      <div className="relative mt-auto flex items-center gap-3 pt-5">
        <CTAButton href={ownerRoutes.petProfile(pet.id)} fullWidth>
          {isArchived ? "View Profile" : "Manage"}
        </CTAButton>
        <CTAButton
          href={pet.publicProfilePath}
          variant="secondary"
          target="_blank"
          rel="noopener noreferrer"
          fullWidth
        >
          {isMemorial ? "Memorial Profile" : "Public Profile"}
        </CTAButton>
        <button
          aria-expanded={menuOpen}
          aria-label="More actions"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-pet-border bg-white text-pet-muted transition hover:bg-pet-cream"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <Icon name="settings" className="h-5 w-5" />
        </button>

        {menuOpen ? (
          <>
            <button
              aria-hidden="true"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setMenuOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <div className="absolute bottom-14 right-0 z-30 w-52 overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-1 shadow-xl shadow-[#0d1b3d]/10">
              {moreLinks(pet).map((link) => (
                <Link
                  className="block rounded-[0.9rem] px-4 py-2.5 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                  href={link.href}
                  key={link.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 border-t border-pet-border" />
              {isArchived ? (
                <button
                  className="block w-full rounded-[0.9rem] px-4 py-2.5 text-left text-sm font-bold text-pet-teal transition hover:bg-pet-cream"
                  onClick={() => setConfirmAction("restore")}
                  type="button"
                >
                  Restore to List
                </button>
              ) : (
                <>
                  {isMemorial ? (
                    <button
                      className="block w-full rounded-[0.9rem] px-4 py-2.5 text-left text-sm font-bold text-pet-teal transition hover:bg-pet-cream"
                      onClick={() => setConfirmAction("active")}
                      type="button"
                    >
                      Restore to Active
                    </button>
                  ) : (
                    <button
                      className="block w-full rounded-[0.9rem] px-4 py-2.5 text-left text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                      onClick={() => setConfirmAction("memorial")}
                      type="button"
                    >
                      Move to Memorial
                    </button>
                  )}
                  <button
                    className="block w-full rounded-[0.9rem] px-4 py-2.5 text-left text-sm font-bold text-pet-muted transition hover:bg-pet-cream"
                    onClick={() => setConfirmAction("archive")}
                    type="button"
                  >
                    Archive Pet
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      {confirmCopy ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmAction === "archive"}
          message={confirmCopy.message}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction === "restore") {
              void handleRestore();
              return;
            }

            void handleLifecycleUpdate(
              confirmAction === "memorial"
                ? "Memorial"
                : confirmAction === "active"
                  ? "Active"
                  : "Archived"
            );
          }}
          open={Boolean(confirmAction)}
          title={confirmCopy.title}
        />
      ) : null}
    </article>
  );
}

function getConfirmCopy(
  action: "active" | "memorial" | "archive" | "restore" | null,
  pet: Pet
) {
  if (action === "active") {
    return {
      title: "Restore to Active?",
      message: `This will show ${pet.name} in active pet pages again and use the pet's QR Safety settings for finder contact actions.`,
      confirmLabel: "Restore to Active",
    };
  }

  if (action === "memorial") {
    return {
      title: "Move to Memorial?",
      message: `This keeps ${pet.name}'s profile, memories, and timeline, but the QR Safety Page will no longer show emergency finder contact actions.`,
      confirmLabel: "Move to Memorial",
    };
  }

  if (action === "archive") {
    return {
      title: "Archive this pet?",
      message: `This hides ${pet.name} from your main pet list. Memories, records, tags, and order history stay saved.`,
      confirmLabel: "Archive Pet",
    };
  }

  if (action === "restore") {
    return {
      title: "Restore this pet?",
      message: `This will show ${pet.name} in your main pet list again and count toward your Free profile limit.`,
      confirmLabel: "Restore to List",
    };
  }

  return null;
}
