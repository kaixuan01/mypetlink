"use client";

import { useEffect, useState } from "react";
import { AdminDetailItem } from "@/components/admin/AdminPanels";
import { getTagTypeLabel, tagStatusTone } from "@/components/admin/adminDisplay";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { Badge } from "@/components/ui/Badge";
import { getTagScanPath } from "@/lib/routes";
import {
  fulfilmentLabels,
  lifecycleLabel,
  type AdminInventoryTag,
} from "@/services/adminTagInventoryService";
import { getAdminTagHistory, type AdminTagHistoryEntry } from "@/services/adminTagHistoryService";

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

const historyActionLabels: Record<string, string> = {
  "tag-inventory.generate": "Generated",
  "tag-inventory.mark-printed": "Marked Printed",
  "tag-inventory.send-to-reseller": "Sent to Reseller",
  "tag-inventory.mark-received": "Marked Received",
  "tag-inventory.send-to-owner": "Sent to Owner",
  "tag.assign-to-order": "Assigned to order",
  "tag.unassign-from-order": "Returned to stock",
  "tag.replace": "Replaced",
  "tag.disable": "Disabled",
  "tag.mark-lost": "Marked Lost",
  "tag.archive": "Archived",
  "tag.restore": "Restored",
};

// Slide-over panel with the full record for one inventory tag: identity,
// lifecycle + fulfilment trail, links, and the admin change history.
export function AdminTagInventoryDetailDrawer({
  tag,
  onClose,
}: {
  tag: AdminInventoryTag;
  onClose: () => void;
}) {
  const [historyResult, setHistoryResult] = useState<{
    tagId: string;
    entries: AdminTagHistoryEntry[] | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getAdminTagHistory(tag.id, controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) {
          setHistoryResult({ tagId: tag.id, entries });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoryResult({ tagId: tag.id, entries: null });
        }
      });

    return () => controller.abort();
  }, [tag.id]);

  const historyState: "loading" | "ready" | "unavailable" =
    historyResult?.tagId !== tag.id
      ? "loading"
      : historyResult.entries === null
        ? "unavailable"
        : "ready";
  const history = historyResult?.tagId === tag.id ? historyResult.entries : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const fulfilmentTrail = [
    { label: "Generated", at: tag.generatedAt },
    { label: "Printed", at: tag.printedAt },
    { label: "Sent to Reseller", at: tag.sentToResellerAt },
    { label: "Received", at: tag.receivedAt },
    { label: "Sent to Owner", at: tag.sentToOwnerAt },
  ].filter((step) => step.at);

  return (
    <div
      aria-label={`Tag details for ${tag.tagCode}`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-pet-ink/35 backdrop-blur-sm"
      role="dialog"
    >
      <button
        aria-label="Close tag details"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-extrabold uppercase text-slate-400">Tag code</p>
            <h2 className="font-mono text-xl font-black text-slate-950">{tag.tagCode}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>
                {lifecycleLabel(tag.status, tag.isArchived)}
              </Badge>
              <Badge tone="teal">{fulfilmentLabels[tag.fulfilment]}</Badge>
            </div>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <section className="grid grid-cols-2 gap-2">
            <AdminDetailItem label="Tag type" value={getTagTypeLabel(tag.hasNfc)} />
            <AdminDetailItem label="Variant" value={`${tag.variant} Tag`} />
            <AdminDetailItem label="Batch" value={tag.batchNo ?? ""} />
            <AdminDetailItem label="Reseller" value={tag.resellerName ?? ""} />
            <AdminDetailItem
              label="Linked pet"
              value={tag.petName ?? (tag.petId ? "Profile removed" : "Unclaimed")}
            />
            <AdminDetailItem label="Linked owner" value={tag.ownerName ?? ""} />
            <AdminDetailItem label="Order" value={tag.orderNumber ?? ""} />
            <AdminDetailItem label="Generated" value={formatDate(tag.generatedAt)} />
            <AdminDetailItem label="Last updated" value={formatDate(tag.updatedAt)} />
            <AdminDetailItem label="Activated" value={formatDate(tag.activatedAt)} />
            <AdminDetailItem label="Delivered" value={formatDate(tag.deliveredAt)} />
            <AdminDetailItem label="Last scanned" value={formatDate(tag.lastScannedAt)} />
          </section>

          <section>
            <h3 className="text-sm font-black text-slate-900">Fulfilment steps</h3>
            {fulfilmentTrail.length === 0 ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                No fulfilment steps recorded yet.
              </p>
            ) : (
              <ol className="mt-2 grid gap-1.5">
                {fulfilmentTrail.map((step) => (
                  <li
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    key={step.label}
                  >
                    <span className="font-bold text-slate-900">{step.label}</span>
                    <span className="font-semibold text-slate-500">
                      {formatDate(step.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-wrap gap-1.5">
            <a
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
              href={getTagScanPath({ tagCode: tag.tagCode })}
              rel="noopener noreferrer"
              target="_blank"
            >
              View Tag Scan Page
            </a>
            <QrCodeButton
              fileNameBase={`${tag.tagCode}-physical-tag-qr`}
              helperText="This QR is printed on the physical tag. If the tag is not active yet, scanning it shows an activation page. Downloading this QR does not use up inventory."
              label="Physical Tag QR"
              targetPath={getTagScanPath({ tagCode: tag.tagCode })}
              title={`Physical Tag QR · ${tag.tagCode}`}
              viewLabel="View Tag Scan Page"
            />
          </section>

          <section>
            <h3 className="text-sm font-black text-slate-900">Change history</h3>
            {historyState === "loading" ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Loading history…
              </p>
            ) : historyState === "unavailable" ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Change history is not available right now.
              </p>
            ) : history && history.length > 0 ? (
              <ol className="mt-2 grid gap-1.5">
                {history.map((entry) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    key={entry.id}
                  >
                    <span className="font-bold text-slate-900">
                      {historyActionLabels[entry.action] ?? entry.action}
                    </span>
                    <span className="shrink-0 font-semibold text-slate-500">
                      {formatDate(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                No changes recorded for this tag yet.
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
