"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getSafetyProfileBadge,
  getSmartTagStatusBadge,
} from "@/components/portal/ProfileAccessStatus";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { isActivePet, isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import {
  getPetLifecycleActionExecution,
  getPetLifecycleActions,
  getPetLifecycleConfirmation,
  type PetLifecycleAction,
} from "@/lib/petLifecycleActions";
import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
  smartTagOrderingEnabled,
  smartTagsEnabled,
  tagOrdersEnabled,
} from "@/lib/features";
import { ownerRoutes } from "@/lib/routes";
import {
  getFriendlyApiErrorMessage,
  restorePetProfile,
  updatePetLifecycle,
} from "@/services/petService";
import type {
  Pet,
  PetLifecycleStatus,
  PetListItem,
  PetTag,
  TagOrder,
} from "@/types";

type PetCardProps = {
  pet: Pet | PetListItem;
  orders?: TagOrder[];
  tags?: PetTag[];
  onPetUpdated?: (pet: Pet) => void;
};

type PetMenuLink = {
  label: string;
  href: string;
  external?: boolean;
};

const moreLinks = (pet: Pet | PetListItem) => {
  const links: PetMenuLink[] = [
    { label: "Edit profile", href: ownerRoutes.petEdit(pet.id) },
    { label: "Care records", href: ownerRoutes.petRecords(pet.id) },
    { label: "Moments", href: ownerRoutes.petMoments(pet.id) },
  ];

  if (smartTagsEnabled) {
    links.push({ label: "Smart tags", href: ownerRoutes.petTags(pet.id) });

    if (isActivePet(pet) && tagOrdersEnabled && smartTagOrderingEnabled) {
      links.push({ label: "Order tag", href: ownerRoutes.petTagOrder(pet.id) });
    }
  }

  if (safetyProfilesOwnerUiEnabled) {
    links.push({
      label: "View Safety Profile",
      href: pet.qrSafetyPath,
      external: true,
    });
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
  const [confirmAction, setConfirmAction] =
    useState<PetLifecycleAction | null>(null);
  const isMemorial = isMemorialPet(pet);
  const isArchived = isArchivedPet(pet);
  const safetyBadge = safetyProfilesOwnerUiEnabled && !isArchived
    ? getSafetyProfileBadge(pet)
    : null;
  const tagBadge = smartTagsEnabled
    ? getSmartTagStatusBadge(tags, orders, pet)
    : null;
  const memorial = "memorial" in pet ? pet.memorial : undefined;
  const description = isMemorial
    ? memorial?.memorialMessage ||
      "Memories, records, and timeline stay saved here."
    : isArchived
      ? "Memories and records stay saved."
      : pet.bio.trim() ||
        (pet.personalityTags.length
          ? pet.personalityTags.slice(0, 3).join(" · ")
          : "");
  const publicProfileAccessible =
    publicProfilesEnabled &&
    pet.publicProfileEnabled &&
    !isArchived &&
    (!isMemorial || memorial?.showMemorialOnPublicProfile !== false);
  const showPrivateBadge =
    publicProfilesEnabled && !publicProfileAccessible && !isArchived;
  const lifecycleActions = getPetLifecycleActions(pet);
  const confirmCopy = confirmAction
    ? getPetLifecycleConfirmation(confirmAction, pet.name)
    : null;

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

  function executeLifecycleAction() {
    if (!confirmAction) return;

    const execution = getPetLifecycleActionExecution(confirmAction);
    if (execution.kind === "restore") {
      void handleRestore();
      return;
    }

    void handleLifecycleUpdate(execution.status);
  }

  return (
    <article className="brand-card flex min-w-0 flex-col rounded-[1.75rem] p-5">
      <div className="flex items-start gap-4">
        <PetAvatar pet={pet} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-pet-ink">{pet.name}</h3>
            {isMemorial ? <Badge tone="soft">Memorial</Badge> : null}
            {isArchived ? <Badge tone="soft">Archived</Badge> : null}
            {safetyBadge ? (
              <Badge tone={safetyBadge.tone}>{safetyBadge.label}</Badge>
            ) : null}
            {showPrivateBadge ? <Badge tone="soft">Private</Badge> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-pet-muted">
            {getPetSummaryLabel(pet)}
          </p>
          {tagBadge ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pet-cream px-3 py-1 text-xs font-bold text-pet-muted">
              <Icon name="tag" className="h-3.5 w-3.5 text-pet-teal" />
              {tagBadge.label}
            </div>
          ) : null}
          {description ? (
            <p
              className={`mt-3 text-sm leading-6 text-pet-muted ${
                isArchived ? "" : "line-clamp-2"
              }`}
            >
              {description}
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
        {publicProfilesEnabled ? (
          publicProfileAccessible ? (
            <CTAButton
              href={pet.publicProfilePath}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
              fullWidth
            >
              {isMemorial ? "Memorial Profile" : "Public Profile"}
            </CTAButton>
          ) : (
            <CTAButton
              href={ownerRoutes.petEdit(pet.id, { tab: "public" })}
              variant="secondary"
              fullWidth
            >
              {isMemorial ? "Manage Public Profile" : "Enable Profile"}
            </CTAButton>
          )
        ) : null}
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
                  rel={link.external ? "noopener noreferrer" : undefined}
                  target={link.external ? "_blank" : undefined}
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 border-t border-pet-border" />
              {lifecycleActions.map((item) => (
                <button
                  className={`block w-full rounded-[0.9rem] px-4 py-2.5 text-left text-sm font-bold transition hover:bg-pet-cream ${
                    item.action === "active" || item.action === "restore"
                      ? "text-pet-teal"
                      : item.action === "archive"
                        ? "text-pet-muted"
                        : "text-pet-ink"
                  }`}
                  key={item.action}
                  onClick={() => setConfirmAction(item.action)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {confirmCopy ? (
        <ConfirmDialog
          cancelLabel={confirmCopy.cancelLabel}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmAction === "archive"}
          message={confirmCopy.message}
          onCancel={() => setConfirmAction(null)}
          onConfirm={executeLifecycleAction}
          open={Boolean(confirmAction)}
          title={confirmCopy.title}
        />
      ) : null}
    </article>
  );
}
