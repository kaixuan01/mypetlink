"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSmartTagDetailDrawer } from "@/components/admin/AdminSmartTagDetailDrawer";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { formatAdminDateTime, getTagTypeLabel, tagStatusTone } from "@/components/admin/adminDisplay";
import { AdminBulkActionBar, type AdminBulkAction } from "@/components/admin/table/AdminBulkActionBar";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { AdminExportMenu, type AdminExportFormat } from "@/components/admin/table/AdminExportMenu";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isAbortError } from "@/services/apiClient";
import {
  bulkUpdateAdminSmartTags,
  canRunSmartTagAction,
  countAdminSmartTags,
  downloadAdminSmartTagsExport,
  getAdminSmartTagExportFormats,
  listAdminSmartTags,
  runAdminSmartTagAction,
  smartTagLifecycleLabel,
  type AdminSmartTag,
  type AdminSmartTagAction,
  type AdminSmartTagBulkAction,
  type AdminSmartTagCounts,
  type AdminSmartTagListParams,
} from "@/services/adminSmartTagService";

const filterKeys = [
  "status", "type", "variant", "claimed", "pet", "owner", "petId", "ownerId",
  "hasOrder", "hasScans", "activatedFrom", "activatedTo", "createdFrom", "createdTo",
  "lastScannedFrom", "lastScannedTo",
] as const;

const statusValues = ["Active", "awaiting-activation", "Pending", "Preparing", "Delivered", "Unclaimed", "Lost", "Disabled", "Replaced", "archived"] as const;

const filters: AdminFilterDef[] = [
  { type: "select", key: "status", label: "Lifecycle", options: [
    { value: "Active", label: "Active" },
    { value: "awaiting-activation", label: "Awaiting activation" },
    { value: "Pending", label: "Pending activation" },
    { value: "Preparing", label: "Preparing for owner" },
    { value: "Delivered", label: "Delivered / awaiting activation" },
    { value: "Unclaimed", label: "Unclaimed" },
    { value: "Lost", label: "Lost" },
    { value: "Disabled", label: "Disabled" },
    { value: "Replaced", label: "Replaced" },
    { value: "archived", label: "Archived" },
  ] },
  { type: "select", key: "type", label: "Type", options: [
    { value: "QR", label: "QR Pet Tag" }, { value: "QR_NFC", label: "QR + NFC Smart Tag" },
  ] },
  { type: "select", key: "claimed", label: "Claimed", options: [
    { value: "true", label: "Claimed" }, { value: "false", label: "Unclaimed" },
  ] },
  { type: "select", key: "variant", label: "Variant", options: [
    { value: "Lightweight", label: "Lightweight Tag" }, { value: "Standard", label: "Standard Tag" },
  ], advanced: true },
  { type: "text", key: "pet", label: "Pet", placeholder: "Pet name", advanced: true },
  { type: "text", key: "owner", label: "Owner", placeholder: "Name or email", advanced: true },
  { type: "select", key: "hasOrder", label: "Order", options: [
    { value: "true", label: "Has order" }, { value: "false", label: "No order" },
  ], advanced: true },
  { type: "select", key: "hasScans", label: "Scans", options: [
    { value: "true", label: "Has scans" }, { value: "false", label: "Never scanned" },
  ], advanced: true },
  { type: "date-range", key: "activated", label: "Activated", advanced: true },
  { type: "date-range", key: "lastScanned", label: "Last scanned", advanced: true },
  { type: "date-range", key: "created", label: "Created", advanced: true },
];

const shortcuts: { value: string; label: string; count: keyof AdminSmartTagCounts }[] = [
  { value: "", label: "All", count: "all" },
  { value: "Active", label: "Active", count: "active" },
  { value: "awaiting-activation", label: "Awaiting activation", count: "awaitingActivation" },
  { value: "Unclaimed", label: "Unclaimed", count: "unclaimed" },
  { value: "Lost", label: "Lost", count: "lost" },
  { value: "Disabled", label: "Disabled", count: "disabled" },
  { value: "Replaced", label: "Replaced", count: "replaced" },
  { value: "archived", label: "Archived", count: "archived" },
];

