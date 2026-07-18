"use client";

import { dateOnlyOrUndefined } from "@/lib/adminListShared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminOwnerPlanDetailDrawer } from "@/components/admin/AdminOwnerPlanDetailDrawer";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { formatAdminDate, formatAdminDateTime } from "@/components/admin/adminDisplay";
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
  countAdminOwnerPlans,
  downloadAdminOwnerPlansExport,
  getAdminOwnerPlanDetail,
  getAdminOwnerPlanExportFormats,
  listAdminOwnerPlans,
  listAdminPlanDefinitions,
  planStatusLabels,
  usageStateLabels,
  type AdminOwnerPlan,
  type AdminOwnerPlanCounts,
  type AdminOwnerPlanListParams,
  type AdminPlanDefinition,
  type AdminUsageState,
} from "@/services/adminPlanService";

const filterKeys = [
  "plan",
  "petUsage",
  "memoryUsage",
  "hasOverride",
  "assignedFrom",
  "assignedTo",
  "updatedFrom",
  "updatedTo",
] as const;

const usageOptions = [
  { value: "within", label: "Within limit" },
  { value: "near", label: "Near limit" },
  { value: "at", label: "At limit" },
  { value: "over", label: "Over limit" },
];

const zeroCounts: AdminOwnerPlanCounts = {
  all: 0,
  nearPetLimit: 0,
  atPetLimit: 0,
  overPetLimit: 0,
  withOverride: 0,
};

const usageTone: Record<AdminUsageState, "mint" | "warm" | "danger"> = {
  Within: "mint",
  Near: "warm",
  At: "warm",
  Over: "danger",
};


