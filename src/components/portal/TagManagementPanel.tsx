"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { activatePath, ownerRoutes, tagPath } from "@/lib/routes";
import {
  archiveTag,
  disableTag,
  getAllTags,
  getPetTags,
  reportTagLost,
  restoreTag,
} from "@/services/tagService";
import type { Pet, PetTag, TagStatus } from "@/types";

type TagManagementPanelProps = {
  pets: Pet[];
  initialTags: PetTag[];
  petId?: string;
};

type TagFilter = "active" | "pending" | "inactive" | "archived" | "all";

const statusTone: Record<TagStatus, "warm" | "mint" | "teal" | "soft" | "danger"> = {
  Unassigned: "soft",
  Pending: "warm",
  Preparing: "teal",
  Delivered: "mint",
  Active: "mint",
  Disabled: "soft",
  Lost: "danger",
  Replaced: "soft",
};

const inactiveStatuses: TagStatus[] = ["Lost", "Disabled", "Replaced"];
const pendingStatuses: TagStatus[] = ["Pending", "Preparing", "Delivered"];
const currentStatuses: TagStatus[] = ["Active", "Pending", "Preparing", "Delivered"];
const replacementStatuses: TagStatus[] = ["Active", "Lost", "Disabled", "Replaced"];
const archiveEligibleStatuses: TagStatus[] = ["Lost", "Disabled", "Replaced", "Delivered"];

