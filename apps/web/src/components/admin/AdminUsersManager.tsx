"use client";

import { dateOnlyOrUndefined } from "@/lib/adminListShared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { AdminOwnerDetailDrawer } from "@/components/admin/AdminOwnerDetailDrawer";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { AdminBulkActionBar, type AdminBulkAction } from "@/components/admin/table/AdminBulkActionBar";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminExportMenu, type AdminExportFormat } from "@/components/admin/table/AdminExportMenu";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { AdminRowActionMenu, type AdminRowAction } from "@/components/admin/table/AdminRowActionMenu";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes } from "@/lib/routes";
import { isAbortError } from "@/services/apiClient";
import {
  countAdminOwners,
  downloadAdminOwnersExport,
  getAdminOwnerDetail,
  getAdminOwnerExportFormats,
  listAdminOwners,
  type AdminOwner,
  type AdminOwnerCounts,
  type AdminOwnerDetail,
  type AdminOwnerListParams,
} from "@/services/adminOwnerService";

const filterKeys = [
  "status", "contactReady", "profileComplete", "authProvider", "hasPets",
  "petCountMin", "petCountMax", "hasActivePet", "hasArchivedOrMemorialPet", "hasLostModePet",
  "hasOrders", "orderCountMin", "orderCountMax", "hasPendingPayment", "hasPendingProof",
  "hasActiveFulfilment", "hasDeliveredOrder", "tagState", "plan", "petUsageNearLimit",
  "memoryUsageNearLimit",
  "joinedFrom", "joinedTo", "updatedFrom", "updatedTo",
] as const;

const yesNo = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];

const filters: AdminFilterDef[] = [
  { type: "select", key: "status", label: "Account Status", options: [
    { value: "Active", label: "Active" }, { value: "Invited", label: "Invited" },
    { value: "Suspended", label: "Suspended" }, { value: "Deleted", label: "Deleted" },
  ] },
  { type: "select", key: "contactReady", label: "Contact Setup", options: [
    { value: "true", label: "Contact ready" }, { value: "false", label: "Missing usable contact" },
  ] },
  { type: "select", key: "hasPets", label: "Pet Profiles", options: [
    { value: "true", label: "Has pets" }, { value: "false", label: "No pets" },
  ] },
  { type: "select", key: "hasOrders", label: "Orders", options: [
    { value: "true", label: "Has orders" }, { value: "false", label: "No orders" },
  ] },
  { type: "select", key: "plan", label: "Plan", options: [
    { value: "Free", label: "Free" }, { value: "Premium", label: "Premium" },
  ] },
  { type: "select", key: "profileComplete", label: "Owner Profile", options: [
    { value: "true", label: "Complete" }, { value: "false", label: "Needs attention" },
  ], advanced: true },
  { type: "text", key: "authProvider", label: "Sign-in Provider", placeholder: "Google", advanced: true },
  { type: "text", key: "petCountMin", label: "Minimum Pets", placeholder: "0", advanced: true },
  { type: "text", key: "petCountMax", label: "Maximum Pets", placeholder: "3", advanced: true },
  { type: "select", key: "hasActivePet", label: "Active Pet", options: yesNo, advanced: true },
  { type: "select", key: "hasArchivedOrMemorialPet", label: "Memorial / Archived Pet", options: yesNo, advanced: true },
  { type: "select", key: "hasLostModePet", label: "Lost Mode Pet", options: yesNo, advanced: true },
  { type: "text", key: "orderCountMin", label: "Minimum Orders", placeholder: "0", advanced: true },
  { type: "text", key: "orderCountMax", label: "Maximum Orders", placeholder: "10", advanced: true },
  { type: "select", key: "hasPendingPayment", label: "Pending Payment", options: yesNo, advanced: true },
  { type: "select", key: "hasPendingProof", label: "Proof Awaiting Review", options: yesNo, advanced: true },
  { type: "select", key: "hasActiveFulfilment", label: "Active Fulfilment", options: yesNo, advanced: true },
  { type: "select", key: "hasDeliveredOrder", label: "Delivered Order", options: yesNo, advanced: true },
  { type: "select", key: "tagState", label: "Smart Tags", options: [
    { value: "active", label: "Has active tag" }, { value: "any", label: "Has linked tag" },
    { value: "none", label: "No linked tag" }, { value: "inactive-only", label: "Only inactive tags" },
  ], advanced: true },
  { type: "select", key: "petUsageNearLimit", label: "Pet Usage", options: [
    { value: "true", label: "Near plan limit" }, { value: "false", label: "Within plan limit" },
  ], advanced: true },
  { type: "select", key: "memoryUsageNearLimit", label: "Memory Usage", options: [
    { value: "true", label: "Near plan limit" }, { value: "false", label: "Within plan limit" },
  ], advanced: true },
  { type: "date-range", key: "joined", label: "Joined", advanced: true },
  { type: "date-range", key: "updated", label: "Updated", advanced: true },
];