export function AdminPlansManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "updatedAt",
    allowedSortIds: [
      "owner",
      "email",
      "plan",
      "petUsage",
      "memoryUsage",
      "careRecords",
      "assignedAt",
      "updatedAt",
    ],
    allowedFilterValues: {
      petUsage: ["within", "near", "at", "over"],
      memoryUsage: ["within", "near", "at", "over"],
      hasOverride: ["true", "false"],
    },
  });

  const view = actions.getExtraParam("view") === "owners" ? "owners" : "definitions";

  // Plan definitions load once for both views: the definitions table shows
  // them, the owners view uses them for the Plan filter options. Loading is
  // derived from the reload key so no state is set synchronously in effects.
  const [definitionsReloadKey, setDefinitionsReloadKey] = useState(0);
  const [definitionsResult, setDefinitionsResult] = useState<{
    key: number;
    definitions: AdminPlanDefinition[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = definitionsReloadKey;

    listAdminPlanDefinitions(controller.signal)
      .then((definitions) => {
        if (!controller.signal.aborted) {
          setDefinitionsResult({ key, definitions, failed: false });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setDefinitionsResult({ key, definitions: [], failed: true });
        }
      });

    return () => controller.abort();
  }, [definitionsReloadKey]);

  const definitionsState = {
    definitions: definitionsResult?.key === definitionsReloadKey ? definitionsResult.definitions : [],
    status:
      definitionsResult?.key !== definitionsReloadKey
        ? ("loading" as const)
        : definitionsResult.failed
          ? ("error" as const)
          : ("ready" as const),
  };

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Plans control how many pet profiles and memories each owner can create.
        Only the Free plan is on sale today; Premium is prepared but not
        available yet, and no owner is billed automatically.
      </AdminNotice>

      <div aria-label="Plans views" className="flex flex-wrap gap-1.5" role="tablist">
        <ViewTab
          active={view === "definitions"}
          label="Plan Definitions"
          onClick={() => actions.setExtraParam("view", null)}
        />
        <ViewTab
          active={view === "owners"}
          label="Owner Plans"
          onClick={() => actions.setExtraParam("view", "owners")}
        />
      </div>

      {view === "definitions" ? (
        <PlanDefinitionsSection
          onRetry={() => setDefinitionsReloadKey((key) => key + 1)}
          state={definitionsState}
        />
      ) : (
        <OwnerPlansSection
          actions={actions}
          definitions={definitionsState.definitions}
          hasActiveFilters={hasActiveFilters}
          query={query}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-extrabold transition ${
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

// --- Plan definitions ---------------------------------------------------------

function PlanDefinitionsSection({
  state,
  onRetry,
}: {
  state: { definitions: AdminPlanDefinition[]; status: "loading" | "ready" | "error" };
  onRetry: () => void;
}) {
  return (
    <AdminSection
      description="The plan packages the service enforces. These values are managed in the product configuration and are read-only here — owner limits, pricing pages, and this screen all read the same source."
      title="Plan definitions"
    >
      {state.status === "loading" ? (
        <p className="p-6 text-sm font-semibold text-slate-500" role="status">
          Loading plan definitions…
        </p>
      ) : state.status === "error" ? (
        <div className="p-6">
          <p className="text-sm font-bold text-slate-700">
            We couldn&apos;t load the plan definitions. Please try again.
          </p>
          <button
            className="mt-3 inline-flex min-h-9 items-center rounded-full border border-slate-950 bg-slate-950 px-4 text-xs font-extrabold text-white transition hover:bg-slate-800"
            onClick={onRetry}
            type="button"
          >
            Try Again
          </button>
        </div>
      ) : state.definitions.length === 0 ? (
        <p className="p-6 text-sm font-bold text-[#a63c2e]">
          No plan definitions were found. This is a configuration problem — the
          service should always provide at least the Free plan. Please contact
          the engineering team before making any plan-related decisions.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3" scope="col">Plan</th>
                <th className="whitespace-nowrap px-4 py-3" scope="col">Availability</th>
                <th className="whitespace-nowrap px-4 py-3" scope="col">Price</th>
                <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Pets</th>
                <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Memories / pet</th>
                <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Care records</th>
                <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Media / memory</th>
                <th className="whitespace-nowrap px-4 py-3" scope="col">Extras</th>
                <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Owners</th>
                <th className="whitespace-nowrap px-4 py-3" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.definitions.map((plan) => (
                <tr className="bg-white" key={plan.id}>
                  <td className="px-4 py-3">
                    <span className="block font-black text-slate-950">{plan.name}</span>
                    <span className="block text-xs font-semibold text-slate-500">
                      Code: {plan.code}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge
                      tone={
                        plan.isArchived
                          ? "soft"
                          : plan.status === "Available"
                            ? "mint"
                            : plan.status === "Disabled"
                              ? "danger"
                              : "warm"
                      }
                    >
                      {plan.isArchived
                        ? "Archived"
                        : planStatusLabels[plan.status] ?? plan.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-bold text-slate-800">{plan.priceLabel}</span>
                    {plan.billingNote ? (
                      <span className="block text-xs font-semibold text-slate-500">
                        {plan.billingNote}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">
                    {plan.maxPets}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">
                    {plan.maxMemoriesPerPet}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">
                    {plan.maxCareRecords}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">
                    {plan.maxMediaPerMemory}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block min-w-44 text-xs font-semibold text-slate-600">
                      {[
                        plan.allowsSmartTagAddOns ? "Smart Tag add-ons" : null,
                        plan.allowsFoundReports ? "Found reports" : null,
                        plan.allowsAdvancedThemes ? "Advanced themes" : null,
                        plan.scanHistoryDays > 0 ? `${plan.scanHistoryDays}-day scan history` : null,
                        plan.maxFamilyMembers > 0 ? `${plan.maxFamilyMembers} family members` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Core safety features"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-slate-900">
                    {plan.ownerCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                      href={adminRoutes.ownerPlansForPlan(plan.code)}
                    >
                      View Owners
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}

// --- Owner plans ---------------------------------------------------------------

type QueryShape = ReturnType<typeof useAdminTableQuery>;

function OwnerPlansSection({
  query,
  actions,
  hasActiveFilters,
  definitions,
}: {
  query: QueryShape["query"];
  actions: QueryShape["actions"];
  hasActiveFilters: boolean;
  definitions: AdminPlanDefinition[];
}) {
  const filters = useMemo<AdminFilterDef[]>(
    () => [
      {
        type: "select",
        key: "plan",
        label: "Plan",
        options:
          definitions.length > 0
            ? definitions.map((plan) => ({ value: plan.code, label: plan.name }))
            : [
                { value: "Free", label: "Free Plan" },
                { value: "Premium", label: "Premium Plan" },
              ],
      },
      { type: "select", key: "petUsage", label: "Pet Usage", options: usageOptions },
      { type: "select", key: "memoryUsage", label: "Memory Usage", options: usageOptions },
      {
        type: "select",
        key: "hasOverride",
        label: "Manual Override",
        options: [
          { value: "true", label: "Has override" },
          { value: "false", label: "No override" },
        ],
      },
      { type: "date-range", key: "assigned", label: "Effective", advanced: true },
      { type: "date-range", key: "updated", label: "Updated", advanced: true },
    ],
    [definitions]
  );

  const params = useMemo<AdminOwnerPlanListParams>(
    () => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      plan: query.filters.plan,
      petUsage: query.filters.petUsage,
      memoryUsage: query.filters.memoryUsage,
      hasOverride: query.filters.hasOverride,
      assignedFrom: dateOnlyOrUndefined(query.filters.assignedFrom),
      assignedTo: dateOnlyOrUndefined(query.filters.assignedTo),
      updatedFrom: dateOnlyOrUndefined(query.filters.updatedFrom),
      updatedTo: dateOnlyOrUndefined(query.filters.updatedTo),
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    }),
    [query]
  );

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [state, setState] = useState<{
    key: string;
    items: AdminOwnerPlan[];
    total: number;
    counts: AdminOwnerPlanCounts;
    error: string;
  } | null>(null);
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
    key: paramsKey,
    ids: new Set(),
  });
  const [detachedDetail, setDetachedDetail] = useState<AdminOwnerPlan | null>(null);
  const [message, setMessage] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const request = JSON.parse(paramsKey) as AdminOwnerPlanListParams;
    const key = `${paramsKey}#${reloadKey}`;

    Promise.all([
      listAdminOwnerPlans(request, controller.signal),
      countAdminOwnerPlans(request, controller.signal),
    ])
      .then(([list, counts]) => {
        if (!controller.signal.aborted) {
          setState({ key, items: list.items, total: list.total, counts, error: "" });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setState({
            key,
            items: [],
            total: 0,
            counts: zeroCounts,
            error: "We couldn't load owner plans. Please try again.",
          });
        }
      });

    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  const current = state?.key === fetchKey ? state : null;
  const items = useMemo(() => current?.items ?? [], [current]);
  const selectedIds = selection.key === paramsKey ? selection.ids : new Set<string>();
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: paramsKey, ids });
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  const openOwnerId = actions.getExtraParam("ownerPlan");
  const openOwner =
    items.find((item) => item.ownerUserId === openOwnerId) ??
    (detachedDetail?.ownerUserId === openOwnerId ? detachedDetail : null);

  // Deep links (e.g. from the Owners page) can point at a row outside the
  // current page; load its summary on demand.
  useEffect(() => {
    if (!openOwnerId || items.some((item) => item.ownerUserId === openOwnerId)) {
      return;
    }

    const controller = new AbortController();
    getAdminOwnerPlanDetail(openOwnerId, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) {
          setDetachedDetail(detail.item);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("This owner plan record could not be opened.");
          actions.setExtraParam("ownerPlan", null);
        }
      });
    return () => controller.abort();
  }, [actions, items, openOwnerId]);

  async function exportRows(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true);
    setMessage("");

    try {
      await downloadAdminOwnerPlansExport(
        params,
        format,
        scope === "selected" ? [...selectedIds] : undefined
      );
      setMessage(`Owner plan ${format === "xlsx" ? "Excel" : "CSV"} export is ready.`);
    } catch {
      setMessage("We couldn't prepare this export. Please try again.");
    } finally {
      setExportBusy(false);
    }
  }

  const rowActions = (item: AdminOwnerPlan): AdminRowAction[] => [
    { label: "View Owner", href: adminRoutes.owner(item.ownerUserId) },
    { label: "View Pet Profiles", href: adminRoutes.petsForOwner(item.ownerUserId) },
    { label: "View Orders", href: adminRoutes.ordersForOwner(item.ownerUserId) },
    { label: "View Smart Tags", href: adminRoutes.smartTagsForOwner(item.ownerUserId) },
  ];

  const columns: AdminColumn<AdminOwnerPlan>[] = [
    {
      id: "owner",
      header: "Owner",
      sortId: "owner",
      cell: (item) => (
        <span className="block min-w-40">
          <span className="block font-black text-slate-950">{item.displayName}</span>
          <span className="block break-all text-xs font-semibold text-slate-500">{item.email}</span>
        </span>
      ),
    },
    {
      id: "plan",
      header: "Plan",
      sortId: "plan",
      cell: (item) => (
        <span className="block min-w-28">
          <span className="block font-bold text-slate-800">{item.planName}</span>
          <span className="block text-xs font-semibold text-slate-500">
            {planStatusLabels[item.planStatus] ?? item.planStatus} · Assigned
          </span>
        </span>
      ),
    },
    {
      id: "pets",
      header: "Pet Usage",
      sortId: "petUsage",
      cell: (item) => (
        <span className="block min-w-28">
          <span className="font-black text-slate-900">
            {item.activePetCount} / {item.maxPets}
          </span>
          <Badge tone={usageTone[item.petUsageState]}>
            {usageStateLabels[item.petUsageState]}
          </Badge>
        </span>
      ),
    },
    {
      id: "memories",
      header: "Memory Usage",
      sortId: "memoryUsage",
      cell: (item) => (
        <span className="block min-w-32">
          <span className="font-black text-slate-900">
            {item.highestMemoriesOnPet} / {item.maxMemoriesPerPet}
            <span className="ms-1 text-xs font-semibold text-slate-500">busiest pet</span>
          </span>
          <Badge tone={usageTone[item.memoryUsageState]}>
            {usageStateLabels[item.memoryUsageState]}
          </Badge>
        </span>
      ),
    },
    {
      id: "careRecords",
      header: "Care Records",
      sortId: "careRecords",
      align: "right",
      hideable: true,
      defaultHidden: true,
      cell: (item) => (
        <span className="font-black text-slate-900">{item.careRecordCount}</span>
      ),
    },
    {
      id: "override",
      header: "Override",
      hideable: true,
      cell: (item) =>
        item.hasOverride || item.grandfathered ? (
          <Badge tone="warm">{item.grandfathered && !item.hasOverride ? "Legacy" : "Override"}</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      id: "assignedAt",
      header: "Effective",
      sortId: "assignedAt",
      hideable: true,
      cell: (item) => formatAdminDate(item.assignedAt),
    },
    {
      id: "updatedAt",
      header: "Updated",
      sortId: "updatedAt",
      cell: (item) => formatAdminDateTime(item.updatedAt),
    },
    {
      id: "actions",
      header: "More",
      cell: (item) => (
        <AdminRowActionMenu
          actions={rowActions(item)}
          label={`More actions for ${item.displayName}, ${item.email}`}
        />
      ),
    },
  ];

  const bulkActions: AdminBulkAction[] = [
    {
      id: "export-selected-csv",
      label: "Export selected CSV",
      onClick: () => void exportRows("csv", "selected"),
      disabled: exportBusy,
    },
    ...(getAdminOwnerPlanExportFormats().includes("xlsx")
      ? [
          {
            id: "export-selected-xlsx",
            label: "Export selected Excel",
            onClick: () => void exportRows("xlsx", "selected"),
            disabled: exportBusy,
          },
        ]
      : []),
  ];
  const counts = current?.counts ?? zeroCounts;

  return (
    <AdminSection
      description="Which plan each owner is on and how their pets, memories, and care records compare to that plan's limits."
      title="Owner plans"
    >
      <AdminFilterBar
        endSlot={
          <AdminExportMenu
            busy={exportBusy}
            formats={getAdminOwnerPlanExportFormats()}
            onExport={(format, scope) => void exportRows(format, scope)}
            selectedCount={selectedIds.size}
          />
        }
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        onClearAll={actions.clearAllFilters}
        onFilterChange={actions.setFilter}
        onFiltersChange={actions.setFilters}
        searchSlot={
          <AdminSearchInput
            onChange={actions.setSearch}
            placeholder="Search owner, email, or plan…"
            value={query.search}
          />
        }
        values={query.filters}
      />
      <div
        aria-label="Owner plan summary"
        className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-5"
      >
        <SummaryCount label="All owners" value={counts.all} />
        <SummaryCount label="Near pet limit" value={counts.nearPetLimit} />
        <SummaryCount label="At pet limit" value={counts.atPetLimit} />
        <SummaryCount label="Over pet limit" value={counts.overPetLimit} />
        <SummaryCount label="Manual overrides" value={counts.withOverride} />
      </div>
      {message ? (
        <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]" role="status">
          {message}
        </p>
      ) : null}
      <AdminDataTable
        columns={columns}
        emptyDescription={
          hasActiveFilters
            ? "Clear filters to review every owner's plan."
            : "Owner plans will appear once owners register."
        }
        emptyTitle={
          hasActiveFilters ? "No owner plans match these filters." : "No owner plans yet."
        }
        error={current?.error || undefined}
        loading={!current}
        onPageChange={actions.setPage}
        onPageSizeChange={actions.setPageSize}
        onRetry={refresh}
        onRowOpen={(item) => actions.setExtraParam("ownerPlan", item.ownerUserId)}
        onSelectedIdsChange={setSelectedIds}
        onSortChange={actions.setSort}
        page={query.page}
        pageSize={query.pageSize}
        rowKey={(item) => item.ownerUserId}
        rowOpenLabel="View Plan Details"
        rows={items}
        selectable
        selectedIds={selectedIds}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        stickyFirstColumn
        total={current?.total ?? 0}
      />
      <AdminBulkActionBar
        actions={bulkActions}
        busy={exportBusy}
        onClearSelection={() => setSelectedIds(new Set())}
        selectedCount={selectedIds.size}
      />
      {openOwner ? (
        <AdminOwnerPlanDetailDrawer
          key={openOwner.ownerUserId}
          onClose={() => actions.setExtraParam("ownerPlan", null)}
          summary={openOwner}
        />
      ) : null}
    </AdminSection>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-xl bg-white px-3 py-2 font-semibold text-slate-600">
      <strong className="me-1 text-slate-950">{value}</strong>
      {label}
    </span>
  );
}
