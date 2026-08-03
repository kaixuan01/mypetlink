"use client";

import { useState } from "react";
import { AdminActionButton } from "@/components/admin/AdminPanels";
import { Badge } from "@/components/ui/Badge";
import { getTagTypeLabel } from "@/components/admin/adminDisplay";
import { formatOrderNumber, getOrderStatusDisplay } from "@/lib/orders";
import type { AdminOrderFulfilmentItem } from "@/services/adminOrderService";
import type { PetTag, TagOrder } from "@/types";

export type TagAssignmentMode = "assign" | "change" | "replace";

// Replacement reasons for a shipped/delivered/active tag.
const replaceReasons = [
  "Not received",
  "Damaged",
  "Wrong tag sent",
  "QR/NFC issue",
  "Other",
];

const copy: Record<
  TagAssignmentMode,
  { title: string; intro: string; submit: string }
> = {
  assign: {
    title: "Assign inventory tag",
    intro:
      "Choose a matching unclaimed tag to fulfil this order. Stock is used only once you assign it.",
    submit: "Assign selected tag",
  },
  change: {
    title: "Change assigned tag",
    intro:
      "Swap in a different unclaimed tag before the order ships. The current tag returns to available inventory.",
    submit: "Change to selected tag",
  },
  replace: {
    title: "Replace tag",
    intro:
      "Issue a replacement tag. The current tag is retired and a fresh tag re-enters preparation.",
    submit: "Replace with selected tag",
  },
};

export function TagAssignmentModal({
  mode,
  order,
  ownerName,
  petName,
  currentTag,
  fulfilmentItems = [],
  availableTags,
  busy,
  onCancel,
  onSubmit,
}: {
  mode: TagAssignmentMode;
  order: TagOrder;
  ownerName: string;
  petName: string;
  currentTag?: PetTag;
  fulfilmentItems?: AdminOrderFulfilmentItem[];
  availableTags: Array<PetTag & { productVariantId?: string }>;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { tagId: string; reason: string; note: string; orderItemId?: string; currentTagId?: string }) => void;
}) {
  const eligibleItems = fulfilmentItems.filter((item) =>
    mode === "assign" ? item.assignedTags.length < item.quantity : item.assignedTags.length > 0
  );
  const [orderItemId, setOrderItemId] = useState(eligibleItems[0]?.orderItemId ?? "");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const text = copy[mode];
  const selectedItem = eligibleItems.find((item) => item.orderItemId === orderItemId) ?? eligibleItems[0];
  const [currentTagId, setCurrentTagId] = useState(selectedItem?.assignedTags[0]?.id ?? currentTag?.id ?? "");
  const productLabel = selectedItem?.productName ?? getTagTypeLabel(order.tagType.includes("NFC"));

  const term = search.trim().toLowerCase();
  const selectedProductVariantId = selectedItem?.productVariantId;
  const filteredTags = availableTags.filter((tag) => {
    const matchesVariant = !selectedProductVariantId || tag.productVariantId === selectedProductVariantId;
    const matchesSearch = !term || tag.tagCode.toLowerCase().includes(term) || (tag.batchNo ?? "").toLowerCase().includes(term);
    return matchesVariant && matchesSearch;
  });

  const reasonRequired = mode === "replace";
  const canSubmit =
    Boolean(selectedTagId) && Boolean(orderItemId || fulfilmentItems.length === 0) && (mode === "assign" || Boolean(currentTagId)) && (!reasonRequired || Boolean(reason)) && !busy;

  function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    onSubmit({ tagId: selectedTagId, reason, note, orderItemId: orderItemId || undefined, currentTagId: currentTagId || undefined });
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-black text-slate-950">{text.title}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          {text.intro}
        </p>

        {/* Order summary */}
        <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <SummaryItem label="Order" value={formatOrderNumber(order)} />
          <SummaryItem label="Status" value={getOrderStatusDisplay(order.status)} />
          <SummaryItem label="Owner" value={ownerName} />
          <SummaryItem label="Pet" value={selectedItem?.petName ?? petName} />
          <SummaryItem label="Product" value={productLabel} />
          <SummaryItem label="Option" value={selectedItem?.variantName ?? `${order.variant} Tag`} />
        </div>

        {eligibleItems.length > 1 ? (
          <label className="mt-4 block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Order line</span>
            <select className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900" onChange={(event) => { const next = eligibleItems.find((item) => item.orderItemId === event.target.value); setOrderItemId(event.target.value); setCurrentTagId(next?.assignedTags[0]?.id ?? ""); setSelectedTagId(""); }} value={selectedItem?.orderItemId ?? ""}>
              {eligibleItems.map((item) => <option key={item.orderItemId} value={item.orderItemId}>{item.petName} — {item.productName} — {item.variantName} ({item.assignedTags.length}/{item.quantity} assigned)</option>)}
            </select>
          </label>
        ) : null}

        {/* Current assigned tag */}
        {mode !== "assign" && selectedItem?.assignedTags.length ? (
          <label className="mt-3 block rounded-xl border border-slate-200 p-4">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Current tag</span>
            <select className="mt-2 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-bold" onChange={(event) => setCurrentTagId(event.target.value)} value={currentTagId}>{selectedItem.assignedTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.tagCode} — {tag.status}</option>)}</select>
          </label>
        ) : currentTag ? (
          <div className="mt-3 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Current tag
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-950">
                {currentTag.tagCode}
              </span>
              <Badge tone="soft">{currentTag.status}</Badge>
              {currentTag.batchNo ? (
                <span className="text-xs font-semibold text-slate-500">
                  Batch {currentTag.batchNo}
                </span>
              ) : null}
              {currentTag.orderedDate ? (
                <span className="text-xs font-semibold text-slate-500">
                  Created {currentTag.orderedDate}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {mode === "replace" ? (
          <>
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                Reason
              </span>
              <select
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              >
                <option value="">Select a reason</option>
                {replaceReasons.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                Note (optional)
              </span>
              <textarea
                className="mt-1 min-h-16 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything the operations team should know"
                value={note}
              />
            </label>
            <p className="mt-3 rounded-lg bg-[#fdf3df] px-3 py-2 text-xs font-bold leading-5 text-[#9a6b18]">
              The current tag will be disabled and its scan page will no longer
              show owner contact details.
            </p>
          </>
        ) : null}

        {/* Available inventory */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Available matching inventory
            </p>
            <input
              className="min-h-9 w-48 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tag code / batch"
              value={search}
            />
          </div>

          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
            {filteredTags.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500">
                No matching unclaimed {productLabel} · {order.variant} tags are
                available. Generate matching inventory first.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredTags.map((tag) => {
                  const selected = tag.id === selectedTagId;

                  return (
                    <li key={tag.id}>
                      <button
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                          selected ? "bg-[#eaf2ff]" : "hover:bg-slate-50"
                        }`}
                        onClick={() => setSelectedTagId(tag.id)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="font-mono text-sm font-bold text-slate-950">
                            {tag.tagCode}
                          </span>
                          <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                            {getTagTypeLabel(tag.hasNfc)} · {tag.variant}
                            {tag.batchNo ? ` · Batch ${tag.batchNo}` : ""}
                            {tag.orderedDate ? ` · ${tag.orderedDate}` : ""}
                          </span>
                        </span>
                        {selected ? <Badge tone="mint">Selected</Badge> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <AdminActionButton onClick={onCancel}>Cancel</AdminActionButton>
          <AdminActionButton
            disabled={!canSubmit}
            onClick={handleSubmit}
            tone={mode === "replace" ? "danger" : "primary"}
          >
            {busy ? "Working..." : text.submit}
          </AdminActionButton>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
