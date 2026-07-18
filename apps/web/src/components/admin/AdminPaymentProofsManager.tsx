"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminPaymentProofDetailDrawer } from "@/components/admin/AdminPaymentProofDetailDrawer";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { AdminBulkActionBar, type AdminBulkAction } from "@/components/admin/table/AdminBulkActionBar";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminExportMenu, type AdminExportFormat } from "@/components/admin/table/AdminExportMenu";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { dateOnlyOrUndefined, isGuid } from "@/lib/adminListShared";
import {
  approveAdminPaymentProof,
  countAdminPaymentProofs,
  downloadAdminPaymentProofsExport,
  getAdminPaymentProofDetail,
  getAdminPaymentProofExportFormats,
  listAdminPaymentProofs,
  paymentProofStatusLabels,
  paymentStatusLabels,
  rejectAdminPaymentProof,
  type AdminPaymentProof,
  type AdminPaymentProofCounts,
  type AdminPaymentProofListParams,
} from "@/services/adminPaymentProofService";
import { isAbortError } from "@/services/apiClient";
import { getFriendlyTagErrorMessage } from "@/services/tagService";

const filterKeys = [
  "status", "orderPaymentStatus", "hasReference", "hasMedia", "needsAttention", "overdue",
  "paymentMethod", "owner", "ownerId", "reviewer", "amountMin", "amountMax",
  "submittedFrom", "submittedTo", "reviewedFrom", "reviewedTo",
] as const;

const filters: AdminFilterDef[] = [
  { type: "select", key: "status", label: "Review Status", options: Object.entries(paymentProofStatusLabels).map(([value, label]) => ({ value, label })) },
  { type: "select", key: "orderPaymentStatus", label: "Order Payment", options: Object.entries(paymentStatusLabels).map(([value, label]) => ({ value, label })) },
  { type: "select", key: "needsAttention", label: "Attention", options: [
    { value: "true", label: "Requires manual verification" },
    { value: "false", label: "No warnings" },
  ] },
  { type: "select", key: "overdue", label: "Waiting Over a Day", options: [
    { value: "true", label: "Yes" }, { value: "false", label: "No" },
  ] },
  { type: "select", key: "hasReference", label: "Payment Reference", options: [
    { value: "true", label: "Provided" }, { value: "false", label: "Missing" },
  ], advanced: true },
  { type: "select", key: "hasMedia", label: "Proof File", options: [
    { value: "true", label: "Available" }, { value: "false", label: "Missing" },
  ], advanced: true },
  { type: "text", key: "paymentMethod", label: "Payment Method", advanced: true },
  { type: "text", key: "owner", label: "Customer", placeholder: "Name, email, phone", advanced: true },
  { type: "text", key: "reviewer", label: "Reviewer", advanced: true },
  { type: "text", key: "amountMin", label: "Minimum Amount", advanced: true },
  { type: "text", key: "amountMax", label: "Maximum Amount", advanced: true },
  { type: "date-range", key: "submitted", label: "Submitted", advanced: true },
  { type: "date-range", key: "reviewed", label: "Reviewed", advanced: true },
];

const shortcuts: { value: string; label: string; count: keyof AdminPaymentProofCounts }[] = [
  { value: "PendingReview", label: "Awaiting review", count: "pendingReview" },
  { value: "Approved", label: "Approved", count: "approved" },
  { value: "Rejected", label: "Rejected", count: "rejected" },
  { value: "Superseded", label: "Superseded", count: "superseded" },
  { value: "", label: "All", count: "all" },
];

const emptyCounts: AdminPaymentProofCounts = { all: 0, pendingReview: 0, approved: 0, rejected: 0, superseded: 0, needsAttention: 0 };

// Sentinel sort id: the review queue orders pending proofs first (oldest
// submitted at the top). It is never sent to the API — omitting sortBy selects
// the same queue order on the server and in local data.
const QUEUE_SORT = "queue";

type PendingReview = { decision: "approve" | "reject"; proof: AdminPaymentProof };

