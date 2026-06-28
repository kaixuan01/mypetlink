"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { formatOrderNumber } from "@/lib/orders";
import { activatePath, ownerRoutes, tagPath } from "@/lib/routes";
import {
  compareTagsForDisplay,
  getTagAvailableActions,
  getTagDisplayStatus,
  getTagOrder,
  getTagScanDisplay,
  inactiveTagStatuses,
  isActivePhysicalTag,
  isInactivePhysicalTag,
  isPendingPhysicalTag,
  shouldShowTagForFilter,
  type TagFilter,
} from "@/lib/tagStatus";
import {
  archiveTag,
  disableTag,
  getAllTags,
  getOrders,
  getPetTags,
  reportTagLost,
  restoreTag,
} from "@/services/tagService";
import type { Pet, PetTag, TagOrder, TagStatus } from "@/types";

type TagManagementPanelProps = {
  pets: Pet[];
  initialTags: PetTag[];
  initialOrders?: TagOrder[];
  petId?: string;
};

const statusTone: Record<TagStatus, "warm" | "mint" | "teal" | "soft" | "danger"> = {
  Unassigned: "soft",
  Pending: "warm",
  Preparing: "teal",
  Delivered: "mint",
  Active: "mint",
  Disabled: "soft",
  Lost: "danger",
  Replaced: "soft",
  Archived: "soft",
};

