"use client";

import { useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/AdminPanels";
import { Badge } from "@/components/ui/Badge";
import { getTagTypeLabel } from "@/components/admin/adminDisplay";
import { formatOrderNumber, getOrderStatusDisplay } from "@/lib/orders";
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
  availableTags: PetTag[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { tagId: string; reason: string; note: string }) => void;
}) {
  const [selectedTagId, setSelectedTagId] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const text = copy[mode];
  const productLabel = getTagTypeLabel(order.tagType.includes("NFC"));

  const filteredTags = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return availableTags;
    }

    return availableTags.filter(
      (tag) =>
        tag.tagCode.toLowerCase().includes(term) ||
        (tag.batchNo ?? "").toLowerCase().includes(term)
    );
  }, [availableTags, search]);

  const reasonRequired = mode === "replace";
  const canSubmit =
    Boolean(selectedTagId) && (!reasonRequired || Boolean(reason)) && !busy;

  function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    onSubmit({ tagId: selectedTagId, reason, note });
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
          <SummaryItem label="Pet" value={petName} />
          <SummaryItem label="Product" value={productLabel} />
          <SummaryItem label="Shape" value={order.shape} />
        </div>

        {/* Current assigned tag */}
        {currentTag ? (
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
                No matching unclaimed {productLabel} · {order.shape} tags are
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
                            {getTagTypeLabel(tag.hasNfc)} · {tag.shape}
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
