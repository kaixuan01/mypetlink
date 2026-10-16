"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { SmartTagsComingSoon } from "@/components/portal/SmartTagsComingSoon";
import { TagScanHistoryDialog } from "@/components/portal/TagScanHistoryDialog";
import { smartTagOrderingEnabled } from "@/lib/features";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import { formatOrderNumber } from "@/lib/orders";
import {
  getActivePets,
  isActivePet,
  isArchivedPet,
  isMemorialPet,
} from "@/lib/petLifecycle";
import { getQrSafetyPath, ownerRoutes, tagNfcPath, tagQrPath } from "@/lib/routes";
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
import { getOwnerPlanSummary } from "@/services/ownerProfileService";
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
import type {
  PetListItem,
  PetTag,
  TagOrder,
  TagStatus,
} from "@/types";

type TagManagementPanelProps = {
  pets: PetListItem[];
  initialTags: PetTag[];
  initialOrders?: TagOrder[];
  petId?: string;
  showOrderAction?: boolean;
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
  { id: "inactive", label: "Inactive" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export function TagManagementPanel({
  pets: initialPets,
  initialTags,
  initialOrders = [],
  petId,
  showOrderAction = true,
}: TagManagementPanelProps) {
  const router = useRouter();
  const viewTrackedRef = useRef(false);
  const apiMode = isApiConfigured();
  const [pets, setPets] = useState(apiMode ? [] : initialPets);
  const [tags, setTags] = useState<PetTag[]>(apiMode ? [] : initialTags);
  const [orders, setOrders] = useState<TagOrder[]>(
    apiMode ? [] : initialOrders
  );
  const [filter, setFilter] = useState<TagFilter>("active");
  const [loading, setLoading] = useState(apiMode);
  const [loadError, setLoadError] = useState("");
  const [scanHistoryDays, setScanHistoryDays] = useState(0);
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
  // Keep each tag's disclosure state across filtering and lifecycle updates.
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(() => new Set());

  function toggleTagDetails(tagId: string) {
    setExpandedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackEvent(AnalyticsEvent.SmartTagViewed, {
      surface: petId ? "pet_tags" : "owner_tags",
    });
  }, [petId]);
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
      : !selectedPet && isScoped
        ? orderablePets[0]?.id ?? ""
        : "";
  const orderHref = orderPetId
    ? ownerRoutes.petTagOrder(orderPetId)
    : !isScoped
      ? ownerRoutes.tagOrder()
      : "";
  // Ordering CTAs are hidden while Smart Tag ordering is disabled for launch.
  const showOrderButton =
    showOrderAction && Boolean(orderHref) && smartTagOrderingEnabled;

  useEffect(() => {
    let active = true;

    async function loadTags() {
      setLoading(true);
      setLoadError("");

      try {
        const tagRequest = petId ? getPetTags(petId) : getAllTags();
        const planRequest = apiMode ? getOwnerPlanSummary() : Promise.resolve(null);
        const [tagResponse, orderResponse, petsResponse, planSummary] =
          await Promise.all([
            tagRequest,
            getOrders(),
            getPets(),
            planRequest,
          ]);

        if (active) {
          setTags(tagResponse.data);
          setOrders(orderResponse.data);
          setPets(petsResponse.data);
          setScanHistoryDays(planSummary?.scanHistoryDays ?? 0);
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
  }, [apiMode, petId]);

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
      current.map((tag) =>
        tag.id === updatedTag.id
          ? {
              ...updatedTag,
              lastScanSource: tag.lastScanSource,
              qrScansLast30Days: tag.qrScansLast30Days,
              nfcTapsLast30Days: tag.nfcTapsLast30Days,
            }
          : tag
      )
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
        actionLabel="Try Again"
        actionOnClick={() => window.location.reload()}
      />
    );
  }

  if (!tags.length) {
    if (!smartTagOrderingEnabled) {
      return <SmartTagsComingSoon petId={petId} />;
    }

    return (
      <EmptyState
        icon="tag"
        title="No physical tags yet"
        description="Order a MyPetLink QR + NFC Smart Tag so your pet's Safety Profile is easy to scan or tap open if they are found."
        actionHref={showOrderButton ? orderHref : undefined}
        actionLabel={showOrderButton ? "Order Physical Tag" : undefined}
      />
    );
  }

  return (
    <>
      {!smartTagOrderingEnabled ? (
        <div className="mb-4 rounded-[1.25rem] border border-pet-border bg-pet-cream px-4 py-3 text-sm font-semibold leading-6 text-pet-muted">
          New Smart Tag ordering is coming soon. Your existing tags below still
          work, and every pet&apos;s free Safety Profile stays active.
        </div>
      ) : null}

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

      <div className="mb-4 min-w-0 rounded-[1.5rem] border border-pet-border bg-white p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {pets.length > 1 ? (
            <label className="flex min-w-0 items-center gap-3 text-sm font-bold text-pet-ink">
              <span className="shrink-0">Pet</span>
              <select
                aria-label="Filter Smart Tags by pet"
                className="brand-input h-12 min-h-12 min-w-0 flex-1 sm:w-48 sm:flex-none"
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
          {showOrderButton ? (
            <CTAButton className="shrink-0" href={orderHref} icon="tag">
              Order Physical Tag
            </CTAButton>
          ) : null}
        </div>
        <SegmentedTabs
          className="mt-3"
          ariaLabel="Filter smart tags"
          activeId={filter}
          onChange={(id) => setFilter(id as TagFilter)}
          sticky={false}
          tabs={filterTabs}
        />
        {filter === "archived" ? (
          <p className="mt-3 px-1 text-xs font-semibold text-pet-muted">
            Archived tags stay inactive and remain available for history.
          </p>
        ) : null}
      </div>

      {visibleTags.length ? (
        <div
          className={`grid items-start gap-4 ${
            visibleTags.length === 1 ? "" : "lg:grid-cols-2"
          }`}
        >
          {visibleTags.map((tag) => (
            <TagCard
              key={tag.id}
              expanded={expandedTagIds.has(tag.id)}
              linkedPet={tag.petId ? petMap.get(tag.petId) : undefined}
              onArchive={() => setArchiveTagTarget(tag)}
              onDisable={() => setDisableTagTarget(tag)}
              onReportLost={() => setLostTag(tag)}
              onRestore={() => handleRestore(tag)}
              onToggleDetails={() => toggleTagDetails(tag.id)}
              order={getTagOrder(tag, orders)}
              scanHistoryDays={scanHistoryDays}
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
          message="This deactivates the lost physical tag so it no longer shows your contact details. It does not turn on Lost Mode for your pet. Your pet's Safety Profile and other active tags are not affected."
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
          }'s Safety Profile through this physical tag. The pet's own Safety Profile stays active.`}
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
  expanded,
  linkedPet,
  onArchive,
  onDisable,
  onReportLost,
  onRestore,
  onToggleDetails,
  order,
  scanHistoryDays,
  tag,
}: {
  expanded: boolean;
  linkedPet?: PetListItem;
  onArchive: () => void;
  onDisable: () => void;
  onReportLost: () => void;
  onRestore: () => void;
  onToggleDetails: () => void;
  order?: TagOrder;
  scanHistoryDays: number;
  tag: PetTag;
}) {
  const detailsId = useId();
  const toggleId = useId();
  const base = useSyncExternalStore(subscribeNoop, getSiteBaseUrl, getEnvBaseUrl);
  const [copyStatus, setCopyStatus] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const [showScanHistory, setShowScanHistory] = useState(false);
  const productName = tag.hasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag";
  const actions = getTagAvailableActions(tag, order, linkedPet);
  const displayStatus = getTagDisplayStatus(tag, order, linkedPet);
  const scanDisplay = getTagScanDisplay(tag, order, linkedPet);
  const isActive = isActivePhysicalTagForPet(tag, linkedPet);
  const linkedToInactivePet = isTagLinkedToInactivePet(tag, linkedPet);
  const isInactive = isInactivePhysicalTag(tag) || linkedToInactivePet;
  const isPending = isPendingPhysicalTag(tag, order);
  const isArchived = Boolean(tag.isArchived);
  const canViewSafetyProfile = isActive && Boolean(linkedPet?.safetyCode) && linkedPet?.qrSafetyEnabled !== false;
  const orderHref = order ? ownerRoutes.orderDetail(formatOrderNumber(order)) : "";
  const replacementHref = tag.petId
    ? ownerRoutes.petTagOrder(tag.petId, { replacementFor: tag.id })
    : "";
  const scanPath = tagQrPath(tag.tagCode);
  const nfcPath = tagNfcPath(tag.tagCode);
  // Only a matching customer order supplies purchase and delivery dates.
  // Retail purchases and operational replacements must not invent those events.
  const detailItems = [
    order ? ["Order", formatOrderNumber(order)] : null,
    order ? ["Ordered date", order.orderedDate] : null,
    order ? ["Delivered date", tag.deliveredDate ?? "Not delivered yet"] : null,
    tag.activatedAt ? ["Activated date", tag.activatedAt] : null,
  ].filter((item): item is [string, string] => Boolean(item));
  const hasFullScanHistory = scanHistoryDays > 0;
  const hasActivityCounts = tag.qrScansLast30Days !== undefined || (tag.hasNfc && tag.nfcTapsLast30Days !== undefined);
  const activityCounts = tag.hasNfc
    ? `${tag.qrScansLast30Days ?? 0} QR · ${tag.nfcTapsLast30Days ?? 0} NFC`
    : `${tag.qrScansLast30Days ?? 0} QR`;
  const orderPrimaryLabel = actions.includes("pay-by-qr") ? "Pay by QR"
    : actions.includes("view-payment-status") ? "View Payment Status"
    : actions.includes("view-preparation-status") ? "View Preparation Status"
    : actions.includes("view-order") ? "View Order" : "";
  const canDisable = actions.includes("disable-tag") && tag.status === "Active";
  const hasManagementActions = canDisable || actions.some((action) =>
    ["restore-to-list", "request-replacement", "report-tag-lost", "archive-tag"].includes(action)
  ) || (actions.includes("view-order") && orderPrimaryLabel !== "View Order");
  const secondaryButtonClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";
  const destructiveButtonClass = "inline-flex min-h-12 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-sm font-bold text-[#a63c2e] transition hover:bg-[#ffe8e3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-coral";

  async function handleCopy(path: string, label: string) {
    const url = toAbsoluteUrl(path, base);
    const copied = await copyText(url);
    setCopyStatus(copied ? `${label} link copied.` : "Copy unavailable. Select and copy the link below.");
    setCopyFallback(copied ? "" : url);
  }

  return (
    <article aria-label={`${tag.tagCode} · ${linkedPet?.name ?? "Not linked yet"}`} className="brand-card min-w-0 rounded-[1.75rem] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={getStatusTone(tag, order, linkedPet)}>{displayStatus}</Badge>
        {isArchived && displayStatus !== "Archived" ? <Badge tone="soft">Archived</Badge> : null}
      </div>
      <h2 className="mt-3 break-words text-xl font-black leading-tight text-pet-ink">
        {linkedPet?.name ?? "Not linked yet"}
      </h2>
      <p className="mt-1 select-all font-mono text-lg font-extrabold tracking-wide text-pet-ink [overflow-wrap:anywhere]">
        {tag.tagCode}
      </p>
      <p className="mt-1 text-sm leading-5 text-pet-muted">{productName} · {tag.variant}</p>
      <dl className="mt-3 space-y-1 text-xs font-semibold leading-5 text-pet-muted">
        <div>
          <dt className="inline">{scanDisplay.label}: </dt>
          <dd className="inline text-pet-ink">
            {scanDisplay.value}
            {scanDisplay.label.startsWith("Last scanned") && tag.lastScannedAt
              ? tag.lastScanSource === "Qr" ? " · QR" : tag.lastScanSource === "Nfc" ? " · NFC" : ""
              : ""}
          </dd>
        </div>
        {hasActivityCounts ? (
          <div>
            <dt className="inline">30-day scans: </dt>
            <dd className="inline text-pet-ink">{activityCounts}</dd>
          </div>
        ) : null}
      </dl>

      {canViewSafetyProfile && linkedPet ? (
        <CTAButton className="mt-4" href={getQrSafetyPath(linkedPet)} icon="shield" target="_blank" rel="noopener noreferrer" fullWidth>
          View Safety Profile
        </CTAButton>
      ) : isActive && linkedPet?.qrSafetyEnabled === false ? (
        <CTAButton className="mt-4" href={ownerRoutes.petEdit(linkedPet.id, { tab: "contact" })} variant="outline" fullWidth>
          Manage Safety Profile
        </CTAButton>
      ) : orderPrimaryLabel && orderHref ? (
        <CTAButton className="mt-4" href={orderHref} icon="record" fullWidth>{orderPrimaryLabel}</CTAButton>
      ) : null}

      <button
        aria-controls={detailsId}
        aria-expanded={expanded}
        className="mt-2 flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-2 text-left text-sm font-extrabold text-pet-teal transition hover:bg-pet-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        id={toggleId}
        onClick={onToggleDetails}
        type="button"
      >
        Manage Tag &amp; Details
        <Icon name="chevron" className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div aria-labelledby={toggleId} hidden={!expanded} id={detailsId}>
        {expanded ? (
          <div className="mt-3 space-y-5 border-t border-pet-border pt-5">
            <section aria-label="Tag information">
              <h3 className="text-sm font-black text-pet-ink">Tag Information</h3>
              {detailItems.length ? (
                <dl className="mt-3 space-y-2 text-sm">
                  {detailItems.map(([label, value]) => (
                    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1" key={label}>
                      <dt className="text-pet-muted">{label}</dt>
                      <dd className="min-w-0 break-words font-bold text-pet-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {linkedPet ? (
                <a className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-pet-teal underline" href={ownerRoutes.petProfile(linkedPet.id)}>
                  View My Pet
                </a>
              ) : null}
              <p className="mt-2 text-xs font-semibold leading-5 text-pet-muted">
                {isArchived ? "Archived tags do not show owner contact details. Restore this tag to bring it back to your main list."
                  : linkedToInactivePet && isMemorialPet(linkedPet) ? `${linkedPet?.name} is in Memorial Mode. This tag does not show owner contact details.`
                  : linkedToInactivePet && isArchivedPet(linkedPet) ? `${linkedPet?.name}'s profile is archived. This tag does not show owner contact details.`
                  : isInactive ? "This tag no longer shows your contact details. Your pet's Safety Profile is managed separately."
                  : isPending || tag.status === "Unassigned" ? `To activate this tag, scan the QR code on the physical tag.${tag.hasNfc ? " NFC works after activation." : ""}`
                  : linkedPet?.qrSafetyEnabled === false ? "Your pet's Safety Profile is off. You can change this in Contact & Safety."
                  : "This tag is linked to your pet's Safety Profile."}
              </p>
            </section>

            <section aria-label="QR and NFC">
              <h3 className="text-sm font-black text-pet-ink">QR &amp; NFC</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                Opening a physical tag link records a visit in tag activity.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {isActive || isInactive ? (
                  <QrCodeButton
                    className={secondaryButtonClass}
                    fileNameBase={`${tag.tagCode}-physical-tag-qr`}
                    helperText="The QR code printed on this physical tag."
                    label="View QR Code"
                    targetPath={scanPath}
                    title="Physical Tag QR"
                    viewLabel={isActive ? "Open QR Scan Page" : "Open Inactive QR Page"}
                    warning={isActive ? undefined : "This tag is inactive and does not reveal owner contact details."}
                  />
                ) : null}
                {actions.includes("view-tag-scan-page") || actions.includes("view-inactive-tag-page") || actions.includes("view-status") ? (
                  <CTAButton href={scanPath} icon="qr" variant="outline" target="_blank" rel="noopener noreferrer" fullWidth>
                    {actions.includes("view-inactive-tag-page") ? "View Inactive Tag Page" : actions.includes("view-status") ? "View Status" : "View Tag Scan Page"}
                  </CTAButton>
                ) : null}
                {actions.includes("copy-tag-scan-link") ? (
                  <button className={secondaryButtonClass} onClick={() => void handleCopy(scanPath, "QR")} type="button">Copy QR Link</button>
                ) : null}
                {tag.hasNfc ? (
                  <>
                    <CTAButton href={nfcPath} icon="tag" variant="outline" target="_blank" rel="noopener noreferrer" fullWidth>Open NFC Link</CTAButton>
                    <button className={secondaryButtonClass} onClick={() => void handleCopy(nfcPath, "NFC")} type="button">Copy NFC Link</button>
                  </>
                ) : null}
              </div>
              {copyStatus ? <p className="mt-2 text-xs font-bold text-pet-sage" role="status">{copyStatus}</p> : null}
              {copyFallback ? <p className="mt-2 select-all break-all text-xs text-pet-muted">{copyFallback}</p> : null}
            </section>

            <section aria-label="Tag activity">
              <h3 className="text-sm font-black text-pet-ink">Tag activity</h3>
              {hasFullScanHistory ? (
                <button className={`${secondaryButtonClass} mt-3 w-full`} onClick={() => setShowScanHistory(true)} type="button">View Scan History</button>
              ) : (
                <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">Full scan history is part of MyPetLink Premium. Premium is coming soon.</p>
              )}
            </section>

            {hasManagementActions ? <section aria-label="Tag management">
              <h3 className="text-sm font-black text-pet-ink">Tag Management</h3>
              {actions.includes("report-tag-lost") ? (
                <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">Lost the physical tag? Reporting it stops it showing your contact details. This does not turn on Lost Mode for your pet.</p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {actions.includes("view-order") && orderHref && orderPrimaryLabel !== "View Order" ? (
                  <CTAButton href={orderHref} icon="record" variant="outline" fullWidth>View Order</CTAButton>
                ) : null}
                {actions.includes("restore-to-list") ? <button className={secondaryButtonClass} onClick={onRestore} type="button">Restore to List</button> : null}
                {actions.includes("request-replacement") && replacementHref ? <CTAButton href={replacementHref} icon="tag" variant="outline" fullWidth>Request Replacement</CTAButton> : null}
                {actions.includes("report-tag-lost") ? <button className={destructiveButtonClass} onClick={onReportLost} type="button">Report Tag Lost</button> : null}
                {canDisable ? <button className={destructiveButtonClass} onClick={onDisable} type="button">Disable Tag</button> : null}
                {actions.includes("archive-tag") ? <button className={secondaryButtonClass} onClick={onArchive} type="button">Archive Tag</button> : null}
              </div>
            </section> : null}
          </div>
        ) : null}
      </div>
      {hasFullScanHistory ? (
        <TagScanHistoryDialog hasNfc={tag.hasNfc} onRequestClose={() => setShowScanHistory(false)} open={showScanHistory} tagCode={tag.tagCode} tagId={tag.id} />
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
  linkedPet?: PetListItem
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
