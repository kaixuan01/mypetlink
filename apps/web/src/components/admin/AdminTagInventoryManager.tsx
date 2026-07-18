"use client";

import { dateOnlyOrUndefined } from "@/lib/adminListShared";
import { useEffect, useMemo, useState } from "react";
import { AdminTagInventoryDetailDrawer } from "@/components/admin/AdminTagInventoryDetailDrawer";
import {
  AdminActionButton,
  AdminNotice,
  AdminSection,
} from "@/components/admin/AdminPanels";
import { getTagTypeLabel, tagStatusTone } from "@/components/admin/adminDisplay";
import {
  AdminBulkActionBar,
  type AdminBulkAction,
} from "@/components/admin/table/AdminBulkActionBar";
import {
  AdminDataTable,
  type AdminColumn,
} from "@/components/admin/table/AdminDataTable";
import {
  AdminFilterBar,
  type AdminFilterDef,
} from "@/components/admin/table/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import {
  AdminExportMenu,
  type AdminExportFormat,
} from "@/components/admin/table/AdminExportMenu";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  bulkActionRules,
  bulkUpdateTagInventory,
  canApplyBulkAction,
  downloadTagInventoryExport,
  fulfilmentLabels,
  getSupportedExportFormats,
  lifecycleLabel,
  listTagInventory,
  type AdminInventoryBulkAction,
  type AdminInventoryListParams,
  type AdminInventoryTag,
} from "@/services/adminTagInventoryService";
import { isAbortError } from "@/services/apiClient";
import {
  adminGenerateRetailTags,
  getFriendlyTagErrorMessage,
} from "@/services/tagService";
import type { TagFulfilmentStatus, TagVariant } from "@/types";

const variantOptions: TagVariant[] = ["Lightweight", "Standard"];

const filterKeys = [
  "status",
  "fulfilment",
  "type",
  "variant",
  "batch",
  "generatedFrom",
  "generatedTo",
  "code",
  "claimed",
  "reseller",
  "updatedFrom",
  "updatedTo",
] as const;

const filterDefs: AdminFilterDef[] = [
  {
    type: "select",
    key: "status",
    label: "Lifecycle",
    options: [
      { value: "Unclaimed", label: "Unclaimed" },
      { value: "Pending", label: "Pending" },
      { value: "Preparing", label: "Preparing" },
      { value: "Delivered", label: "Delivered" },
      { value: "Active", label: "Active" },
      { value: "Lost", label: "Lost" },
      { value: "Disabled", label: "Disabled" },
      { value: "Replaced", label: "Replaced" },
      { value: "archived", label: "Archived" },
    ],
  },
  {
    type: "select",
    key: "fulfilment",
    label: "Fulfilment",
    options: (Object.keys(fulfilmentLabels) as TagFulfilmentStatus[]).map(
      (value) => ({ value, label: fulfilmentLabels[value] })
    ),
  },
  {
    type: "select",
    key: "type",
    label: "Type",
    options: [
      { value: "QR", label: "QR Pet Tag" },
      { value: "QR_NFC", label: "QR + NFC Smart Tag" },
    ],
  },
  {
    type: "select",
    key: "variant",
    label: "Variant",
    options: variantOptions.map((value) => ({ value, label: `${value} Tag` })),
  },
  { type: "text", key: "batch", label: "Batch", placeholder: "BATCH-…" },
  { type: "date-range", key: "generated", label: "Generated" },
  { type: "text", key: "code", label: "Tag code", placeholder: "MPL-…", advanced: true },
  {
    type: "select",
    key: "claimed",
    label: "Linked to a pet",
    advanced: true,
    options: [
      { value: "true", label: "Linked" },
      { value: "false", label: "Not linked" },
    ],
  },
  { type: "text", key: "reseller", label: "Reseller", advanced: true },
  { type: "date-range", key: "updated", label: "Updated", advanced: true },
];

const fulfilmentTone: Record<
  TagFulfilmentStatus,
  "soft" | "teal" | "warm" | "mint"
> = {
  Generated: "soft",
  Printed: "teal",
  SentToReseller: "warm",
  Received: "mint",
  SentToOwner: "teal",
};

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

