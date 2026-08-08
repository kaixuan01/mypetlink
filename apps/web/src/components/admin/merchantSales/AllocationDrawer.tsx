"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AdminDataTable,
  type AdminColumn,
} from "@/components/admin/table/AdminDataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAbortError } from "@/services/apiClient";
import {
  allocateTags,
  autoAllocateTags,
  getMerchantFulfilmentError,
  isStaleInventory,
  listAllocatedTags,
  listEligibleInventory,
  releaseAllocations,
  type MerchantAllocatedTag,
  type MerchantAllocationSummary,
  type MerchantEligibleInventoryItem,
  type MerchantItemAllocationProgress,
} from "@/services/adminMerchantFulfilmentService";
import type { AdminMerchantOrder } from "@/services/adminMerchantSalesService";
import {
  InlineError,
  StatusMessage,
  batchSummaryText,
  dateTime,
  fieldClass,
  primaryButton,
  secondaryButton,
  shortDate,
} from "./shared";

const PAGE_SIZE = 20;

type Section = "manual" | "auto" | "active";

/**
 * One merchant order line's inventory workspace. The line is chosen before the
 * drawer opens and never changes inside it, so an admin cannot fill the wrong
 * SKU by losing track of which item they are on.
 *
 * Selection is held here as a Set of tag ids. AdminDataTable never clears it on
 * a page change, so a selection genuinely spans pages; anything that stops
 * being eligible is dropped on the next refresh rather than silently allocated.
 */