const filterTabs: (SegmentedTab & { id: TagFilter })[] = [
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "inactive", label: "Lost / Disabled" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export function TagManagementPanel({
  pets,
  initialTags,
  initialOrders = [],
  petId,
}: TagManagementPanelProps) {
  const [tags, setTags] = useState(initialTags);
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<TagFilter>("active");
  const [lostTag, setLostTag] = useState<PetTag | null>(null);
  const [disableTagTarget, setDisableTagTarget] = useState<PetTag | null>(null);
  const [archiveTagTarget, setArchiveTagTarget] = useState<PetTag | null>(null);
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const petMap = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet])),
    [pets]
  );
  const visibleTags = useMemo(
    () =>
      tags
        .filter((tag) => shouldShowTagForFilter(tag, filter, getTagOrder(tag, orders)))
        .sort((a, b) => compareTagsForDisplay(a, b, orders)),
    [filter, orders, tags]
  );

  useEffect(() => {
    let active = true;
    const tagRequest = petId ? getPetTags(petId) : getAllTags();

    Promise.all([tagRequest, getOrders()]).then(([tagResponse, orderResponse]) => {
      if (active) {
        setTags(tagResponse.data);
        setOrders(orderResponse.data);
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
      setFilter(
        inactiveTagStatuses.includes(response.data.status) ? "inactive" : "active"
      );
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
        description="Order a MyPetLink QR Tag or MyPetLink QR + NFC Smart Tag so your pet's QR Safety Page is easy to open if they are found."
        actionHref={petId ? ownerRoutes.petTagOrder(petId) : ownerRoutes.petNew}
        actionLabel="Order Physical Tag"
      />
    );
  }

  return (
    <>
      <div className="mb-4 grid min-w-0 gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <SegmentedTabs
          ariaLabel="Filter smart tags"
          activeId={filter}
          onChange={(id) => setFilter(id as TagFilter)}
          sticky={false}
          tabs={filterTabs}
        />
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
              order={getTagOrder(tag, orders)}
              origin={origin}
              tag={tag}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="tag"
          title={
            filter === "active"
              ? "No active physical tags yet."
              : "No tags in this view"
          }
          description={
            filter === "active"
              ? "Pending and inactive tags are kept out of the Active view."
              : "Try another filter to see pending, inactive, or archived tags."
          }
          actionHref={
            filter === "active"
              ? petId
                ? ownerRoutes.petTagOrder(petId)
                : pets[0]
                  ? ownerRoutes.petTagOrder(pets[0].id)
                  : ownerRoutes.petNew
              : undefined
          }
          actionLabel={filter === "active" ? "Order Physical Tag" : undefined}
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
          }'s QR Safety Page through this physical tag. The pet's own QR Safety Page stays active.`}
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
  order,
  origin,
  tag,
}: {
  linkedPet?: Pet;
  onArchive: () => void;
  onDisable: () => void;
  onReportLost: () => void;
  onRestore: () => void;
  order?: TagOrder;
  origin: string;
  tag: PetTag;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const productName = tag.hasNfc
    ? "MyPetLink QR + NFC Smart Tag"
    : "MyPetLink QR Pet Tag";
  const actions = getTagAvailableActions(tag, order);
  const displayStatus = getTagDisplayStatus(tag, order);
  const scanDisplay = getTagScanDisplay(tag, order);
  const isActive = isActivePhysicalTag(tag);
  const isInactive = isInactivePhysicalTag(tag);
  const isPending = isPendingPhysicalTag(tag, order);
  const isArchived = Boolean(tag.isArchived);
  const orderHref = order ? ownerRoutes.orderDetail(formatOrderNumber(order)) : "";
  const replacementHref = tag.petId
    ? ownerRoutes.petTagOrder(tag.petId, {
        type: tag.hasNfc ? "nfc" : "qr",
        replacementFor: tag.id,
      })
    : "";
  const scanPath = tagPath(tag.tagCode);
  const scanUrl = origin ? `${origin}${scanPath}` : scanPath;
  const codeLabel =
    isPending || tag.status === "Unassigned" ? "Reserved tag code" : "Tag code";
  const detailItems = [
    ["Linked pet", linkedPet?.name ?? "Not linked yet"],
    order ? ["Order", formatOrderNumber(order)] : null,
    ["Ordered date", tag.orderedDate ?? "Not ordered yet"],
    ["Delivered date", tag.deliveredDate ?? "Not delivered yet"],
    [scanDisplay.label, scanDisplay.value],
  ].filter((item): item is [string, string] => Boolean(item));

  async function handleCopyScanLink() {
    try {
      await navigator.clipboard.writeText(scanUrl);
      setCopyMessage("Tag scan link copied.");
    } catch {
      setCopyMessage("Copy unavailable. Select and copy the link.");
    }

    window.setTimeout(() => setCopyMessage(""), 2500);
  }

  return (
    <article className="brand-card rounded-[1.75rem] p-5" key={tag.id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone={getStatusTone(tag, order)}>{displayStatus}</Badge>
            {isArchived ? <Badge tone="soft">Archived</Badge> : null}
          </div>
          <p className="mt-3 text-xs font-bold uppercase text-pet-muted">
            {codeLabel}
          </p>
          <h2 className="break-words text-2xl font-black tracking-wide text-pet-ink">
            {tag.tagCode}
          </h2>
          <p className="mt-1 text-sm text-pet-muted">
            {productName} - {tag.shape}
          </p>
          {isActive ? (
            <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
              <p className="text-xs font-bold uppercase text-pet-muted">
                Physical Tag Scan Link
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <p className="min-w-0 break-all text-sm font-bold text-pet-teal">
                  {scanUrl}
                </p>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-white/80"
                  onClick={handleCopyScanLink}
                  type="button"
                >
                  <Icon name="copy" className="h-4 w-4" />
                  <span className="sm:hidden">Copy</span>
                  <span className="hidden sm:inline">Copy Tag Scan Link</span>
                </button>
              </div>
              {copyMessage ? (
                <p className="mt-2 text-xs font-bold text-pet-sage">
                  {copyMessage}
                </p>
              ) : null}
            </div>
          ) : isPending || tag.status === "Unassigned" ? (
            <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
              <p className="text-xs font-bold uppercase text-pet-muted">
                Physical tag scan link
              </p>
              <p className="mt-1 text-sm font-bold text-pet-ink">
                {tag.status === "Unassigned"
                  ? "Activate this reserved tag to turn on its scan page."
                  : "Tag scan link will be available after activation."}
              </p>
            </div>
          ) : null}
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
          <Icon name="tag" className="h-5 w-5" />
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        {detailItems.map(([label, value]) => (
          <div className="rounded-[1.25rem] bg-pet-cream p-4" key={label}>
            <dt className="text-xs font-bold uppercase text-pet-muted">
              {label}
            </dt>
            <dd className="mt-1 font-bold text-pet-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {isInactive ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          Scanning this physical tag shows an inactive tag page and does not
          expose owner contact details. The pet&apos;s QR Safety Page still works.
        </p>
      ) : isPending ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          Physical tag scan link is not active yet. Scan history appears after
          activation.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {actions.includes("view-tag-scan-page") ? (
          <CTAButton
            href={scanPath}
            icon="qr"
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            View Tag Scan Page
          </CTAButton>
        ) : null}
        {actions.includes("view-inactive-tag-page") ? (
          <CTAButton
            href={scanPath}
            icon="qr"
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            View Inactive Tag Page
          </CTAButton>
        ) : null}
        {actions.includes("view-status") ? (
          <CTAButton
            href={scanPath}
            icon="qr"
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            View Status
          </CTAButton>
        ) : null}
        {actions.includes("pay-by-qr") && orderHref ? (
          <CTAButton href={orderHref} icon="record" variant="coral" fullWidth>
            Pay by QR
          </CTAButton>
        ) : null}
        {actions.includes("view-payment-status") && orderHref ? (
          <CTAButton href={orderHref} icon="record" variant="secondary" fullWidth>
            View Payment Status
          </CTAButton>
        ) : null}
        {actions.includes("activate-tag") ? (
          <CTAButton href={activatePath(tag.tagCode)} icon="paw" fullWidth>
            Activate Tag
          </CTAButton>
        ) : null}
        {actions.includes("view-order") && orderHref ? (
          <CTAButton href={orderHref} icon="record" variant="outline" fullWidth>
            View Order
          </CTAButton>
        ) : null}
        {actions.includes("view-preparation-status") && orderHref ? (
          <CTAButton href={orderHref} icon="record" variant="secondary" fullWidth>
            View Preparation Status
          </CTAButton>
        ) : null}
        {actions.includes("restore-to-list") ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={onRestore}
            type="button"
          >
            Restore to List
          </button>
        ) : null}
        {actions.includes("request-replacement") && replacementHref ? (
          <CTAButton
            href={replacementHref}
            icon="tag"
            variant={isInactive ? "secondary" : "outline"}
            fullWidth
          >
            Request Replacement
          </CTAButton>
        ) : null}
        {actions.includes("report-tag-lost") ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#fff4f1] px-5 py-3 text-sm font-bold text-[#a63c2e] transition hover:bg-[#ffe8e3]"
            onClick={onReportLost}
            type="button"
          >
            Report Tag Lost
          </button>
        ) : null}
        {actions.includes("disable-tag") ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-transparent px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={onDisable}
            type="button"
          >
            Disable Tag
          </button>
        ) : null}
        {actions.includes("archive-tag") ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-muted transition hover:bg-pet-cream"
            onClick={onArchive}
            type="button"
          >
            Archive Tag
          </button>
        ) : null}
      </div>
    </article>
  );
}

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return "https://mypetlink.pages.dev";
}

function getStatusTone(
  tag: PetTag,
  order?: TagOrder
): "warm" | "mint" | "teal" | "soft" | "danger" {
  if (tag.isArchived) {
    return "soft";
  }

  if (tag.status === "Lost") {
    return "danger";
  }

  if (tag.status === "Active") {
    return "mint";
  }

  if (order?.status === "Payment Submitted" || tag.status === "Preparing") {
    return "teal";
  }

  if (
    order?.status === "Payment Confirmed" ||
    order?.status === "Preparing" ||
    tag.status === "Delivered"
  ) {
    return "warm";
  }

  return statusTone[tag.status];
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
