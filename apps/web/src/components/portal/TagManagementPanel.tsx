"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { formatOrderNumber } from "@/lib/orders";
import {
  getActivePets,
  isActivePet,
  isArchivedPet,
  isMemorialPet,
} from "@/lib/petLifecycle";
import { ownerRoutes, tagPath } from "@/lib/routes";
import { getEnvBaseUrl, getSiteBaseUrl, toAbsoluteUrl } from "@/lib/siteUrl";
import {
  compareTagsForDisplay,
  getTagAvailableActions,
  getTagDisplayStatus,
  getTagOrder,
  getTagScanDisplay,
  inactiveTagStatuses,
  isActivePhysicalTagForPet,
  isInactivePhysicalTag,
  isPendingPhysicalTag,
  isTagLinkedToInactivePet,
  shouldShowTagForFilter,
  type TagFilter,
} from "@/lib/tagStatus";
import { getPets } from "@/services/petService";
import {
  archiveTag,
  disableTag,
  getFriendlyTagErrorMessage,
  getAllTags,
  getOrders,
  getPetTags,
  reportTagLost,
  restoreTag,
} from "@/services/tagService";
import { isApiConfigured } from "@/services/apiConfig";
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
  pets: initialPets,
  initialTags,
  initialOrders = [],
  petId,
}: TagManagementPanelProps) {
  const router = useRouter();
  const apiMode = isApiConfigured();
  const [pets, setPets] = useState(apiMode ? [] : initialPets);
  const [tags, setTags] = useState<PetTag[]>(apiMode ? [] : initialTags);
  const [orders, setOrders] = useState<TagOrder[]>(
    apiMode ? [] : initialOrders
  );
  const [filter, setFilter] = useState<TagFilter>("active");
  const [loading, setLoading] = useState(apiMode);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  // "" means "All pets". On a pet-scoped route (petId set) we default to that
  // pet; changing the selector there navigates instead of cross-filtering.
  const [selectedPetId, setSelectedPetId] = useState(petId ?? "");
  const isScoped = Boolean(petId);
  const selectedPet = selectedPetId
    ? pets.find((pet) => pet.id === selectedPetId)
    : undefined;
  const [lostTag, setLostTag] = useState<PetTag | null>(null);
  const [disableTagTarget, setDisableTagTarget] = useState<PetTag | null>(null);
  const [archiveTagTarget, setArchiveTagTarget] = useState<PetTag | null>(null);
  const petMap = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet])),
    [pets]
  );
  const orderablePets = useMemo(() => getActivePets(pets), [pets]);
  const visibleTags = useMemo(
    () =>
      tags
        .filter((tag) => !selectedPetId || tag.petId === selectedPetId)
        .filter((tag) =>
          shouldShowTagForFilter(
            tag,
            filter,
            getTagOrder(tag, orders),
            tag.petId ? petMap.get(tag.petId) : undefined
          )
        )
        .sort((a, b) =>
          compareTagsForDisplay(
            a,
            b,
            orders,
            a.petId ? petMap.get(a.petId) : undefined,
            b.petId ? petMap.get(b.petId) : undefined
          )
        ),
    [filter, orders, petMap, selectedPetId, tags]
  );

  function handleSelectPet(nextPetId: string) {
    // On the pet-scoped route, switching pets navigates to that pet's tags so
    // the URL and header stay in sync; the owner-level /tags hub filters in place.
    if (isScoped) {
      router.push(nextPetId ? ownerRoutes.petTags(nextPetId) : ownerRoutes.tags);
      return;
    }
    setSelectedPetId(nextPetId);
  }

  const orderPetId =
    selectedPet && isActivePet(selectedPet)
      ? selectedPet.id
      : !selectedPet
        ? orderablePets[0]?.id ?? ""
        : "";
  const orderHref = orderPetId ? ownerRoutes.petTagOrder(orderPetId) : "";
  const showOrderButton = Boolean(orderHref);

  useEffect(() => {
    let active = true;

    async function loadTags() {
      setLoading(true);
      setLoadError("");

      try {
        const tagRequest = petId ? getPetTags(petId) : getAllTags();
        const [tagResponse, orderResponse, petsResponse] = await Promise.all([
          tagRequest,
          getOrders(),
          getPets(),
        ]);

        if (active) {
          setTags(tagResponse.data);
          setOrders(orderResponse.data);
          setPets(petsResponse.data);
        }
      } catch (caught) {
        if (active) {
          setLoadError(getFriendlyTagErrorMessage(caught));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTags();

    return () => {
      active = false;
    };
  }, [petId]);

  async function handleDisable() {
    if (!disableTagTarget) {
      return;
    }

    try {
      setActionError("");
      const response = await disableTag(disableTagTarget.id);

      if (response.data) {
        replaceTag(response.data);
      }
    } catch (caught) {
      setActionError(getFriendlyTagErrorMessage(caught));
    } finally {
      setDisableTagTarget(null);
    }
  }

  async function handleReportLost() {
    if (!lostTag) {
      return;
    }

    try {
      setActionError("");
      const response = await reportTagLost(lostTag.id);

      if (response.data) {
        replaceTag(response.data);
        setFilter("inactive");
      }
    } catch (caught) {
      setActionError(getFriendlyTagErrorMessage(caught));
    } finally {
      setLostTag(null);
    }
  }

  async function handleArchive() {
    if (!archiveTagTarget) {
      return;
    }

    try {
      setActionError("");
      const response = await archiveTag(archiveTagTarget.id);

      if (response.data) {
        replaceTag(response.data);
        setFilter("archived");
      }
    } catch (caught) {
      setActionError(getFriendlyTagErrorMessage(caught));
    } finally {
      setArchiveTagTarget(null);
    }
  }

  async function handleRestore(tag: PetTag) {
    try {
      setActionError("");
      const response = await restoreTag(tag.id);

      if (response.data) {
        replaceTag(response.data);
        setFilter(
          inactiveTagStatuses.includes(response.data.status) ? "inactive" : "active"
        );
      }
    } catch (caught) {
      setActionError(getFriendlyTagErrorMessage(caught));
    }
  }

  function replaceTag(updatedTag: PetTag) {
    setTags((current) =>
      current.map((tag) => (tag.id === updatedTag.id ? updatedTag : tag))
    );
  }

  if (loading) {
    return (
      <div className="brand-card rounded-[1.75rem] p-6 text-sm font-semibold text-pet-muted">
        Loading Smart Tags...
      </div>
    );
  }

  if (loadError && !tags.length) {
    return (
      <EmptyState
        icon="tag"
        title="Smart Tags could not load"
        description={loadError}
        actionHref={ownerRoutes.dashboard}
        actionLabel="Back to Dashboard"
      />
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
      {actionError ? (
        <div className="mb-4 rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {actionError}
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-4 rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e]">
          {loadError}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {pets.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-bold text-pet-ink">
              <span className="shrink-0">Pet</span>
              <select
                aria-label="Filter Smart Tags by pet"
                className="brand-input h-11 min-h-11 w-auto min-w-0"
                onChange={(event) => handleSelectPet(event.target.value)}
                value={selectedPetId}
              >
                <option value="">All pets</option>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="text-xs font-semibold leading-5 text-pet-muted">
            {selectedPet
              ? `Physical QR and QR + NFC tags linked to ${selectedPet.name}.`
              : "Showing physical tags across all pets."}
          </p>
        </div>
        {showOrderButton ? (
          <CTAButton className="shrink-0" href={orderHref} icon="tag">
            {selectedPet
              ? `Order a tag for ${selectedPet.name}`
              : "Order Physical Tag"}
          </CTAButton>
        ) : null}
      </div>

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
        <div
          className={`grid gap-4 ${
            visibleTags.length === 1 ? "" : "lg:grid-cols-2"
          }`}
        >
          {visibleTags.map((tag) => (
            <TagCard
              key={tag.id}
              linkedPet={tag.petId ? petMap.get(tag.petId) : undefined}
              onArchive={() => setArchiveTagTarget(tag)}
              onDisable={() => setDisableTagTarget(tag)}
              onReportLost={() => setLostTag(tag)}
              onRestore={() => handleRestore(tag)}
              order={getTagOrder(tag, orders)}
              tag={tag}
            />
          ))}
        </div>
      ) : (
        (() => {
          const empty = getTagEmptyState(filter, selectedPet?.name);
          return (
            <EmptyState
              icon="tag"
              title={empty.title}
              description={empty.description}
              actionHref={empty.showOrder && showOrderButton ? orderHref : undefined}
              actionLabel={
                empty.showOrder && showOrderButton ? empty.orderLabel : undefined
              }
            />
          );
        })()
      )}

      {lostTag ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel="Report Tag Lost"
          destructive
          message="This will deactivate this physical tag so anyone scanning it will no longer see your pet's safety contact page. Your pet profile and other active tags will not be affected."
          onCancel={() => setLostTag(null)}
          onConfirm={handleReportLost}
          open={Boolean(lostTag)}
          title="Report this tag as lost?"
        />
      ) : null}

      {disableTagTarget ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel="Disable Tag"
          destructive
          message={`This tag will stop opening ${
            (disableTagTarget.petId
              ? petMap.get(disableTagTarget.petId)?.name
              : undefined) ?? "your pet"
          }'s QR Safety Page through this physical tag. The pet's own QR Safety Page stays active.`}
          onCancel={() => setDisableTagTarget(null)}
          onConfirm={handleDisable}
          open={Boolean(disableTagTarget)}
          title="Disable this tag?"
        />
      ) : null}

      {archiveTagTarget ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel="Archive Tag"
          message="This hides the tag from your main Smart Tags list. The tag will stay inactive and can still be viewed in archived tags."
          onCancel={() => setArchiveTagTarget(null)}
          onConfirm={handleArchive}
          open={Boolean(archiveTagTarget)}
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
  tag,
}: {
  linkedPet?: Pet;
  onArchive: () => void;
  onDisable: () => void;
  onReportLost: () => void;
  onRestore: () => void;
  order?: TagOrder;
  tag: PetTag;
}) {
  const base = useSyncExternalStore(subscribeNoop, getSiteBaseUrl, getEnvBaseUrl);
  const [copyStatus, setCopyStatus] = useState("");
  const productName = tag.hasNfc
    ? "MyPetLink QR + NFC Smart Tag"
    : "MyPetLink QR Pet Tag";
  const actions = getTagAvailableActions(tag, order, linkedPet);
  const displayStatus = getTagDisplayStatus(tag, order, linkedPet);
  const scanDisplay = getTagScanDisplay(tag, order, linkedPet);
  const isActive = isActivePhysicalTagForPet(tag, linkedPet);
  const linkedToInactivePet = isTagLinkedToInactivePet(tag, linkedPet);
  const isInactive = isInactivePhysicalTag(tag) || linkedToInactivePet;
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
  const scanUrl = toAbsoluteUrl(scanPath, base);
  const codeLabel =
    isPending || tag.status === "Unassigned" ? "Reserved tag code" : "Tag code";
  const detailItems = [
    ["Linked pet", linkedPet?.name ?? "Not linked yet"],
    order ? ["Order", formatOrderNumber(order)] : null,
    ["Ordered date", tag.orderedDate ?? "Not ordered yet"],
    ["Delivered date", tag.deliveredDate ?? "Not delivered yet"],
    [scanDisplay.label, scanDisplay.value],
  ].filter((item): item is [string, string] => Boolean(item));

  return (
    <article className="brand-card rounded-[1.75rem] p-5" key={tag.id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone={getStatusTone(tag, order, linkedPet)}>
              {displayStatus}
            </Badge>
            {isArchived ? <Badge tone="soft">Archived</Badge> : null}
          </div>
          <p className="mt-3 text-xs font-bold uppercase text-pet-muted">
            {codeLabel}
          </p>
          <h2 className="break-words text-2xl font-black tracking-wide text-pet-ink">
            {tag.tagCode}
          </h2>
          <p className="mt-1 text-sm text-pet-muted">
            {productName} - {tag.variant} Tag
          </p>
          {isActive || isInactive ? (
            <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
              <p className="text-xs font-bold uppercase text-pet-muted">
                Physical Tag Scan Page
              </p>
              <p className="mt-1 text-sm font-bold text-pet-ink">
                Use the physical tag QR when you need to view, copy, or download
                the scan page code.
              </p>
              <QrCodeButton
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                fileNameBase={`${tag.tagCode}-physical-tag-qr`}
                helperText="This is the QR printed on your physical tag. If the tag is lost or disabled, the scan page will stop showing your contact details."
                label="Show Physical Tag QR"
                targetPath={scanPath}
                title="Physical Tag QR"
                viewLabel={isActive ? "View Tag Scan Page" : "View Inactive Tag Page"}
                warning={
                  isActive
                    ? undefined
                    : "This tag is inactive. Scanning it shows an inactive tag page and never reveals owner contact details."
                }
              />
            </div>
          ) : isPending || tag.status === "Unassigned" ? (
            <div className="mt-4 rounded-[1.25rem] bg-pet-cream p-4">
              <p className="text-xs font-bold uppercase text-pet-muted">
                Physical Tag Scan Page
              </p>
              <p className="mt-1 text-sm font-bold text-pet-ink">
                {tag.status === "Unassigned"
                  ? "Scan or open the physical tag link to activate this tag for a pet."
                  : tag.petId
                    ? "Waiting for owner activation. Scan or tap the physical tag when you receive it."
                    : "Physical tag QR will appear after an inventory tag is assigned."}
              </p>
            </div>
          ) : null}
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
          <Icon name="tag" className="h-5 w-5" />
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        {detailItems.map(([label, value]) => (
          <div className="rounded-[1.25rem] bg-pet-cream p-4" key={label}>
            <dt className="text-xs font-bold uppercase text-pet-muted">
              {label}
            </dt>
            <dd className="mt-1 font-bold text-pet-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {linkedToInactivePet && isMemorialPet(linkedPet) ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          {linkedPet?.name} is in Memorial Mode. Scanning this physical tag
          shows an inactive memorial tag page and does not expose owner contact
          details.
        </p>
      ) : linkedToInactivePet && isArchivedPet(linkedPet) ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          {linkedPet?.name}&apos;s profile is archived. Scanning this physical
          tag shows an inactive tag page and does not expose owner contact
          details.
        </p>
      ) : isInactive ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          Scanning this physical tag shows an inactive tag page and does not
          expose owner contact details. The pet&apos;s QR Safety Page still works.
        </p>
      ) : isPending ? (
        <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
          Waiting for owner activation. Scan or tap the physical tag when you
          receive it to activate it. It will not show owner contact details
          before activation.
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
        {actions.includes("copy-tag-scan-link") ? (
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={() => {
              void copyText(scanUrl).then((copied) => {
                setCopyStatus(
                  copied
                    ? "Tag Scan Page link copied."
                    : "Copy unavailable. Select and copy the link."
                );
                window.setTimeout(() => setCopyStatus(""), 2500);
              });
            }}
            type="button"
          >
            Copy Tag Link
          </button>
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
      {copyStatus ? (
        <p className="mt-3 text-xs font-bold text-pet-sage" role="status">
          {copyStatus}
        </p>
      ) : null}
    </article>
  );
}

function subscribeNoop() {
  return () => {};
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Try the textarea copy path below.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

function getTagEmptyState(filter: TagFilter, petName?: string) {
  const orderLabel = petName ? `Order a tag for ${petName}` : "Order Physical Tag";

  switch (filter) {
    case "active":
      return {
        title: petName
          ? `${petName} has no active physical tag yet.`
          : "No active physical tags yet.",
        description:
          "Pending and inactive tags are kept out of the Active view.",
        showOrder: true,
        orderLabel,
      };
    case "pending":
      return {
        title: petName
          ? `No pending tag orders for ${petName}.`
          : "No pending tag orders.",
        description:
          "Tag orders appear here while payment and preparation are in progress.",
        showOrder: false,
        orderLabel,
      };
    case "inactive":
      return {
        title: petName
          ? `${petName} has no lost or disabled tags.`
          : "No lost or disabled tags.",
        description: "Tags you report lost or disable will appear here.",
        showOrder: false,
        orderLabel,
      };
    case "archived":
      return {
        title: "No archived tags yet.",
        description:
          "Archived tags stay inactive and remain available for history.",
        showOrder: false,
        orderLabel,
      };
    default:
      return {
        title: petName ? `No tags for ${petName} yet.` : "No tags in this view.",
        description:
          "Try another filter to see active, pending, inactive, or archived tags.",
        showOrder: true,
        orderLabel,
      };
  }
}

function getStatusTone(
  tag: PetTag,
  order?: TagOrder,
  linkedPet?: Pet
): "warm" | "mint" | "teal" | "soft" | "danger" {
  if (isTagLinkedToInactivePet(tag, linkedPet)) {
    return "soft";
  }

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