export function AdminPaymentProofsManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: QUEUE_SORT,
    allowedSortIds: [QUEUE_SORT, "submittedAt", "reviewedAt", "orderNumber", "customer", "amount", "status", "reviewer", "updatedAt"],
    allowedFilterValues: {
      status: Object.keys(paymentProofStatusLabels),
      orderPaymentStatus: Object.keys(paymentStatusLabels),
      hasReference: ["true", "false"], hasMedia: ["true", "false"],
      needsAttention: ["true", "false"], overdue: ["true", "false"],
    },
  });

  const params = useMemo<AdminPaymentProofListParams>(() => ({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    status: query.filters.status,
    orderPaymentStatus: query.filters.orderPaymentStatus,
    hasReference: query.filters.hasReference,
    hasMedia: query.filters.hasMedia,
    needsAttention: query.filters.needsAttention,
    overdue: query.filters.overdue,
    paymentMethod: query.filters.paymentMethod,
    owner: query.filters.owner,
    ownerId: isGuid(query.filters.ownerId) ? query.filters.ownerId : undefined,
    reviewer: query.filters.reviewer,
    amountMin: nonNegativeAmount(query.filters.amountMin),
    amountMax: nonNegativeAmount(query.filters.amountMax),
    submittedFrom: dateOnlyOrUndefined(query.filters.submittedFrom),
    submittedTo: dateOnlyOrUndefined(query.filters.submittedTo),
    reviewedFrom: dateOnlyOrUndefined(query.filters.reviewedFrom),
    reviewedTo: dateOnlyOrUndefined(query.filters.reviewedTo),
    sortBy: query.sortBy === QUEUE_SORT ? undefined : query.sortBy,
    sortDir: query.sortBy === QUEUE_SORT ? undefined : query.sortDir,
  }), [query]);

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [state, setState] = useState<{ key: string; items: AdminPaymentProof[]; total: number; counts: AdminPaymentProofCounts; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: paramsKey, ids: new Set() });
  const [detachedProof, setDetachedProof] = useState<AdminPaymentProof | null>(null);
  const [message, setMessage] = useState("");
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const request = JSON.parse(paramsKey) as AdminPaymentProofListParams;
    Promise.all([listAdminPaymentProofs(request, controller.signal), countAdminPaymentProofs(request, controller.signal)])
      .then(([list, counts]) => {
        if (!controller.signal.aborted) setState({ key, items: list.items, total: list.total, counts, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setState({ key, items: [], total: 0, counts: emptyCounts, error: "We couldn't load payment proofs. Please try again." });
        }
      });
    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  const current = state?.key === fetchKey ? state : null;
  const items = useMemo(() => current?.items ?? [], [current]);
  const counts = current?.counts ?? emptyCounts;
  const selectedIds = selection.key === paramsKey ? selection.ids : new Set<string>();
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: paramsKey, ids });
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  const openProofId = actions.getExtraParam("proof");
  const openProof = items.find((proof) => proof.id === openProofId)
    ?? (detachedProof?.id === openProofId ? detachedProof : null);

  // Deep links (e.g. from an order) can point at a proof outside the current
  // page; load its summary on demand.
  useEffect(() => {
    if (!openProofId || items.some((proof) => proof.id === openProofId)) return;
    const controller = new AbortController();
    getAdminPaymentProofDetail(openProofId, controller.signal)
      .then((detail) => { if (!controller.signal.aborted) setDetachedProof(detail); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("This payment proof could not be opened.");
          actions.setExtraParam("proof", null);
        }
      });
    return () => controller.abort();
  }, [actions, items, openProofId]);

  function beginReview(decision: "approve" | "reject", proof: AdminPaymentProof) {
    setReason("");
    setDialogError("");
    setPendingReview({ decision, proof });
  }

  async function confirmReview() {
    if (!pendingReview || busy) return;
    if (pendingReview.decision === "reject" && !reason.trim()) {
      setDialogError("Enter a reason before rejecting this proof.");
      return;
    }

    setBusy(true);
    setDialogError("");
    try {
      if (pendingReview.decision === "approve") {
        await approveAdminPaymentProof(pendingReview.proof);
        setMessage(`Payment confirmed for ${pendingReview.proof.orderNumber}.`);
      } else {
        await rejectAdminPaymentProof(pendingReview.proof, reason);
        setMessage(`${pendingReview.proof.orderNumber} returned to Pending Payment for resubmission.`);
      }
      setPendingReview(null);
      setDetachedProof(null);
      refresh();
    } catch (caught) {
      setDialogError(getFriendlyTagErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function exportRows(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true);
    setMessage("");
    try {
      await downloadAdminPaymentProofsExport(params, format, scope === "selected" ? [...selectedIds] : undefined);
      setMessage(scope === "selected" ? "Selected payment proofs exported." : "Filtered payment proofs exported.");
    } catch {
      setMessage("The export could not be created. Please try again.");
    } finally {
      setExportBusy(false);
    }
  }

  const columns: AdminColumn<AdminPaymentProof>[] = [
    { id: "orderNumber", header: "Order", sortId: "orderNumber", cell: (proof) => <span className="whitespace-nowrap font-bold text-slate-950">{proof.orderNumber}</span> },
    { id: "customer", header: "Customer", sortId: "customer", cell: (proof) => <span className="block min-w-32"><span className="block font-bold text-slate-900">{proof.ownerName}</span><span className="block break-all text-xs font-semibold text-slate-500">{proof.ownerEmail}</span></span> },
    { id: "amount", header: "Expected", sortId: "amount", align: "right", cell: (proof) => <span className="whitespace-nowrap font-bold text-slate-700">{proof.currency} {proof.expectedAmount.toFixed(2)}</span> },
    { id: "reference", header: "Reference", cell: (proof) => <span className="block min-w-28"><span className="block font-semibold text-slate-700">{proof.paymentReference ?? "—"}</span><span className="block text-xs font-semibold text-slate-500">{proof.paymentMethod}</span></span>, hideable: true },
    {
      id: "status", header: "Review Status", sortId: "status",
      cell: (proof) => (
        <span className="block whitespace-nowrap">
          <Badge tone={proof.status === "Approved" ? "mint" : proof.status === "Rejected" ? "danger" : proof.status === "Superseded" ? "soft" : "warm"}>
            {paymentProofStatusLabels[proof.status]}
          </Badge>
          {proof.requiresAttention ? <span className="mt-1 block text-xs font-bold text-[#a63c2e]">Requires manual verification</span> : null}
        </span>
      ),
    },
    { id: "orderPayment", header: "Order Payment", cell: (proof) => <span className="whitespace-nowrap text-slate-600">{paymentStatusLabels[proof.orderPaymentStatus]}</span>, hideable: true, defaultHidden: true },
    { id: "submittedAt", header: "Submitted", sortId: "submittedAt", cell: (proof) => <span className="whitespace-nowrap text-slate-600">{formatAdminDateTime(proof.submittedAt)}</span> },
    { id: "reviewer", header: "Reviewer", sortId: "reviewer", cell: (proof) => <span className="whitespace-nowrap text-slate-600">{proof.reviewerName ?? "—"}</span>, hideable: true },
    { id: "reviewedAt", header: "Reviewed", sortId: "reviewedAt", cell: (proof) => <span className="whitespace-nowrap text-slate-600">{formatAdminDateTime(proof.reviewedAt)}</span>, hideable: true, defaultHidden: true },
  ];

  const bulkActions: AdminBulkAction[] = [
    { id: "export-selected-csv", label: "Export selected CSV", onClick: () => void exportRows("csv", "selected"), disabled: exportBusy },
    ...(getAdminPaymentProofExportFormats().includes("xlsx")
      ? [{ id: "export-selected-xlsx", label: "Export selected Excel", onClick: () => void exportRows("xlsx", "selected"), disabled: exportBusy } satisfies AdminBulkAction]
      : []),
  ];

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Payments are reviewed manually in this early launch phase. Approving a
        proof confirms the payment; requesting resubmission returns the order to
        Pending Payment without cancelling it.
      </AdminNotice>
      <AdminSection
        title="Payment proof review"
        description="Uploaded receipts and transaction references awaiting manual confirmation."
      >
        <nav aria-label="Review status shortcuts" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
          {shortcuts.map((shortcut) => (
            <button
              aria-current={(query.filters.status ?? "") === shortcut.value ? "page" : undefined}
              className={`min-h-10 shrink-0 rounded-t-xl px-3 text-xs font-extrabold ${(query.filters.status ?? "") === shortcut.value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              key={shortcut.label}
              onClick={() => actions.setFilter("status", shortcut.value || null)}
              type="button"
            >
              {shortcut.label} <span className="opacity-70">{current ? counts[shortcut.count] : "…"}</span>
            </button>
          ))}
        </nav>
        <AdminFilterBar
          endSlot={<AdminExportMenu busy={exportBusy} formats={getAdminPaymentProofExportFormats()} onExport={(format, scope) => void exportRows(format, scope)} selectedCount={selectedIds.size} />}
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          onClearAll={actions.clearAllFilters}
          onFilterChange={actions.setFilter}
          onFiltersChange={actions.setFilters}
          searchSlot={<AdminSearchInput onChange={actions.setSearch} placeholder="Search order, customer, reference, reviewer…" value={query.search} />}
          values={query.filters}
        />
        {message ? <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]" role="status">{message}</p> : null}
        <AdminDataTable
          columns={columns}
          emptyDescription={hasActiveFilters ? "Try changing or clearing the active filters." : "Payment proofs appear when owners submit receipts for their orders."}
          emptyTitle={hasActiveFilters ? "No payment proofs match these filters." : "No payment proofs yet."}
          error={current?.error || undefined}
          loading={!current}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          onRetry={refresh}
          onRowOpen={(proof) => actions.setExtraParam("proof", proof.id)}
          onSelectedIdsChange={setSelectedIds}
          onSortChange={actions.setSort}
          page={query.page}
          pageSize={query.pageSize}
          rowKey={(proof) => proof.id}
          rowOpenLabel="Review"
          rows={items}
          selectable
          selectedIds={selectedIds}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          stickyFirstColumn
          total={current?.total ?? 0}
        />
        <AdminBulkActionBar actions={bulkActions} busy={exportBusy} onClearSelection={() => setSelectedIds(new Set())} selectedCount={selectedIds.size} />
        {openProof ? (
          <AdminPaymentProofDetailDrawer
            busy={busy}
            key={openProof.id}
            onClose={() => actions.setExtraParam("proof", null)}
            onReview={(decision, proof) => beginReview(decision, proof)}
            refreshKey={reloadKey}
            summary={openProof}
          />
        ) : null}
      </AdminSection>

      <ConfirmDialog
        confirmLabel={busy ? "Working…" : pendingReview?.decision === "approve" ? "Approve & Confirm Payment" : "Request Resubmission"}
        destructive={pendingReview?.decision === "reject"}
        message={pendingReview?.decision === "approve"
          ? "The latest submitted proof will be approved and the order payment confirmed."
          : "The order will return to Pending Payment with a note asking the owner to resubmit their receipt. The order is not cancelled."}
        onCancel={() => !busy && setPendingReview(null)}
        onConfirm={() => void confirmReview()}
        open={pendingReview !== null}
        title={pendingReview?.decision === "approve" ? "Approve this payment?" : "Request payment proof resubmission?"}
      >
        {pendingReview?.decision === "reject" ? (
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Reason
            <textarea className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-slate-400" maxLength={600} onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        ) : null}
        {dialogError ? <p className="mt-2 text-sm font-bold text-red-700" role="alert">{dialogError}</p> : null}
      </ConfirmDialog>
    </div>
  );
}

function nonNegativeAmount(value?: string) {
  return value && /^\d+(\.\d{1,2})?$/.test(value) ? value : undefined;
}