export function AllocationDrawer({
  order,
  item,
  onClose,
  onAllocationChanged,
}: {
  order: AdminMerchantOrder;
  item: MerchantItemAllocationProgress;
  onClose: () => void;
  onAllocationChanged: (summary: MerchantAllocationSummary) => void;
}) {
  const titleId = useId();
  const quantityId = useId();
  const reasonId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>("manual");

  // --- Eligible inventory --------------------------------------------------
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [page, setPage] = useState(1);
  const [eligible, setEligible] = useState<{
    key: string;
    items: MerchantEligibleInventoryItem[];
    total: number;
    error: string;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // --- Active allocations --------------------------------------------------
  const [active, setActive] = useState<{
    key: string;
    items: MerchantAllocatedTag[];
    error: string;
  } | null>(null);
  const [selectedAllocations, setSelectedAllocations] = useState<Set<string>>(new Set());
  const [releaseReason, setReleaseReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  // --- Auto allocation -----------------------------------------------------
  const [typedQuantity, setTypedQuantity] = useState<string | null>(null);
  const [autoError, setAutoError] = useState("");

  // --- Shared --------------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"manual" | "auto" | "release" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const remaining = item.remainingUnits;
  const defaultAuto = Math.max(0, Math.min(remaining, item.eligibleAvailableUnits));

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  // The quantity box shows what the line still needs until the admin types
  // their own figure, so it never fights the value they entered.
  const autoQuantity = typedQuantity ?? (defaultAuto > 0 ? String(defaultAuto) : "");
  const setAutoQuantity = setTypedQuantity;

  const eligibleKey = `${page}|${search}|${batchFilter}|${reloadKey}`;
  const activeKey = `${item.merchantOrderItemId}|${reloadKey}`;
  const eligibleRows = eligible?.key === eligibleKey ? eligible.items : [];
  const eligibleTotal = eligible?.key === eligibleKey ? eligible.total : 0;
  const eligibleError = eligible?.key === eligibleKey ? eligible.error : "";
  const eligibleLoading = eligible?.key !== eligibleKey;
  const activeRows = active?.key === activeKey ? active.items : [];
  const activeError = active?.key === activeKey ? active.error : "";
  const activeLoading = active?.key !== activeKey;

  // --- Loading -------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    const key = `${page}|${search}|${batchFilter}|${reloadKey}`;

    listEligibleInventory(
      order.id,
      { merchantOrderItemId: item.merchantOrderItemId, page, pageSize: PAGE_SIZE,
        search: search || undefined, batchId: batchFilter || undefined },
      controller.signal
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setEligible({ key, items: result.items, total: result.total, error: "" });
        // Anything that stopped being eligible must leave the selection rather
        // than travel into a request that would be refused.
        setSelected((current) => {
          if (current.size === 0) return current;
          const stillListed = new Set(result.items.map((row) => row.smartTagId));
          const next = new Set<string>();
          for (const id of current) {
            // Ids not on this page may simply be on another page; only drop
            // what this page proves is gone.
            if (stillListed.has(id) || !result.items.some((row) => row.smartTagId === id)) {
              next.add(id);
            }
          }
          return next;
        });
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setEligible({
          key, items: [], total: 0,
          error: getMerchantFulfilmentError(caught, "We couldn’t load eligible inventory."),
        });
      });

    return () => controller.abort();
  }, [batchFilter, item.merchantOrderItemId, order.id, page, reloadKey, search]);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${item.merchantOrderItemId}|${reloadKey}`;

    listAllocatedTags(order.id, false, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        const mine = rows.filter((row) => row.merchantOrderItemId === item.merchantOrderItemId);
        setActive({ key, items: mine, error: "" });
        setSelectedAllocations((current) => {
          if (current.size === 0) return current;
          const live = new Set(mine.map((row) => row.id));
          return new Set([...current].filter((id) => live.has(id)));
        });
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setActive({
          key, items: [],
          error: getMerchantFulfilmentError(caught, "We couldn’t load allocated tags."),
        });
      });

    return () => controller.abort();
  }, [item.merchantOrderItemId, order.id, reloadKey]);

  // --- Focus ---------------------------------------------------------------
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, [href], input, select, textarea")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Focus goes back to the control that opened the drawer.
      opener?.focus?.();
    };
  }, [onClose]);

  // --- Mutations -----------------------------------------------------------
  function handleFailure(caught: unknown, fallback: string) {
    setError(getMerchantFulfilmentError(caught, fallback));
    if (isStaleInventory(caught)) {
      // The page's view of stock is out of date: drop invalid selections and
      // reload everything rather than retrying behind the admin's back.
      setSelected(new Set());
      setSelectedAllocations(new Set());
      reload();
    }
  }

  async function runManual() {
    setBusy(true);
    setError("");
    try {
      const summary = await allocateTags(order.id, {
        merchantOrderItemId: item.merchantOrderItemId,
        smartTagIds: [...selected],
        concurrencyToken: null,
      });
      const line = summary.items.find(
        (row) => row.merchantOrderItemId === item.merchantOrderItemId
      );
      setMessage(
        `${selected.size} tag(s) allocated. ${line?.remainingUnits ?? 0} remaining on this line.`
      );
      setSelected(new Set());
      onAllocationChanged(summary);
      reload();
    } catch (caught) {
      handleFailure(caught, "We couldn’t allocate those tags.");
    } finally {
      setBusy(false);
    }
  }

  async function runAuto() {
    const quantity = Number(autoQuantity);
    setBusy(true);
    setError("");
    try {
      const summary = await autoAllocateTags(order.id, {
        merchantOrderItemId: item.merchantOrderItemId,
        quantity,
        concurrencyToken: null,
      });
      const line = summary.items.find(
        (row) => row.merchantOrderItemId === item.merchantOrderItemId
      );
      setMessage(
        `${quantity} tag(s) allocated from ${batchSummaryText(line?.batches ?? [])}. `
        + `${line?.remainingUnits ?? 0} remaining on this line.`
      );
      onAllocationChanged(summary);
      reload();
    } catch (caught) {
      handleFailure(caught, "We couldn’t allocate those tags.");
    } finally {
      setBusy(false);
    }
  }

  async function runRelease() {
    setBusy(true);
    setError("");
    try {
      const summary = await releaseAllocations(order.id, {
        allocationIds: [...selectedAllocations],
        reason: releaseReason.trim(),
        concurrencyToken: null,
      });
      setMessage(`${selectedAllocations.size} tag(s) released back to available inventory.`);
      setSelectedAllocations(new Set());
      setReleaseReason("");
      onAllocationChanged(summary);
      reload();
    } catch (caught) {
      handleFailure(caught, "We couldn’t release those tags.");
    } finally {
      setBusy(false);
    }
  }

  // --- Validation ----------------------------------------------------------
  function validateAuto(): boolean {
    const raw = autoQuantity.trim();
    const quantity = Number(raw);

    if (raw === "" || !Number.isFinite(quantity)) {
      setAutoError("Enter how many tags to allocate.");
      return false;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setAutoError("Enter a whole number of at least 1.");
      return false;
    }
    if (quantity > remaining) {
      setAutoError(`Only ${remaining} more tag(s) are needed on this line.`);
      return false;
    }

    setAutoError("");
    return true;
  }

  const selectedOnThisPage = eligibleRows.filter((row) => selected.has(row.smartTagId)).length;
  const selectedElsewhere = selected.size - selectedOnThisPage;
  const overSelected = selected.size > remaining;

  const eligibleColumns: AdminColumn<MerchantEligibleInventoryItem>[] = [
    {
      id: "tagCode",
      header: "Tag code",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
          {row.tagCode}
        </span>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      cell: (row) => (
        <span className="break-words text-xs font-semibold text-slate-700">
          {row.batchNo ?? "Unbatched"}
        </span>
      ),
    },
    {
      id: "readiness",
      header: "Production",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-600">
          {row.fulfilmentStatus === "Printed" ? "Printed" : "Generated"}
        </span>
      ),
    },
    {
      id: "printed",
      header: "Printed",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {row.printedAt ? shortDate(row.printedAt) : "—"}
        </span>
      ),
    },
  ];

  const activeColumns: AdminColumn<MerchantAllocatedTag>[] = [
    {
      id: "tagCode",
      header: "Tag code",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
          {row.tagCode}
        </span>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      cell: (row) => (
        <span className="break-words text-xs font-semibold text-slate-700">
          {row.batchNo ?? "Unbatched"}
        </span>
      ),
    },
    {
      id: "allocatedAt",
      header: "Allocated",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-600">{dateTime(row.allocatedAt)}</span>
      ),
    },
    {
      id: "method",
      header: "Method",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs font-bold text-slate-600">
          {row.wasAutomatic ? "Automatic" : "Manual"}
        </span>
      ),
    },
  ];

  const tab = (id: Section, label: string) => (
    <button
      aria-selected={section === id}
      className={`min-h-10 rounded-xl px-4 text-sm font-extrabold transition ${
        section === id
          ? "bg-pet-ink text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
      onClick={() => setSection(id)}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      data-testid="allocation-drawer"
      role="dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        ref={panelRef}
      >
        {/* The SKU context stays pinned so it cannot scroll out of sight. */}
        <div className="border-b border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-lg font-black text-pet-ink" id={titleId}>
                Allocate tags — {item.productName}
              </h2>
              <p className="mt-0.5 break-words text-sm font-bold text-slate-600">
                SKU {item.skuCode} · {item.optionName}
              </p>
              <p className="mt-0.5 break-words text-xs text-slate-500">
                {order.merchantOrderNumber} · {order.merchantLegalName}
              </p>
            </div>
            <button className={secondaryButton} onClick={onClose} type="button">
              Close
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Ordered" value={item.requiredUnits} />
            <Figure label="Allocated" value={item.allocatedUnits} />
            <Figure label="Remaining" value={item.remainingUnits} />
            <Figure label="Eligible stock" value={item.eligibleAvailableUnits} />
          </dl>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4">
            {message ? <StatusMessage message={message} /> : null}
            <InlineError message={error} />

            <div aria-label="Allocation sections" className="flex flex-wrap gap-2" role="tablist">
              {tab("manual", "Manual selection")}
              {tab("auto", "Auto allocate")}
              {tab("active", `Active allocations (${activeRows.length})`)}
            </div>

            {section === "manual" ? (
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
                    Tag code
                    <input
                      className={fieldClass}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Search tag code"
                      type="search"
                      value={search}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
                    Batch
                    <select
                      className={fieldClass}
                      onChange={(event) => {
                        setBatchFilter(event.target.value);
                        setPage(1);
                      }}
                      value={batchFilter}
                    >
                      <option value="">All batches</option>
                      {item.batches
                        .filter((batch) => batch.batchId)
                        .map((batch) => (
                          <option key={batch.batchId} value={batch.batchId ?? ""}>
                            {batch.batchNo}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <p
                  aria-live="polite"
                  className="text-sm font-bold text-slate-700"
                  data-testid="selection-summary"
                >
                  {selected.size} selected · {remaining} still required
                  {selectedElsewhere > 0 ? ` · ${selectedElsewhere} on other pages` : ""}
                </p>
                {overSelected ? (
                  <p className="text-sm font-bold text-[#a63c2e]">
                    Deselect {selected.size - remaining} tag(s): this line needs only {remaining}{" "}
                    more.
                  </p>
                ) : null}

                <AdminDataTable
                  columns={eligibleColumns}
                  emptyDescription="Try a different tag code or batch, or produce more stock for this SKU."
                  emptyTitle="No eligible tags match this SKU and filter."
                  error={eligibleError}
                  loading={eligibleLoading}
                  onPageChange={setPage}
                  onRetry={reload}
                  onSelectedIdsChange={setSelected}
                  page={page}
                  pageSize={PAGE_SIZE}
                  rowKey={(row) => row.smartTagId}
                  rows={eligibleRows}
                  selectable
                  selectedIds={selected}
                  total={eligibleTotal}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className={primaryButton}
                    data-testid="allocate-selected"
                    disabled={busy || selected.size === 0 || overSelected}
                    onClick={() => setPending("manual")}
                    type="button"
                  >
                    Allocate selected tags
                  </button>
                </div>
              </div>
            ) : null}

            {section === "auto" ? (
              <div className="grid gap-3" data-testid="auto-allocate-form">
                <p className="text-sm text-slate-600">
                  Tags are selected from the oldest printed batches first.
                </p>
                <label
                  className="grid gap-1 text-sm font-bold text-pet-ink sm:max-w-56"
                  htmlFor={quantityId}
                >
                  Quantity to allocate
                </label>
                <input
                  aria-describedby={autoError ? `${quantityId}-error` : undefined}
                  aria-invalid={autoError ? true : undefined}
                  className={`${fieldClass} sm:max-w-56`}
                  data-testid="auto-quantity"
                  id={quantityId}
                  min={1}
                  onChange={(event) => setAutoQuantity(event.target.value)}
                  step={1}
                  type="number"
                  value={autoQuantity}
                />
                {autoError ? (
                  <p className="text-sm font-bold text-[#a63c2e]" id={`${quantityId}-error`}>
                    {autoError}
                  </p>
                ) : null}
                {Number(autoQuantity) > item.eligibleAvailableUnits ? (
                  <p className="text-sm font-semibold text-[#8a5a12]">
                    Only {item.eligibleAvailableUnits} eligible tag(s) are in stock right now.
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className={primaryButton}
                    data-testid="auto-allocate"
                    disabled={busy || remaining === 0}
                    onClick={() => {
                      if (validateAuto()) setPending("auto");
                    }}
                    type="button"
                  >
                    Auto allocate
                  </button>
                </div>
              </div>
            ) : null}

            {section === "active" ? (
              <div className="grid gap-3" data-testid="active-allocations">
                <AdminDataTable
                  columns={activeColumns}
                  emptyTitle="No tags are allocated to this line yet."
                  error={activeError}
                  loading={activeLoading}
                  onPageChange={() => {}}
                  onRetry={reload}
                  onSelectedIdsChange={setSelectedAllocations}
                  page={1}
                  pageSize={Math.max(activeRows.length, 1)}
                  rowKey={(row) => row.id}
                  rows={activeRows}
                  selectable
                  selectedIds={selectedAllocations}
                  total={activeRows.length}
                />

                <label
                  className="grid gap-1 text-sm font-bold text-pet-ink"
                  htmlFor={reasonId}
                >
                  Internal release reason — Admin only, never shown to the merchant
                </label>
                <textarea
                  aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                  aria-invalid={reasonError ? true : undefined}
                  className={`${fieldClass} min-h-20 py-3`}
                  data-testid="release-reason"
                  id={reasonId}
                  maxLength={500}
                  onChange={(event) => setReleaseReason(event.target.value)}
                  value={releaseReason}
                />
                {reasonError ? (
                  <p className="text-sm font-bold text-[#a63c2e]" id={`${reasonId}-error`}>
                    {reasonError}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className={secondaryButton}
                    data-testid="release-selected"
                    disabled={busy || selectedAllocations.size === 0}
                    onClick={() => {
                      if (!releaseReason.trim()) {
                        setReasonError("Give the reason these tags are being released.");
                        return;
                      }
                      setReasonError("");
                      setPending("release");
                    }}
                    type="button"
                  >
                    Release selected tags
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        confirmDisabled={busy}
        confirmLabel={
          pending === "release"
            ? "Release tags"
            : pending === "auto"
              ? "Allocate"
              : "Allocate tags"
        }
        message={confirmMessage()}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target === "manual") void runManual();
          if (target === "auto") void runAuto();
          if (target === "release") void runRelease();
        }}
        open={pending !== null}
        title={
          pending === "release"
            ? `Release ${selectedAllocations.size} allocated tag(s)?`
            : pending === "auto"
              ? `Allocate ${autoQuantity} tag(s) automatically?`
              : `Allocate ${selected.size} tag(s)?`
        }
      />
    </div>
  );

  function confirmMessage(): string {
    if (pending === "release") {
      return (
        "The tags will return to available inventory. "
        + "The order's allocation progress will be reduced."
      );
    }

    const quantity = pending === "auto" ? Number(autoQuantity) || 0 : selected.size;
    const after = Math.max(0, remaining - quantity);
    const batches =
      pending === "manual" && selectedOnThisPage > 0
        ? ` Selected batches: ${batchSummaryText(
            summariseBatches(eligibleRows.filter((row) => selected.has(row.smartTagId)))
          )}.`
        : "";

    return (
      `${order.merchantOrderNumber} · ${order.merchantLegalName} · SKU ${item.skuCode}. `
      + `Remaining before: ${remaining}. Remaining after: ${after}.${batches}`
    );
  }
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-black text-slate-950">{value}</dd>
    </div>
  );
}

/** Groups the chosen rows so a confirmation can name the batches involved. */
function summariseBatches(
  rows: readonly MerchantEligibleInventoryItem[]
): { batchNo: string; quantity: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.batchNo ?? "Unbatched";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([batchNo, quantity]) => ({ batchNo, quantity }));
}