const filterTabs: { id: TagFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "inactive", label: "Lost / Disabled" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export function TagManagementPanel({
  pets,
  initialTags,
  petId,
}: TagManagementPanelProps) {
  const [tags, setTags] = useState(initialTags);
  const [filter, setFilter] = useState<TagFilter>("active");
  const [lostTag, setLostTag] = useState<PetTag | null>(null);
  const [disableTagTarget, setDisableTagTarget] = useState<PetTag | null>(null);
  const [archiveTagTarget, setArchiveTagTarget] = useState<PetTag | null>(null);
  const petMap = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet])),
    [pets]
  );
  const visibleTags = useMemo(
    () => tags.filter((tag) => shouldShowTag(tag, filter)),
    [filter, tags]
  );

  useEffect(() => {
    let active = true;
    const request = petId ? getPetTags(petId) : getAllTags();

    request.then((response) => {
      if (active) {
        setTags(response.data);
      }
    });

    return () => {
      active = false;
    };
  }, [petId]);

  async function handleDisable() {
    if (!disableTagTarget) {
      return;
    }

    const response = await disableTag(disableTagTarget.id);

    if (response.data) {
      replaceTag(response.data);
    }

    setDisableTagTarget(null);
  }

  async function handleReportLost() {
    if (!lostTag) {
      return;
    }

    const response = await reportTagLost(lostTag.id);

    if (response.data) {
      replaceTag(response.data);
      setFilter("inactive");
    }

    setLostTag(null);
  }

  async function handleArchive() {
    if (!archiveTagTarget) {
      return;
    }

    const response = await archiveTag(archiveTagTarget.id);

    if (response.data) {
      replaceTag(response.data);
      setFilter("archived");
    }

    setArchiveTagTarget(null);
  }

  async function handleRestore(tag: PetTag) {
    const response = await restoreTag(tag.id);

    if (response.data) {
      replaceTag(response.data);
      setFilter(inactiveStatuses.includes(response.data.status) ? "inactive" : "active");
    }
  }

  function replaceTag(updatedTag: PetTag) {
    setTags((current) =>
      current.map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))
    );
  }

  if (!tags.length) {
    return (
      <EmptyState
        icon="tag"
        title="No physical tags yet"
        description="Order a MyPetLink QR Tag or MyPetLink QR + NFC Smart Tag so your pet's profile is easy to open if they are found."
        actionHref={petId ? ownerRoutes.petTagOrder(petId) : ownerRoutes.petNew}
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hide-scrollbar flex min-w-0 gap-2 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              aria-pressed={filter === tab.id}
              className={`min-h-10 shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
                filter === tab.id
                  ? "bg-pet-teal text-white shadow-sm"
                  : "bg-pet-cream text-pet-muted hover:bg-[#e8f3ff] hover:text-pet-teal"
              }`}
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-xs font-bold text-pet-muted sm:text-right">
          Archived tags stay inactive and remain available for history.
        </p>
      </div>

      {visibleTags.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleTags.map((tag) => (
            <TagCard
              key={tag.id}
              linkedPet={tag.petId ? petMap.get(tag.petId) : undefined}
              onArchive={() => setArchiveTagTarget(tag)}
              onDisable={() => setDisableTagTarget(tag)}
              onReportLost={() => setLostTag(tag)}
              onRestore={() => handleRestore(tag)}
              tag={tag}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="tag"
          title="No tags in this view"
          description="Try another filter to see current, inactive, or archived tags."
        />
      )}

      {lostTag ? (
        <ConfirmModal
          cancelLabel="Cancel"
          confirmLabel="Report Tag Lost"
          danger
          message="This will deactivate this physical tag so anyone scanning it will no longer see your pet's safety contact page. Your pet profile and other active tags will not be affected."
          onCancel={() => setLostTag(null)}
          onConfirm={handleReportLost}
          title="Report this tag as lost?"
        />
      ) : null}

      {disableTagTarget ? (
        <ConfirmModal
          cancelLabel="Cancel"
          confirmLabel="Disable Tag"
          danger
          message={`This tag will stop opening ${
            (disableTagTarget.petId
              ? petMap.get(disableTagTarget.petId)?.name
              : undefined) ?? "your pet"
          }'s QR safety page. You can request a replacement tag anytime.`}
          onCancel={() => setDisableTagTarget(null)}
          onConfirm={handleDisable}
          title="Disable this tag?"
        />
      ) : null}

      {archiveTagTarget ? (
        <ConfirmModal
          cancelLabel="Cancel"
          confirmLabel="Archive Tag"
          message="This hides the tag from your main Smart Tags list. The tag will stay inactive and can still be viewed in archived tags."
          onCancel={() => setArchiveTagTarget(null)}
          onConfirm={handleArchive}
          title="Archive this tag?"
        />
      ) : null}
    </>
  );
}

function TagCard({
  linkedPet,
  onArchive,
  onDisable,
  onReportLost,
  onRestore,
  tag,
}: {
  linkedPet?: Pet;
  onArchive: () => void;
  onDisable: () => void;
  onReportLost: () => void;
  onRestore: () => void;
  tag: PetTag;
}) {
  const productName = tag.hasNfc
    ? "MyPetLink QR + NFC Smart Tag"
    : "MyPetLink QR Pet Tag";
  const isUnassigned = tag.status === "Unassigned";
  const isInactive = inactiveStatuses.includes(tag.status);
  const isArchived = Boolean(tag.isArchived);
  const canRequestReplacement =
    Boolean(tag.petId) && replacementStatuses.includes(tag.status);
  const canReportTagLost =
    !isArchived && (tag.status === "Active" || tag.status === "Delivered");
  const canDisable =
    !isArchived && (tag.status === "Active" || tag.status === "Delivered");
  const canArchive =
    !isArchived && archiveEligibleStatuses.includes(tag.status);
  const replacementHref = tag.petId
    ? ownerRoutes.petTagOrder(tag.petId, {
        type: tag.hasNfc ? "nfc" : "qr",
        replacementFor: tag.id,
      })
    : "";

  return (
    <article className="brand-card rounded-[1.75rem] p-5" key={tag.id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone[tag.status]}>{tag.status}</Badge>
            {isArchived ? <Badge tone="soft">Archived</Badge> : null}
          </div>
          <p className="mt-3 text-xs font-bold uppercase text-pet-muted">
            Tag code
          </p>
          <h2 className="break-words text-2xl font-black tracking-wide text-pet-ink">
            {tag.tagCode}
          </h2>
          <p className="mt-1 text-sm text-pet-muted">
            {productName} - {tag.shape}
          </p>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
          <Icon name="tag" className="h-5 w-5" />
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        {[
          ["Linked pet", linkedPet?.name ?? "Not linked yet"],
          ["Ordered date", tag.orderedDate ?? "Not ordered yet"],
          ["Delivered date", tag.deliveredDate ?? "Not delivered yet"],
          ["Last scanned", tag.lastScannedAt ?? "No scans yet"],
        ].map(([label, value]) => (
          <div className="rounded-[1.25rem] bg-pet-cream p-4" key={label}>
            <dt className="text-xs font-bold uppercase text-pet-muted">
              {label}
            </dt>
            <dd className="mt-1 font-bold text-pet-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {isInactive || isArchived ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          Scanning this tag shows an inactive tag page and does not expose owner
          contact details.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <CTAButton
          href={tagPath(tag.tagCode)}
          icon="qr"
          variant="secondary"
          target="_blank"
          rel="noopener noreferrer"
          fullWidth
        >
          {isInactive || isArchived ? "View Status" : "View Tag"}
        </CTAButton>

        {isArchived ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={onRestore}
            type="button"
          >
            Restore to List
          </button>
        ) : isUnassigned ? (
          <CTAButton href={activatePath(tag.tagCode)} icon="paw" fullWidth>
            Activate Tag
          </CTAButton>
        ) : (
          <>
            {canRequestReplacement && replacementHref ? (
              <CTAButton
                href={replacementHref}
                icon="tag"
                variant={isInactive ? "secondary" : "outline"}
                fullWidth
              >
                Request Replacement
              </CTAButton>
            ) : null}
            {canDisable ? (
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-transparent px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={onDisable}
                type="button"
              >
                Disable Tag
              </button>
            ) : null}
            {canReportTagLost ? (
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#fff4f1] px-5 py-3 text-sm font-bold text-[#a63c2e] transition hover:bg-[#ffe8e3]"
                onClick={onReportLost}
                type="button"
              >
                Report Tag Lost
              </button>
            ) : null}
            {canArchive ? (
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-muted transition hover:bg-pet-cream"
                onClick={onArchive}
                type="button"
              >
                Archive Tag
              </button>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function shouldShowTag(tag: PetTag, filter: TagFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "archived") {
    return Boolean(tag.isArchived);
  }

  if (tag.isArchived) {
    return false;
  }

  if (filter === "active") {
    return currentStatuses.includes(tag.status);
  }

  if (filter === "pending") {
    return pendingStatuses.includes(tag.status);
  }

  return inactiveStatuses.includes(tag.status);
}

function ConfirmModal({
  cancelLabel,
  confirmLabel,
  danger = false,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const confirmClass = danger
    ? "border-[#ffd2c9] bg-[#ffe8e3] text-[#a63c2e] hover:bg-[#ffd8cf]"
    : "border-pet-teal bg-[#e8f3ff] text-pet-teal hover:bg-[#d8edff]";

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
        <h2 className="text-2xl font-black text-pet-ink">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-pet-muted">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`inline-flex min-h-12 items-center justify-center rounded-full border px-5 py-3 text-sm font-bold transition ${confirmClass}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