const emptyCounts: AdminSmartTagCounts = { all: 0, active: 0, awaitingActivation: 0, unclaimed: 0, lost: 0, disabled: 0, replaced: 0, archived: 0 };
type PendingAction = { scope: "row"; tag: AdminSmartTag; action: AdminSmartTagAction } | { scope: "bulk"; action: AdminSmartTagBulkAction };

function isGuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function AdminTagsManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "updatedAt",
    allowedSortIds: ["tagCode", "status", "pet", "owner", "activatedAt", "lastScannedAt", "createdAt", "updatedAt"],
    allowedFilterValues: {
      status: statusValues,
      type: ["QR", "QR_NFC"], variant: ["Lightweight", "Standard"], claimed: ["true", "false"],
      hasOrder: ["true", "false"], hasScans: ["true", "false"],
    },
  });
  const params = useMemo<AdminSmartTagListParams>(() => ({
    page: query.page, pageSize: query.pageSize, search: query.search || undefined,
    status: query.filters.status, tagType: query.filters.type, variant: query.filters.variant,
    claimed: query.filters.claimed,
    pet: isGuid(query.filters.pet) ? undefined : query.filters.pet,
    owner: isGuid(query.filters.owner) ? undefined : query.filters.owner,
    petId: query.filters.petId ?? (isGuid(query.filters.pet) ? query.filters.pet : undefined),
    ownerId: query.filters.ownerId ?? (isGuid(query.filters.owner) ? query.filters.owner : undefined),
    hasOrder: query.filters.hasOrder, hasScans: query.filters.hasScans,
    activatedFrom: query.filters.activatedFrom, activatedTo: query.filters.activatedTo,
    createdFrom: query.filters.createdFrom, createdTo: query.filters.createdTo,
    lastScannedFrom: query.filters.lastScannedFrom, lastScannedTo: query.filters.lastScannedTo,
    sortBy: query.sortBy, sortDir: query.sortDir,
  }), [query]);
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [state, setState] = useState<{ key: string; items: AdminSmartTag[]; total: number; counts: AdminSmartTagCounts; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: paramsKey, ids: new Set() });
  const [message, setMessage] = useState("");
  const [failureDetails, setFailureDetails] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const request = JSON.parse(paramsKey) as AdminSmartTagListParams;
    Promise.all([listAdminSmartTags(request, controller.signal), countAdminSmartTags(request, controller.signal)])
      .then(([list, counts]) => { if (!controller.signal.aborted) setState({ key, items: list.items, total: list.total, counts, error: "" }); })
      .catch((error) => { if (!controller.signal.aborted && !isAbortError(error)) setState({ key, items: [], total: 0, counts: emptyCounts, error: "We couldn't load Smart Tags. Please try again." }); });
    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  const current = state?.key === fetchKey ? state : null;
  const items = current?.items ?? [];
  const selectedIds = selection.key === paramsKey ? selection.ids : new Set<string>();
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: paramsKey, ids });
  const selectedRows = items.filter((tag) => selectedIds.has(tag.id));
  const openTag = items.find((tag) => tag.id === actions.getExtraParam("tag")) ?? null;
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  const columns = useMemo<AdminColumn<AdminSmartTag>[]>(() => [
    { id: "tagCode", header: "Tag Code", sortId: "tagCode", cell: (tag) => <button aria-label={`Copy tag code ${tag.tagCode}`} className="font-mono text-xs font-black text-slate-950 underline-offset-2 hover:underline" onClick={() => void navigator.clipboard.writeText(tag.tagCode)} type="button">{tag.tagCode}</button>, className: "whitespace-nowrap" },
    { id: "type", header: "Type", cell: (tag) => getTagTypeLabel(tag.hasNfc), className: "whitespace-nowrap" },
    { id: "variant", header: "Variant", cell: (tag) => `${tag.variant} Tag`, hideable: true },
    { id: "pet", header: "Pet", sortId: "pet", cell: (tag) => tag.petName ?? "—", className: "whitespace-nowrap" },
    { id: "owner", header: "Owner", sortId: "owner", cell: (tag) => <div><p className="font-semibold text-slate-800">{tag.ownerName ?? "—"}</p>{tag.ownerEmail ? <p className="text-xs text-slate-500">{tag.ownerEmail}</p> : null}</div> },
    { id: "order", header: "Order", cell: (tag) => tag.orderNumber ?? "—", hideable: true, defaultHidden: true },
    { id: "status", header: "Lifecycle Status", sortId: "status", cell: (tag) => <Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>{smartTagLifecycleLabel(tag)}</Badge>, className: "whitespace-nowrap" },
    { id: "activatedAt", header: "Activated", sortId: "activatedAt", cell: (tag) => formatAdminDateTime(tag.activatedAt), hideable: true, className: "whitespace-nowrap" },
    { id: "lastScannedAt", header: "Last Scanned", sortId: "lastScannedAt", cell: (tag) => <div className="whitespace-nowrap">{formatAdminDateTime(tag.lastScannedAt)}{tag.scanCount > 0 ? <p className="text-xs text-slate-400">{tag.scanCount} scan{tag.scanCount === 1 ? "" : "s"}</p> : null}</div>, hideable: true },
    { id: "createdAt", header: "Created", sortId: "createdAt", cell: (tag) => formatAdminDateTime(tag.createdAt), hideable: true, defaultHidden: true, className: "whitespace-nowrap" },
  ], []);

  async function confirmAction() {
    if (!pending || busy) return;
    setBusy(true); setMessage(""); setFailureDetails([]);
    try {
      if (pending.scope === "row") {
        const updated = await runAdminSmartTagAction(pending.tag.id, pending.action, reason);
        setMessage(`${updated.tagCode} is now ${smartTagLifecycleLabel(updated).toLowerCase()}.`);
      } else {
        const result = await bulkUpdateAdminSmartTags(pending.action, [...selectedIds], reason);
        setMessage(`${result.updatedCount} of ${result.requestedCount} selected tags updated.`);
        setFailureDetails(result.failures.map((failure) => `${failure.tagCode || "Tag"}: ${failure.reason}`));
        setSelectedIds(new Set());
      }
      actions.setExtraParam("tag", null); refresh();
    } catch { setMessage("The tag could not be updated. Its lifecycle state has not changed."); }
    finally { setBusy(false); setPending(null); }
  }

  async function exportRows(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true); setMessage("");
    try { await downloadAdminSmartTagsExport(params, format, scope === "selected" ? [...selectedIds] : undefined); setMessage(scope === "selected" ? "Selected Smart Tags exported." : "Filtered Smart Tags exported."); }
    catch { setMessage("The export could not be created. Please try again."); }
    finally { setExportBusy(false); }
  }

  function beginAction(action: PendingAction) {
    setReason("");
    setPending(action);
  }

  const bulkActions: AdminBulkAction[] = (["disable", "archive"] as AdminSmartTagBulkAction[]).map((action) => {
    const invalid = selectedRows.some((tag) => !canRunSmartTagAction(tag, action));
    return { id: action, label: action === "disable" ? "Disable selected" : "Archive selected", tone: action === "disable" ? "danger" : "neutral", disabled: invalid || selectedRows.length !== selectedIds.size, disabledReason: invalid ? `Every selected tag must support ${action}.` : "The selection is no longer on this page.", onClick: () => beginAction({ scope: "bulk", action }) };
  });
  const pendingLabel = pending?.action === "disable" ? "Disable" : pending?.action === "mark-lost" ? "Mark as Lost" : pending?.action === "restore" ? "Restore" : "Archive";
  const pendingCount = pending?.scope === "bulk" ? selectedIds.size : 1;

  return (
    <AdminSection title="Smart Tags" description="Manage activation, pet and owner binding, scan activity, and the lifecycle of every Smart Tag.">
      <nav aria-label="Tag lifecycle shortcuts" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
        {shortcuts.map((shortcut) => <button aria-current={(query.filters.status ?? "") === shortcut.value ? "page" : undefined} className={`min-h-10 shrink-0 rounded-t-xl px-3 text-xs font-extrabold ${(query.filters.status ?? "") === shortcut.value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`} key={shortcut.label} onClick={() => actions.setFilter("status", shortcut.value || null)} type="button">{shortcut.label} <span className="opacity-70">{current ? current.counts[shortcut.count] : "…"}</span></button>)}
      </nav>
      <AdminFilterBar endSlot={<AdminExportMenu busy={exportBusy} formats={getAdminSmartTagExportFormats()} onExport={(format, scope) => void exportRows(format, scope)} selectedCount={selectedIds.size} />} filters={filters} hasActiveFilters={hasActiveFilters} onClearAll={actions.clearAllFilters} onFilterChange={actions.setFilter} onFiltersChange={actions.setFilters} searchSlot={<AdminSearchInput onChange={actions.setSearch} placeholder="Search code, pet, owner, email, order…" value={query.search} />} values={query.filters} />
      {message ? <div className="px-4 pt-3"><AdminNotice>{message}</AdminNotice>{failureDetails.length ? <ul className="mt-2 grid gap-1 text-xs font-semibold text-red-700">{failureDetails.map((failure) => <li key={failure}>{failure}</li>)}</ul> : null}</div> : null}
      <AdminDataTable columns={columns} emptyDescription={hasActiveFilters ? "Try changing or clearing the active filters." : "Tags appear here after they are generated in Tag Inventory."} emptyTitle={hasActiveFilters ? "No Smart Tags match these filters." : "No Smart Tags yet."} error={current?.error || undefined} loading={!current} onPageChange={actions.setPage} onPageSizeChange={actions.setPageSize} onRetry={refresh} onRowOpen={(tag) => actions.setExtraParam("tag", tag.id)} onSelectedIdsChange={setSelectedIds} onSortChange={actions.setSort} page={query.page} pageSize={query.pageSize} rowKey={(tag) => tag.id} rowOpenLabel="View" rows={items} selectable selectedIds={selectedIds} sortBy={query.sortBy} sortDir={query.sortDir} total={current?.total ?? 0} />
      <AdminBulkActionBar actions={bulkActions} busy={busy} onClearSelection={() => setSelectedIds(new Set())} selectedCount={selectedIds.size} />
      <ConfirmDialog confirmLabel={pendingLabel} destructive={pending?.action !== "restore"} message={`${pendingLabel} ${pendingCount} tag${pendingCount === 1 ? "" : "s"}? This changes lifecycle and finder access, but does not change fulfilment or delete history.`} onCancel={() => setPending(null)} onConfirm={() => void confirmAction()} open={pending !== null} title={`${pendingLabel} tag${pendingCount === 1 ? "" : "s"}?`}>
        <label className="grid gap-1.5 text-sm font-bold text-pet-ink">Reason (optional)<textarea className="min-h-20 rounded-xl border border-pet-border px-3 py-2 text-sm font-medium outline-none focus:border-pet-teal" maxLength={600} onChange={(event) => setReason(event.target.value)} placeholder="Add context for the audit history" value={reason} /></label>
      </ConfirmDialog>
      <AdminSmartTagDetailDrawer busy={busy} onAction={(action) => { if (openTag) beginAction({ scope: "row", tag: openTag, action }); }} onClose={() => actions.setExtraParam("tag", null)} tag={openTag} />
    </AdminSection>
  );
}
