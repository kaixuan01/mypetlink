"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatAdminDateTime, getTagTypeLabel, tagStatusTone } from "@/components/admin/adminDisplay";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes, qrSafetyPath, tagPath } from "@/lib/routes";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import { getAdminTagHistory, type AdminTagHistoryEntry } from "@/services/adminTagHistoryService";
import { canRunSmartTagAction, smartTagLifecycleLabel, type AdminSmartTag, type AdminSmartTagAction } from "@/services/adminSmartTagService";

type DrawerProps = {
  busy: boolean;
  onClose: () => void;
  onAction: (action: AdminSmartTagAction) => void;
};

export function AdminSmartTagDetailDrawer({
  tag,
  ...props
}: DrawerProps & { tag: AdminSmartTag | null }) {
  // The shared dialog-focus hook must only run while the drawer is open, so
  // the open drawer is its own component that mounts with a tag.
  if (!tag) return null;
  return <OpenSmartTagDrawer {...props} tag={tag} />;
}

function OpenSmartTagDrawer({
  tag,
  busy,
  onClose,
  onAction,
}: DrawerProps & { tag: AdminSmartTag }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [historyResult, setHistoryResult] = useState<{ tagId: string; entries: AdminTagHistoryEntry[] | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getAdminTagHistory(tag.id, controller.signal)
      .then((entries) => { if (!controller.signal.aborted) setHistoryResult({ tagId: tag.id, entries }); })
      .catch(() => { if (!controller.signal.aborted) setHistoryResult({ tagId: tag.id, entries: null }); });
    return () => controller.abort();
  }, [tag.id]);

  useModalDialogFocus({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

  const history = historyResult?.tagId === tag.id ? historyResult.entries : undefined;

  const availableActions: { id: AdminSmartTagAction; label: string; danger?: boolean }[] = [
    { id: "mark-lost", label: "Mark Tag as Lost", danger: true },
    { id: "disable", label: "Disable Tag", danger: true },
    { id: "archive", label: "Archive Tag" },
  ];
  const actions: { id: AdminSmartTagAction; label: string; danger?: boolean }[] = tag.isArchived
    ? [{ id: "restore", label: "Restore Tag" }]
    : availableActions.filter((action) => canRunSmartTagAction(tag, action.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <button aria-label="Close tag details" className="absolute inset-0 bg-slate-950/35" onClick={onClose} type="button" />
      <aside aria-label={`Tag details for ${tag.tagCode}`} aria-modal="true" className="relative z-[1] flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl" ref={dialogRef} role="dialog">
        <header className="sticky top-0 z-[1] flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Smart Tag</p>
            <h2 className="font-mono text-lg font-black text-slate-950">{tag.tagCode}</h2>
          </div>
          <button ref={closeRef} className="min-h-11 rounded-full border border-slate-200 px-4 text-sm font-extrabold text-slate-700" onClick={onClose} type="button">Close</button>
        </header>

        <div className="grid gap-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>{smartTagLifecycleLabel(tag)}</Badge>
            <Badge tone="soft">{getTagTypeLabel(tag.hasNfc)}</Badge>
            <Badge tone="soft">{tag.variant} Tag</Badge>
          </div>

          <DetailGroup title="Binding">
            <Detail label="Pet" value={tag.petName} />
            <Detail label="Owner" value={tag.ownerName} />
            <Detail label="Owner email" value={tag.ownerEmail} />
            <Detail label="Order" value={tag.orderNumber} href={tag.orderId ? adminRoutes.order(tag.orderId) : undefined} />
            <Detail label="Batch reference" value={tag.batchNumber} />
          </DetailGroup>

          <DetailGroup title="Activity">
            <Detail label="Activated" value={formatAdminDateTime(tag.activatedAt)} />
            <Detail label="Last scanned" value={formatAdminDateTime(tag.lastScannedAt)} />
            <Detail label="Total scans" value={String(tag.scanCount)} />
            <Detail label="Created" value={formatAdminDateTime(tag.createdAt)} />
            <Detail label="Updated" value={formatAdminDateTime(tag.updatedAt)} />
          </DetailGroup>

          {(tag.replacementForTagCode || tag.replacedByTagCode) ? (
            <DetailGroup title="Replacement history">
              <Detail label="Replaces" value={tag.replacementForTagCode} />
              <Detail label="Replaced by" value={tag.replacedByTagCode} />
            </DetailGroup>
          ) : null}

          <DetailGroup title="Change history">
            {history === undefined ? <p className="text-sm font-semibold text-slate-500">Loading history…</p>
              : history === null ? <p className="text-sm font-semibold text-slate-500">Change history is not available right now.</p>
                : history.length === 0 ? <p className="text-sm font-semibold text-slate-500">No changes recorded for this tag yet.</p>
                  : <ol className="grid gap-2">{history.map((entry) => <li className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={entry.id}><span className="font-bold text-slate-900">{historyLabel(entry.action)}</span><span className="shrink-0 font-semibold text-slate-500">{formatAdminDateTime(entry.createdAt)}</span></li>)}</ol>}
          </DetailGroup>

          <DetailGroup title="Public pages">
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex min-h-10 items-center rounded-full border border-slate-200 px-4 text-xs font-extrabold text-slate-700" href={tagPath(tag.tagCode)} rel="noopener noreferrer" target="_blank">Open Tag Scan Page</a>
              <QrCodeButton fileNameBase={`${tag.tagCode}-physical-tag-qr`} helperText="This is the QR printed on the physical tag." label="Show Tag QR" targetPath={tagPath(tag.tagCode)} title={`Physical Tag QR · ${tag.tagCode}`} viewLabel="Open Tag Scan Page" />
              {tag.safetyCode && tag.qrSafetyEnabled ? (
                <a className="inline-flex min-h-10 items-center rounded-full border border-slate-200 px-4 text-xs font-extrabold text-slate-700" href={qrSafetyPath(tag.safetyCode)} rel="noopener noreferrer" target="_blank">Open Safety Profile</a>
              ) : null}
            </div>
          </DetailGroup>

          {actions.length > 0 ? (
            <DetailGroup title="Lifecycle actions">
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button className={`min-h-10 rounded-full border px-4 text-xs font-extrabold disabled:opacity-50 ${action.danger ? "border-red-200 text-red-700" : "border-slate-200 text-slate-700"}`} disabled={busy} key={action.id} onClick={() => onAction(action.id)} type="button">{action.label}</button>
                ))}
              </div>
              <p className="text-xs font-semibold text-slate-500">Disabled, replaced, or archived tags do not expose finder contact details on the Tag Scan Page.</p>
            </DetailGroup>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-3 rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-black text-slate-950">{title}</h3>{children}</section>;
}

function Detail({ label, value, href }: { label: string; value?: string; href?: string }) {
  return <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 text-sm"><dt className="font-bold text-slate-500">{label}</dt><dd className="min-w-0 break-words font-semibold text-slate-800">{href && value ? <Link className="text-[#1b4f9c] underline-offset-2 hover:underline" href={href}>{value}</Link> : value || "—"}</dd></div>;
}

function historyLabel(action: string) {
  const labels: Record<string, string> = {
    "smart-tags.disable": "Disabled",
    "smart-tags.mark-lost": "Marked lost",
    "smart-tags.archive": "Archived",
    "smart-tags.restore": "Restored",
    "tag.assign-to-order": "Assigned to order",
    "tag.unassign-from-order": "Returned to stock",
    "tag.replace": "Replaced",
  };
  return labels[action] ?? action;
}