const zeroCounts: AdminOwnerCounts = { all: 0, active: 0, suspended: 0, missingContact: 0, noPets: 0 };

export function AdminUsersManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "joinedAt",
    allowedSortIds: ["name", "email", "joinedAt", "updatedAt", "petCount", "orderCount", "activeTagCount", "status", "plan"],
    allowedFilterValues: {
      status: ["Active", "Invited", "Suspended", "Deleted"],
      contactReady: ["true", "false"], profileComplete: ["true", "false"],
      hasPets: ["true", "false"], hasActivePet: ["true", "false"],
      hasArchivedOrMemorialPet: ["true", "false"], hasLostModePet: ["true", "false"],
      hasOrders: ["true", "false"], hasPendingPayment: ["true", "false"],
      hasPendingProof: ["true", "false"], hasActiveFulfilment: ["true", "false"],
      hasDeliveredOrder: ["true", "false"], tagState: ["active", "any", "none", "inactive-only"],
      plan: ["Free", "Premium"], petUsageNearLimit: ["true", "false"],
      memoryUsageNearLimit: ["true", "false"],
    },
  });

  const params = useMemo<AdminOwnerListParams>(() => ({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    status: query.filters.status,
    contactReady: query.filters.contactReady,
    profileComplete: query.filters.profileComplete,
    authProvider: query.filters.authProvider,
    hasPets: query.filters.hasPets,
    petCountMin: nonNegative(query.filters.petCountMin),
    petCountMax: nonNegative(query.filters.petCountMax),
    hasActivePet: query.filters.hasActivePet,
    hasArchivedOrMemorialPet: query.filters.hasArchivedOrMemorialPet,
    hasLostModePet: query.filters.hasLostModePet,
    hasOrders: query.filters.hasOrders,
    orderCountMin: nonNegative(query.filters.orderCountMin),
    orderCountMax: nonNegative(query.filters.orderCountMax),
    hasPendingPayment: query.filters.hasPendingPayment,
    hasPendingProof: query.filters.hasPendingProof,
    hasActiveFulfilment: query.filters.hasActiveFulfilment,
    hasDeliveredOrder: query.filters.hasDeliveredOrder,
    tagState: query.filters.tagState,
    plan: query.filters.plan,
    petUsageNearLimit: query.filters.petUsageNearLimit,
    memoryUsageNearLimit: query.filters.memoryUsageNearLimit,
    joinedFrom: dateOnlyOrUndefined(query.filters.joinedFrom),
    joinedTo: dateOnlyOrUndefined(query.filters.joinedTo),
    updatedFrom: dateOnlyOrUndefined(query.filters.updatedFrom),
    updatedTo: dateOnlyOrUndefined(query.filters.updatedTo),
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  }), [query]);

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [state, setState] = useState<{ key: string; items: AdminOwner[]; total: number; counts: AdminOwnerCounts; error: string } | null>(null);
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: paramsKey, ids: new Set() });
  const [detachedDetail, setDetachedDetail] = useState<AdminOwnerDetail | null>(null);
  const [message, setMessage] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const request = JSON.parse(paramsKey) as AdminOwnerListParams;
    Promise.all([listAdminOwners(request, controller.signal), countAdminOwners(request, controller.signal)])
      .then(([list, counts]) => {
        if (!controller.signal.aborted) setState({ key: fetchKey, items: list.items, total: list.total, counts, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setState({ key: fetchKey, items: [], total: 0, counts: zeroCounts, error: "We couldn't load owner accounts. Please try again." });
      });
    return () => controller.abort();
  }, [fetchKey, paramsKey]);

  const current = state?.key === fetchKey ? state : null;
  const items = useMemo(() => current?.items ?? [], [current]);
  const selectedIds = selection.key === paramsKey ? selection.ids : new Set<string>();
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: paramsKey, ids });
  const openOwnerId = actions.getExtraParam("owner");
  const openOwner = items.find((owner) => owner.ownerUserId === openOwnerId)
    ?? (detachedDetail?.owner.ownerUserId === openOwnerId ? detachedDetail.owner : null);
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!openOwnerId || items.some((owner) => owner.ownerUserId === openOwnerId)) return;
    const controller = new AbortController();
    getAdminOwnerDetail(openOwnerId, controller.signal)
      .then((detail) => { if (!controller.signal.aborted) setDetachedDetail(detail); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("This owner account could not be opened.");
          actions.setExtraParam("owner", null);
        }
      });
    return () => controller.abort();
  }, [actions, items, openOwnerId]);

  async function exportRows(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true);
    setMessage("");
    try {
      await downloadAdminOwnersExport(params, format, scope === "selected" ? [...selectedIds] : undefined);
      setMessage(`Owner account ${format === "xlsx" ? "Excel" : "CSV"} export is ready.`);
    } catch {
      setMessage("We couldn't prepare this owner export. Please try again.");
    } finally {
      setExportBusy(false);
    }
  }

  async function copyEmail(owner: AdminOwner) {
    try {
      await navigator.clipboard.writeText(owner.email);
      setMessage(`Email copied for ${owner.displayName}.`);
    } catch {
      setMessage("We couldn't copy this email. Please copy it from the owner details instead.");
    }
  }

  const rowActions = (owner: AdminOwner): AdminRowAction[] => [
    { label: "View Pet Profiles", href: adminRoutes.petsForOwner(owner.ownerUserId) },
    { label: "View Orders", href: adminRoutes.ordersForOwner(owner.ownerUserId) },
    { label: "View Smart Tags", href: adminRoutes.smartTagsForOwner(owner.ownerUserId) },
    { label: "View Payment Proofs", href: adminRoutes.paymentProofsForOwner(owner.ownerUserId) },
    { label: "Copy Email", onSelect: () => void copyEmail(owner) },
  ];

  const columns: AdminColumn<AdminOwner>[] = [
    { id: "owner", header: "Owner", sortId: "name", cell: (owner) => <span className="block min-w-36"><span className="block font-black text-slate-950">{owner.displayName}</span><span className="block text-xs font-semibold text-slate-500">{owner.profileComplete ? "Profile complete" : "Profile needs attention"}</span></span> },
    { id: "email", header: "Email", sortId: "email", cell: (owner) => <span className="break-all text-sm font-semibold text-slate-700">{owner.email}</span> },
    { id: "contact", header: "Contact", cell: (owner) => <span className="block min-w-36"><span className={`block font-bold ${owner.contactReady ? "text-slate-800" : "text-amber-800"}`}>{owner.contactSummary}</span><span className="block text-xs font-semibold text-slate-500">{owner.finderContactIssuePetCount ? `${owner.finderContactIssuePetCount} pet${owner.finderContactIssuePetCount === 1 ? "" : "s"} need finder contact review` : `${owner.finderReadyPetCount} finder-ready pet${owner.finderReadyPetCount === 1 ? "" : "s"}`}</span></span> },
    { id: "pets", header: "Pets", sortId: "petCount", align: "right", cell: (owner) => <span className="font-black text-slate-900">{owner.petCount}<span className="block text-xs font-semibold text-slate-500">{owner.activePetCount} active</span></span> },
    { id: "orders", header: "Orders", sortId: "orderCount", align: "right", cell: (owner) => <span className="font-black text-slate-900">{owner.orderCount}<span className="block text-xs font-semibold text-slate-500">{owner.pendingProofCount ? `${owner.pendingProofCount} proof pending` : "No proof pending"}</span></span> },
    { id: "tags", header: "Smart Tags", sortId: "activeTagCount", align: "right", cell: (owner) => <span className="font-black text-slate-900">{owner.activeSmartTagCount}<span className="block text-xs font-semibold text-slate-500">{owner.totalSmartTagCount} linked</span></span> },
    { id: "plan", header: "Plan", sortId: "plan", cell: (owner) => <span className="font-bold text-slate-800">{owner.planName}<span className="block text-xs font-semibold text-slate-500">{owner.activePetCount}{owner.maxPets ? ` / ${owner.maxPets}` : ""} active pets</span></span> },
    { id: "joined", header: "Joined", sortId: "joinedAt", cell: (owner) => formatAdminDateTime(owner.joinedAt), hideable: true },
    { id: "updated", header: "Updated", sortId: "updatedAt", cell: (owner) => formatAdminDateTime(owner.updatedAt), hideable: true, defaultHidden: true },
    { id: "status", header: "Status", sortId: "status", cell: (owner) => <Badge tone={statusTone(owner.status)}>{owner.status}</Badge> },
    { id: "actions", header: "More", cell: (owner) => <AdminRowActionMenu actions={rowActions(owner)} label={`More actions for ${owner.displayName}, ${owner.email}`} /> },
  ];

  const bulkActions: AdminBulkAction[] = [
    { id: "export-selected-csv", label: "Export selected CSV", onClick: () => void exportRows("csv", "selected"), disabled: exportBusy },
    ...(getAdminOwnerExportFormats().includes("xlsx") ? [{ id: "export-selected-xlsx", label: "Export selected Excel", onClick: () => void exportRows("xlsx", "selected"), disabled: exportBusy }] : []),
  ];
  const counts = current?.counts ?? zeroCounts;

  return (
    <div className="grid gap-4">
      <AdminNotice>Owner information is shown for support use only. Account details and contact preferences remain owner-controlled.</AdminNotice>
      <AdminSection title="Owners" description="Investigate owner accounts, finder contact readiness, pet profiles, orders, and Smart Tags.">
        <AdminFilterBar
          endSlot={<AdminExportMenu busy={exportBusy} formats={getAdminOwnerExportFormats()} onExport={(format, scope) => void exportRows(format, scope)} selectedCount={selectedIds.size} />}
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          onClearAll={actions.clearAllFilters}
          onFilterChange={actions.setFilter}
          onFiltersChange={actions.setFilters}
          searchSlot={<AdminSearchInput onChange={actions.setSearch} placeholder="Search owner, email, phone, pet, order or tag…" value={query.search} />}
          values={query.filters}
        />
        <div aria-label="Owner account summary" className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-5">
          <SummaryCount label="All owners" value={counts.all} />
          <SummaryCount label="Active" value={counts.active} />
          <SummaryCount label="Suspended" value={counts.suspended} />
          <SummaryCount label="Missing contact" value={counts.missingContact} />
          <SummaryCount label="No pets" value={counts.noPets} />
        </div>
        {message ? <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]" role="status">{message}</p> : null}
        <AdminDataTable
          columns={columns}
          emptyDescription={hasActiveFilters ? "Clear filters to review all owner accounts." : "Owner accounts will appear after registration."}
          emptyTitle={hasActiveFilters ? "No owner accounts match these filters." : "No owner accounts yet."}
          error={current?.error || undefined}
          loading={!current}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          onRetry={refresh}
          onRowOpen={(owner) => actions.setExtraParam("owner", owner.ownerUserId)}
          onSelectedIdsChange={setSelectedIds}
          onSortChange={actions.setSort}
          page={query.page}
          pageSize={query.pageSize}
          rowKey={(owner) => owner.ownerUserId}
          rowOpenLabel="View Owner"
          rows={items}
          selectable
          selectedIds={selectedIds}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          stickyFirstColumn
          total={current?.total ?? 0}
        />
        <AdminBulkActionBar actions={bulkActions} busy={exportBusy} onClearSelection={() => setSelectedIds(new Set())} selectedCount={selectedIds.size} />
        {openOwner ? (
          <AdminOwnerDetailDrawer
            initialDetail={detachedDetail?.owner.ownerUserId === openOwner.ownerUserId ? detachedDetail : undefined}
            key={openOwner.ownerUserId}
            onClose={() => actions.setExtraParam("owner", null)}
            summary={openOwner}
          />
        ) : null}
      </AdminSection>
    </div>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return <span className="rounded-xl bg-white px-3 py-2 font-semibold text-slate-600"><strong className="me-1 text-slate-950">{value}</strong>{label}</span>;
}

function statusTone(status: AdminOwner["status"]): "mint" | "warm" | "danger" | "soft" {
  if (status === "Active") return "mint";
  if (status === "Suspended" || status === "Deleted") return "danger";
  return "warm";
}

function nonNegative(value?: string) {
  return value && /^\d+$/.test(value) ? value : undefined;
}