export function AdminTagInventoryManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "generatedAt",
  });

  const listParams = useMemo<AdminInventoryListParams>(
    () => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      tagCode: query.filters.code,
      batch: query.filters.batch,
      status: query.filters.status,
      fulfilment: query.filters.fulfilment,
      tagType: query.filters.type,
      variant: query.filters.variant,
      claimed: query.filters.claimed,
      reseller: query.filters.reseller,
      generatedFrom: dateOnlyOrUndefined(query.filters.generatedFrom),
      generatedTo: dateOnlyOrUndefined(query.filters.generatedTo),
      updatedFrom: dateOnlyOrUndefined(query.filters.updatedFrom),
      updatedTo: dateOnlyOrUndefined(query.filters.updatedTo),
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    }),
    [query]
  );

  const paramsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}#${reloadKey}`;
  const [listState, setListState] = useState<{
    key: string;
    items: AdminInventoryTag[];
    total: number;
    error: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionScope, setSelectionScope] = useState(paramsKey);

  // A new page, sort, or filter shows different rows; drop the old selection
  // so bulk actions always apply to visible, validated rows.
  if (selectionScope !== paramsKey) {
    setSelectionScope(paramsKey);
    setSelectedIds(new Set());
  }
  const [message, setMessage] = useState("");
  const [failureDetails, setFailureDetails] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] =
    useState<AdminInventoryBulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  // Generation form state.
  const [count, setCount] = useState(5);
  const [tagKind, setTagKind] = useState<"qr" | "nfc">("qr");
  const [variant, setVariant] = useState<TagVariant>("Standard");
  const [generateMessage, setGenerateMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const key = `${paramsKey}#${reloadKey}`;
    const params = JSON.parse(paramsKey) as AdminInventoryListParams;

    listTagInventory(params, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setListState({ key, items: result.items, total: result.total, error: "" });
      })
      .catch((caught) => {
        if (controller.signal.aborted || isAbortError(caught)) {
          return;
        }

        setListState({
          key,
          items: [],
          total: 0,
          error: "We couldn't load the tag inventory. Please try again.",
        });
      });

    return () => controller.abort();
  }, [paramsKey, reloadKey]);

  const loading = listState?.key !== fetchKey;
  const items = useMemo(
    () => (listState?.key === fetchKey ? listState.items : []),
    [listState, fetchKey]
  );
  const total = listState?.key === fetchKey ? listState.total : 0;
  const listError = listState?.key === fetchKey ? listState.error : "";

  const refresh = () => setReloadKey((key) => key + 1);

  const selectedRows = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const openTagId = actions.getExtraParam("tag");
  const openTag = openTagId
    ? items.find((item) => item.id === openTagId) ?? null
    : null;

  async function generate() {
    try {
      const result = await adminGenerateRetailTags(count, tagKind === "nfc", variant);
      setGenerateMessage(
        `${result.data.length} new ${tagKind === "nfc" ? "QR + NFC" : "QR"} ${variant} tag code${
          result.data.length === 1 ? "" : "s"
        } generated as unclaimed stock.`
      );
      refresh();
    } catch (caught) {
      setGenerateMessage(getFriendlyTagErrorMessage(caught));
    }
  }

  async function runBulkAction(action: AdminInventoryBulkAction) {
    setPendingBulkAction(null);
    setBulkBusy(true);
    setFailureDetails([]);

    try {
      const result = await bulkUpdateTagInventory(action, [...selectedIds]);
      const rule = bulkActionRules[action];

      setMessage(
        result.updatedCount > 0
          ? `${result.updatedCount} tag${result.updatedCount === 1 ? "" : "s"} updated to ${
              fulfilmentLabels[rule.to]
            }.${result.failures.length > 0 ? ` ${result.failures.length} could not be updated.` : ""}`
          : "No tags were updated."
      );
      setFailureDetails(
        result.failures
          .slice(0, 5)
          .map((failure) =>
            failure.tagCode ? `${failure.tagCode}: ${failure.reason}` : failure.reason
          )
          .concat(
            result.failures.length > 5
              ? [`…and ${result.failures.length - 5} more.`]
              : []
          )
      );
      setSelectedIds(new Set());
      refresh();
    } catch (caught) {
      setMessage(getFriendlyTagErrorMessage(caught));
    } finally {
      setBulkBusy(false);
    }
  }

  async function runExport(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true);

    try {
      await downloadTagInventoryExport(
        listParams,
        format,
        scope === "selected" ? [...selectedIds] : undefined
      );
      setMessage(
        scope === "selected"
          ? `${selectedIds.size} selected tag${selectedIds.size === 1 ? "" : "s"} exported.`
          : "Filtered tag inventory exported."
      );
      setFailureDetails([]);
    } catch (caught) {
      setMessage(getFriendlyTagErrorMessage(caught));
    } finally {
      setExportBusy(false);
    }
  }

  const columns: AdminColumn<AdminInventoryTag>[] = [
    {
      id: "tagCode",
      header: "Tag code",
      sortId: "tagCode",
      cell: (tag) => (
        <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-950">
          {tag.tagCode}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">
          {getTagTypeLabel(tag.hasNfc)}
        </span>
      ),
    },
    {
      id: "variant",
      header: "Variant",
      sortId: "variant",
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">{tag.variant}</span>
      ),
    },
    {
      id: "status",
      header: "Lifecycle",
      sortId: "status",
      cell: (tag) => (
        <Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>
          {lifecycleLabel(tag.status, tag.isArchived)}
        </Badge>
      ),
    },
    {
      id: "fulfilment",
      header: "Fulfilment",
      sortId: "fulfilment",
      cell: (tag) => (
        <Badge tone={fulfilmentTone[tag.fulfilment]}>
          {fulfilmentLabels[tag.fulfilment]}
        </Badge>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      sortId: "batch",
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">{tag.batchNo ?? "—"}</span>
      ),
    },
    {
      id: "generatedAt",
      header: "Generated",
      sortId: "generatedAt",
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">
          {formatDate(tag.generatedAt)}
        </span>
      ),
    },
    {
      id: "pet",
      header: "Linked pet",
      hideable: true,
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">
          {tag.petName ?? (tag.petId ? "Profile removed" : "Unclaimed")}
        </span>
      ),
    },
    {
      id: "owner",
      header: "Linked owner",
      hideable: true,
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">{tag.ownerName ?? "—"}</span>
      ),
    },
    {
      id: "updatedAt",
      header: "Updated",
      sortId: "updatedAt",
      hideable: true,
      defaultHidden: true,
      cell: (tag) => (
        <span className="whitespace-nowrap text-slate-600">
          {formatDate(tag.updatedAt)}
        </span>
      ),
    },
  ];

  const bulkActions: AdminBulkAction[] = (
    Object.keys(bulkActionRules) as AdminInventoryBulkAction[]
  ).map((action) => {
    const rule = bulkActionRules[action];
    const applicable =
      selectedRows.length > 0 &&
      selectedRows.every((row) => canApplyBulkAction(row, action));

    return {
      id: action,
      label: rule.label,
      tone: action === "mark-printed" ? "primary" : "neutral",
      disabled: !applicable,
      disabledReason: `Available when every selected tag is unclaimed ${fulfilmentLabels[
        rule.from
      ].toLowerCase()} stock.`,
      onClick: () => setPendingBulkAction(action),
    };
  });

  const pendingRule = pendingBulkAction ? bulkActionRules[pendingBulkAction] : null;

  return (
    <div className="grid gap-4">
      <AdminNotice>
        Retail tags start as Unclaimed stock: they have a tag code but no pet
        and no owner. A customer scans the tag, signs in or creates an account,
        links it to a pet, and the tag becomes Active. The fulfilment column
        tracks the physical journey separately: printing, reseller delivery,
        and shipments to owners.
      </AdminNotice>

      <AdminSection
        title="Generate tag codes"
        description="Create new unclaimed retail stock. Codes use the MPL-XXXX-XXXX format and are ready for QR printing."
      >
        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Quantity
            <input
              className="min-h-10 w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
              max={50}
              min={1}
              onChange={(event) => setCount(Number(event.target.value) || 1)}
              type="number"
              value={count}
            />
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Tag type
            <select
              className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) => setTagKind(event.target.value as "qr" | "nfc")}
              value={tagKind}
            >
              <option value="qr">QR Pet Tag</option>
              <option value="nfc">QR + NFC Smart Tag</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">
            Tag variant
            <select
              className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
              onChange={(event) => setVariant(event.target.value as TagVariant)}
              value={variant}
            >
              {variantOptions.map((option) => (
                <option key={option} value={option}>
                  {option} Tag
                </option>
              ))}
            </select>
          </label>
          <AdminActionButton onClick={() => void generate()} tone="primary">
            Generate Tag Codes
          </AdminActionButton>
        </div>
        {generateMessage ? (
          <p className="px-4 pb-4 text-sm font-bold text-[#1b4f9c]">{generateMessage}</p>
        ) : null}
      </AdminSection>

      <AdminSection
        title="Tag inventory"
        description="Search, filter, and manage the physical journey of every generated tag."
      >
        <AdminFilterBar
          endSlot={
            <AdminExportMenu
              busy={exportBusy}
              formats={getSupportedExportFormats()}
              onExport={(format, scope) => void runExport(format, scope)}
              selectedCount={selectedIds.size}
            />
          }
          filters={filterDefs}
          hasActiveFilters={hasActiveFilters}
          onClearAll={actions.clearAllFilters}
          onFilterChange={actions.setFilter}
          onFiltersChange={actions.setFilters}
          searchSlot={
            <AdminSearchInput
              onChange={actions.setSearch}
              placeholder="Search code, batch, pet, owner…"
              value={query.search}
            />
          }
          values={query.filters}
        />

        {message ? (
          <div className="px-4 pt-3">
            <p className="text-sm font-bold text-[#1b4f9c]">{message}</p>
            {failureDetails.length > 0 ? (
              <ul className="mt-1 grid gap-0.5 text-xs font-semibold text-[#a63c2e]">
                {failureDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <AdminDataTable
          columns={columns}
          emptyDescription={
            hasActiveFilters
              ? "Try changing or clearing the filters above."
              : "Generate tag codes to create unclaimed stock."
          }
          emptyTitle={
            hasActiveFilters ? "No tags match these filters." : "No retail stock yet."
          }
          error={listError || undefined}
          loading={loading}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
          onRetry={refresh}
          onRowOpen={(row) => actions.setExtraParam("tag", row.id)}
          onSelectedIdsChange={setSelectedIds}
          onSortChange={actions.setSort}
          page={query.page}
          pageSize={query.pageSize}
          rowKey={(row) => row.id}
          rowOpenLabel="Details"
          rows={items}
          selectable
          selectedIds={selectedIds}
          sortBy={query.sortBy}
          sortDir={query.sortDir}
          stickyFirstColumn
          total={total}
        />

        <AdminBulkActionBar
          actions={bulkActions}
          busy={bulkBusy}
          onClearSelection={() => setSelectedIds(new Set())}
          selectedCount={selectedIds.size}
        />
      </AdminSection>

      <ConfirmDialog
        confirmLabel={pendingRule ? pendingRule.label : "Confirm"}
        message={
          pendingRule
            ? `Update ${selectedIds.size} tag${selectedIds.size === 1 ? "" : "s"} from ${
                fulfilmentLabels[pendingRule.from]
              } to ${fulfilmentLabels[pendingRule.to]}? This only changes the fulfilment step — tag activation is not affected.`
            : ""
        }
        onCancel={() => setPendingBulkAction(null)}
        onConfirm={() => {
          if (pendingBulkAction) {
            void runBulkAction(pendingBulkAction);
          }
        }}
        open={pendingBulkAction !== null}
        title={pendingRule ? `${pendingRule.label}?` : ""}
      />

      {openTag ? (
        <AdminTagInventoryDetailDrawer
          onClose={() => actions.setExtraParam("tag", null)}
          tag={openTag}
        />
      ) : null}
    </div>
  );
}
