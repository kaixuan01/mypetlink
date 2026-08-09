"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { isAbortError } from "@/services/apiClient";
import {
  getAllocationSummary,
  getMerchantFulfilmentError,
  type MerchantAllocationSummary,
  type MerchantItemAllocationProgress,
} from "@/services/adminMerchantFulfilmentService";
import {
  getMerchantOrderTimeline,
  type AdminMerchantOrder,
  type AdminMerchantOrderTimelineEntry,
} from "@/services/adminMerchantSalesService";
import { AllocationDrawer } from "./AllocationDrawer";
import { OrderFulfilmentSection } from "./OrderFulfilmentSection";
import {
  AllocationProgress,
  FulfilmentStatusBadge,
  InlineError,
  batchSummaryText,
  dateTime,
  primaryButton,
  secondaryButton,
} from "./shared";

/**
 * The inventory half of a merchant order: how much of what was sold is
 * physically held, and the controls to hold more of it. Everything shown here
 * comes from the server — nothing is predicted locally, so a refused allocation
 * can never leave the page claiming success.
 */
export function OrderInventorySection({ order }: { order: AdminMerchantOrder }) {
  const [summary, setSummary] = useState<MerchantAllocationSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [timeline, setTimeline] = useState<AdminMerchantOrderTimelineEntry[]>([]);
  const [error, setError] = useState("");
  const [timelineError, setTimelineError] = useState("");
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    getAllocationSummary(order.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result);
        setError("");
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setSummary(null);
        setError(getMerchantFulfilmentError(caught, "We couldn’t load inventory allocation."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });

    return () => controller.abort();
  }, [order.id, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();

    getMerchantOrderTimeline(order.id, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        setTimeline(entries);
        setTimelineError("");
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setTimeline([]);
        setTimelineError(
          getMerchantFulfilmentError(caught, "We couldn’t load the allocation history.")
        );
      });

    return () => controller.abort();
  }, [order.id, reloadKey]);

  if (!loaded && !summary) {
    return (
      <AdminSection title="Inventory allocation">
        <p className="p-5 text-sm font-semibold text-slate-500" role="status">
          Loading inventory allocation…
        </p>
      </AdminSection>
    );
  }

  if (!summary) {
    return (
      <AdminSection title="Inventory allocation">
        <div className="grid gap-3 p-5">
          <InlineError message={error} />
          <div>
            <button className={secondaryButton} onClick={reload} type="button">
              Try again
            </button>
          </div>
        </div>
      </AdminSection>
    );
  }

  const openItem = summary.items.find((item) => item.merchantOrderItemId === openItemId) ?? null;
  const shipped = summary.fulfilmentStatus === "Shipped"
    || summary.fulfilmentStatus === "Delivered";

  return (
    <>
      <AdminSection
        description="Each unit sold is held as one physical tag until the order ships."
        title="Inventory allocation"
      >
        <div className="grid gap-4 p-5">
          <InlineError message={error} />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-48 flex-1">
              <AllocationProgress
                allocated={summary.allocatedUnits}
                required={summary.requiredUnits}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-[0.68rem] font-extrabold uppercase text-slate-400">
                Fulfilment
              </span>
              <FulfilmentStatusBadge status={summary.fulfilmentStatus} />
            </div>
          </div>

          <p className="text-sm font-bold text-slate-700" data-testid="allocation-state-message">
            {stateMessage(summary)}
          </p>

          {summary.fulfilmentStatus === "ReadyToShip" ? (
            <p
              className="rounded-xl border border-[#ffe2b8] bg-[#fff8ec] p-4 text-sm text-[#8a5a12]"
              data-testid="ready-release-warning"
            >
              This order is already Ready to Ship. Releasing inventory will return the order to
              Preparing and the shipping step will no longer be available until all required tags
              are allocated again.
            </p>
          ) : null}

          <div className="grid gap-3">
            {summary.items.map((item) => (
              <ItemCard
                blockedReason={summary.allocationBlockedReason}
                item={item}
                key={item.merchantOrderItemId}
                onAllocate={() => setOpenItemId(item.merchantOrderItemId)}
                shipped={shipped}
              />
            ))}
          </div>
        </div>
      </AdminSection>

      <OrderFulfilmentSection
        onFulfilmentChanged={reload}
        order={order}
        summary={summary}
      />

      <AdminSection description="What happened to this order's inventory." title="Allocation history">
        <div className="grid gap-3 p-5">
          {timelineError ? (
            <>
              <InlineError message={timelineError} />
              <div>
                <button className={secondaryButton} onClick={reload} type="button">
                  Try again
                </button>
              </div>
            </>
          ) : timeline.length === 0 ? (
            <p className="text-sm font-semibold text-slate-500">
              Nothing has happened to this order&apos;s inventory yet.
            </p>
          ) : (
            <ol className="grid gap-2" data-testid="allocation-timeline">
              {timeline.map((entry, index) => (
                <li
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
                  key={`${entry.action}-${entry.occurredAt}-${index}`}
                >
                  <span className="break-words text-sm font-bold text-slate-800">
                    {entry.summary}
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {dateTime(entry.occurredAt)}
                    {entry.actorName ? ` · ${entry.actorName}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </AdminSection>

      {openItem ? (
        <AllocationDrawer
          item={openItem}
          onAllocationChanged={(next) => {
            // The server is the only source of progress and fulfilment state,
            // so the page adopts what it just returned rather than guessing.
            setSummary(next);
            reload();
          }}
          onClose={() => setOpenItemId(null)}
          order={order}
        />
      ) : null}
    </>
  );
}

function ItemCard({
  item,
  blockedReason,
  shipped,
  onAllocate,
}: {
  item: MerchantItemAllocationProgress;
  blockedReason: string | null;
  shipped: boolean;
  onAllocate: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4" data-testid="inventory-item-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-black text-slate-900">{item.productName}</p>
          <p className="mt-0.5 break-words text-sm font-bold text-slate-600">
            SKU {item.skuCode} · {item.optionName}
          </p>
        </div>
        {blockedReason ? null : item.isFullyAllocated ? (
          <span className="text-sm font-bold text-[#0f8a5f]">This item is fully allocated.</span>
        ) : (
          <button
            className={primaryButton}
            data-testid={`allocate-${item.skuCode}`}
            onClick={onAllocate}
            type="button"
          >
            Allocate tags
          </button>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 sm:max-w-sm">
        <Figure label="Ordered" value={item.requiredUnits} />
        <Figure label="Allocated" value={item.allocatedUnits} />
        <Figure label="Remaining" value={item.remainingUnits} />
      </dl>

      <div className="mt-3">
        <AllocationProgress
          allocated={item.allocatedUnits}
          label={`${item.skuCode} allocation`}
          required={item.requiredUnits}
        />
      </div>

      <div className="mt-3">
        <p className="text-[0.68rem] font-extrabold uppercase text-slate-400">Allocated batches</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-slate-700">
          {batchSummaryText(item.batches)}
        </p>
      </div>

      {shipped ? (
        <p className="mt-3 text-sm font-semibold text-slate-500">
          Inventory allocation is locked after shipment.
        </p>
      ) : blockedReason ? (
        <p className="mt-3 text-sm font-semibold text-slate-500">{blockedReason}</p>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-base font-black text-slate-950">{value}</dd>
    </div>
  );
}

/** The one sentence that says where this order's inventory stands. */
function stateMessage(summary: MerchantAllocationSummary): string {
  if (summary.paymentStatus === "Cancelled") {
    return "This merchant order is cancelled and cannot receive inventory.";
  }

  if (summary.paymentStatus !== "PaymentConfirmed") {
    return "Inventory allocation is available after full payment is confirmed.";
  }

  if (summary.fulfilmentStatus === "Shipped" || summary.fulfilmentStatus === "Delivered") {
    return "Inventory allocation is locked after shipment.";
  }

  if (summary.isFullyAllocated) {
    // Deliberately not "ready to ship": holding every unit and deciding to
    // ship are separate decisions.
    return "All required tags are allocated. This order is ready for the fulfilment step.";
  }

  if (summary.allocatedUnits === 0) {
    return "Payment confirmed. Inventory has not been allocated yet.";
  }

  return `${summary.allocatedUnits} of ${summary.requiredUnits} tags allocated. `
    + `${summary.remainingUnits} remaining.`;
}
