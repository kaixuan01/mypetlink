"use client";

import { dateOnlyOrUndefined, isGuid } from "@/lib/adminListShared";
import { useEffect, useMemo, useState } from "react";
import { AdminOrderDetailDrawer } from "@/components/admin/AdminOrderDetailDrawer";
import { AdminSection } from "@/components/admin/AdminPanels";
import { TagAssignmentModal, type TagAssignmentMode } from "@/components/admin/TagAssignmentModal";
import { formatAdminDate, getTagTypeLabel } from "@/components/admin/adminDisplay";
import { AdminBulkActionBar } from "@/components/admin/table/AdminBulkActionBar";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminExportMenu, type AdminExportFormat } from "@/components/admin/table/AdminExportMenu";
import { AdminFilterBar, type AdminFilterDef } from "@/components/admin/table/AdminFilterBar";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminOrderAction } from "@/lib/orders";
import {
  countAdminOrders,
  downloadAdminOrdersExport,
  fulfilmentStatusLabels,
  getAdminOrderExportFormats,
  getAdminOrderSummary,
  listAdminOrders,
  paymentStatusLabels,
  type AdminOrder,
  type AdminOrderCounts,
  type AdminOrderDetail,
  type AdminOrderListParams,
} from "@/services/adminOrderService";
import { listTagInventory } from "@/services/adminTagInventoryService";
import {
  listShippingCourierOptions,
  type ShippingCourierOption,
} from "@/services/adminShippingFulfilmentService";
import { isAbortError } from "@/services/apiClient";
import {
  adminAssignInventoryTag,
  adminCancelOrder,
  adminChangeAssignedTag,
  adminConfirmOrderPayment,
  adminMarkOrderDelivered,
  adminMarkOrderPreparing,
  adminMarkOrderReadyToShip,
  adminMarkOrderShipped,
  adminUpdateShipment,
  adminRejectOrderPayment,
  adminReplaceTag,
  getFriendlyTagErrorMessage,
} from "@/services/tagService";
import type { PetTag } from "@/types";

const filterKeys = [
  "stage",
  "paymentStatus",
  "fulfilmentStatus",
  "hasProof",
  "paymentMethod",
  "type",
  "variant",
  "assigned",
  "tracking",
  "owner",
  "ownerId",
  "pet",
  "orderNumber",
  "location",
  "amountMin",
  "amountMax",
  "createdFrom",
  "createdTo",
  "updatedFrom",
  "updatedTo",
  "proofSubmittedFrom",
  "proofSubmittedTo",
  "paymentConfirmedFrom",
  "paymentConfirmedTo",
  "shippedFrom",
  "shippedTo",
  "deliveredFrom",
  "deliveredTo",
] as const;

const filterDefs: AdminFilterDef[] = [
  {
    type: "select",
    key: "paymentStatus",
    label: "Payment",
    options: Object.entries(paymentStatusLabels).map(([value, label]) => ({ value, label })),
  },
  { type: "text", key: "paymentMethod", label: "Payment method", advanced: true },
  {
    type: "select",
    key: "fulfilmentStatus",
    label: "Fulfilment",
    options: Object.entries(fulfilmentStatusLabels).map(([value, label]) => ({ value, label })),
  },
  {
    type: "select",
    key: "hasProof",
    label: "Payment proof",
    options: [
      { value: "true", label: "Submitted" },
      { value: "false", label: "Not submitted" },
    ],
  },
  {
    type: "select",
    key: "type",
    label: "Tag type",
    options: [
      { value: "QR", label: "QR Pet Tag" },
      { value: "QR_NFC", label: "QR + NFC Smart Tag" },
    ],
  },
  {
    type: "select",
    key: "variant",
    label: "Variant",
    advanced: true,
    options: [
      { value: "Lightweight", label: "Lightweight Tag" },
      { value: "Standard", label: "Standard Tag" },
    ],
  },
  {
    type: "select",
    key: "assigned",
    label: "Assigned tag",
    advanced: true,
    options: [
      { value: "true", label: "Assigned" },
      { value: "false", label: "Awaiting assignment" },
    ],
  },
  {
    type: "select",
    key: "tracking",
    label: "Tracking",
    advanced: true,
    options: [
      { value: "true", label: "Has tracking number" },
      { value: "false", label: "No tracking number" },
    ],
  },
  { type: "text", key: "owner", label: "Customer", placeholder: "Name, email, phone", advanced: true },
  { type: "text", key: "pet", label: "Pet", advanced: true },
  { type: "text", key: "orderNumber", label: "Order number", placeholder: "MPL-ORD-…", advanced: true },
  { type: "text", key: "location", label: "Delivery city / state", advanced: true },
  { type: "text", key: "amountMin", label: "Minimum amount", advanced: true },
  { type: "text", key: "amountMax", label: "Maximum amount", advanced: true },
  { type: "date-range", key: "created", label: "Created", advanced: true },
  { type: "date-range", key: "updated", label: "Updated", advanced: true },
  { type: "date-range", key: "proofSubmitted", label: "Proof submitted", advanced: true },
  { type: "date-range", key: "paymentConfirmed", label: "Payment confirmed", advanced: true },
  { type: "date-range", key: "shipped", label: "Shipped", advanced: true },
  { type: "date-range", key: "delivered", label: "Delivered", advanced: true },
];

const emptyCounts: AdminOrderCounts = {
  all: 0,
  awaitingPayment: 0,
  paymentReview: 0,
  readyToPrepare: 0,
  preparing: 0,
  readyToShip: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
};

const shortcuts: { value: string; label: string; count: keyof AdminOrderCounts }[] = [
  { value: "", label: "All", count: "all" },
  { value: "awaiting-payment", label: "Awaiting Payment", count: "awaitingPayment" },
  { value: "payment-review", label: "Payment Review", count: "paymentReview" },
  { value: "ready-to-prepare", label: "Ready to Prepare", count: "readyToPrepare" },
  { value: "preparing", label: "Preparing", count: "preparing" },
  { value: "ready-to-ship", label: "Ready to Ship", count: "readyToShip" },
  { value: "shipped", label: "Shipped", count: "shipped" },
  { value: "delivered", label: "Delivered", count: "delivered" },
  { value: "cancelled", label: "Cancelled", count: "cancelled" },
];

type PendingAction = { action: Exclude<AdminOrderAction, "assign-tag" | "change-tag" | "replace-tag">; detail: AdminOrderDetail };

export function AdminOrdersManager() {
  const { query, actions, hasActiveFilters } = useAdminTableQuery({
    filterKeys,
    defaultSortBy: "createdAt",
    allowedSortIds: [
      "orderNumber",
      "createdAt",
      "updatedAt",
      "customer",
      "amount",
      "paymentStatus",
      "proofSubmittedAt",
      "paymentConfirmedAt",
      "fulfilmentStatus",
      "shippedAt",
      "deliveredAt",
    ],
    allowedFilterValues: {
      stage: shortcuts.map((item) => item.value).filter(Boolean),
      paymentStatus: Object.keys(paymentStatusLabels),
      fulfilmentStatus: Object.keys(fulfilmentStatusLabels),
      hasProof: ["true", "false"],
      type: ["QR", "QR_NFC"],
      variant: ["Lightweight", "Standard"],
      assigned: ["true", "false"],
      tracking: ["true", "false"],
    },
  });

  const listParams = useMemo<AdminOrderListParams>(() => ({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || undefined,
    stage: query.filters.stage,
    paymentStatus: query.filters.paymentStatus,
    fulfilmentStatus: query.filters.fulfilmentStatus,
    hasProof: query.filters.hasProof,
    paymentMethod: query.filters.paymentMethod,
    tagType: query.filters.type,
    variant: query.filters.variant,
    hasAssignedTag: query.filters.assigned,
    hasTracking: query.filters.tracking,
    owner: query.filters.owner,
    ownerId: isGuid(query.filters.ownerId) ? query.filters.ownerId : undefined,
    pet: query.filters.pet,
    orderNumber: query.filters.orderNumber,
    deliveryLocation: query.filters.location,
    amountMin: query.filters.amountMin,
    amountMax: query.filters.amountMax,
    createdFrom: dateOnlyOrUndefined(query.filters.createdFrom),
    createdTo: dateOnlyOrUndefined(query.filters.createdTo),
    updatedFrom: dateOnlyOrUndefined(query.filters.updatedFrom),
    updatedTo: dateOnlyOrUndefined(query.filters.updatedTo),
    proofSubmittedFrom: dateOnlyOrUndefined(query.filters.proofSubmittedFrom),
    proofSubmittedTo: dateOnlyOrUndefined(query.filters.proofSubmittedTo),
    paymentConfirmedFrom: dateOnlyOrUndefined(query.filters.paymentConfirmedFrom),
    paymentConfirmedTo: dateOnlyOrUndefined(query.filters.paymentConfirmedTo),
    shippedFrom: dateOnlyOrUndefined(query.filters.shippedFrom),
    shippedTo: dateOnlyOrUndefined(query.filters.shippedTo),
    deliveredFrom: dateOnlyOrUndefined(query.filters.deliveredFrom),
    deliveredTo: dateOnlyOrUndefined(query.filters.deliveredTo),
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  }), [query]);

  const paramsKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchKey = `${paramsKey}:${reloadKey}`;
  const [state, setState] = useState<{
    key: string;
    items: AdminOrder[];
    total: number;
    counts: AdminOrderCounts;
    error: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionScope, setSelectionScope] = useState(paramsKey);
  if (selectionScope !== paramsKey) {
    setSelectionScope(paramsKey);
    setSelectedIds(new Set());
  }
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [courierOptions, setCourierOptions] = useState<ShippingCourierOption[]>([]);
  const [courierOption, setCourierOption] = useState("OTHER");
  const [historicalCourier, setHistoricalCourier] = useState<ShippingCourierOption | null>(null);
  const [customCourier, setCustomCourier] = useState("");
  const [courierService, setCourierService] = useState("");
  const [actualCourierCost, setActualCourierCost] = useState("");
  const [shippingNotes, setShippingNotes] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [tagModal, setTagModal] = useState<{ mode: TagAssignmentMode; detail: AdminOrderDetail; tags: Array<PetTag & { productVariantId?: string }> } | null>(null);
  const [detachedOrder, setDetachedOrder] = useState<AdminOrder | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = JSON.parse(paramsKey) as AdminOrderListParams;
    Promise.all([
      listAdminOrders(params, controller.signal),
      countAdminOrders(params, controller.signal),
    ])
      .then(([list, counts]) => {
        if (!controller.signal.aborted) setState({ key: fetchKey, items: list.items, total: list.total, counts, error: "" });
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setState({ key: fetchKey, items: [], total: 0, counts: emptyCounts, error: "We couldn't load tag orders. Please try again." });
        }
      });
    return () => controller.abort();
  }, [fetchKey, paramsKey]);

  useEffect(() => {
    let active = true;
    void listShippingCourierOptions()
      .then((options) => {
        if (active) setCourierOptions(options);
      })
      .catch(() => {
        if (active) setCourierOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = state?.key !== fetchKey;
  const items = useMemo(
    () => (state?.key === fetchKey ? state.items : []),
    [fetchKey, state]
  );
  const total = state?.key === fetchKey ? state.total : 0;
  const counts = state?.key === fetchKey ? state.counts : emptyCounts;
  const listError = state?.key === fetchKey ? state.error : "";
  const openOrderId = actions.getExtraParam("order");

  useEffect(() => {
    if (!openOrderId || items.some((item) => item.id === openOrderId || item.orderNumber === openOrderId)) {
      return;
    }
    const controller = new AbortController();
    getAdminOrderSummary(openOrderId, controller.signal)
      .then((order) => {
        if (!controller.signal.aborted) setDetachedOrder(order);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("This order could not be opened.");
      });
    return () => controller.abort();
  }, [items, openOrderId]);

  const openOrder = items.find((item) => item.id === openOrderId || item.orderNumber === openOrderId)
    ?? (detachedOrder && (detachedOrder.id === openOrderId || detachedOrder.orderNumber === openOrderId) ? detachedOrder : null);

  function refresh() {
    setReloadKey((value) => value + 1);
  }

  async function runExport(format: AdminExportFormat, scope: "filtered" | "selected") {
    setExportBusy(true);
    try {
      await downloadAdminOrdersExport(listParams, format, scope === "selected" ? [...selectedIds] : undefined);
      setMessage(scope === "selected" ? `${selectedIds.size} selected order${selectedIds.size === 1 ? "" : "s"} exported.` : "Filtered tag orders exported.");
    } catch (caught) {
      setMessage(getFriendlyTagErrorMessage(caught));
    } finally {
      setExportBusy(false);
    }
  }

  async function requestAction(action: AdminOrderAction, detail: AdminOrderDetail) {
    setMessage("");
    if (action === "assign-tag" || action === "change-tag" || action === "replace-tag") {
      setBusy(true);
      try {
        const productVariantIds = [...new Set((detail.fulfilmentItems ?? []).map((item) => item.productVariantId).filter((id): id is string => Boolean(id)))];
        const inventories = productVariantIds.length
          ? await Promise.all(productVariantIds.map((productVariantId) => listTagInventory({ page: 1, pageSize: 100, status: "Unclaimed", productVariantId, sortBy: "tagCode", sortDir: "asc" })))
          : [await listTagInventory({
              page: 1,
              pageSize: 100,
              status: "Unclaimed",
              productVariantId: detail.productVariantId,
              tagType: detail.productVariantId ? undefined : detail.order.tagType.includes("NFC") ? "QR_NFC" : "QR",
              variant: detail.productVariantId ? undefined : detail.order.variant,
              sortBy: "tagCode",
              sortDir: "asc",
            })];
        const tags: Array<PetTag & { productVariantId?: string }> = inventories.flatMap((inventory) => inventory.items)
          .filter((tag) => tag.fulfilment === "Generated" || tag.fulfilment === "Printed")
          .map((tag) => ({
          id: tag.id,
          tagCode: tag.tagCode,
          productVariantId: tag.productVariantId,
          hasNfc: tag.hasNfc,
          variant: tag.variant,
          status: "Unassigned",
          batchNo: tag.batchNo,
          orderedDate: formatAdminDate(tag.generatedAt),
          }));
        setTagModal({ mode: action === "assign-tag" ? "assign" : action === "change-tag" ? "change" : "replace", detail, tags });
      } catch (caught) {
        setMessage(getFriendlyTagErrorMessage(caught));
      } finally {
        setBusy(false);
      }
      return;
    }

    setReason("");
    setTrackingNumber(detail.order.trackingNumber ?? "");
    const provider = detail.shipment.courierProvider ?? "";
    const providerCode = detail.shipment.courierProviderCode ?? "";
    const activeConfigured = courierOptions.find((item) => item.code === providerCode)
      ?? courierOptions.find((item) => item.displayName === provider);
    if (activeConfigured) {
      setHistoricalCourier(null);
      setCourierOption(activeConfigured.code);
      setCustomCourier("");
    } else if (providerCode && provider) {
      const historical = {
        code: providerCode,
        displayName: provider,
        isDefault: false,
        displayOrder: -1,
      };
      setHistoricalCourier(historical);
      setCourierOption(providerCode);
      setCustomCourier("");
    } else if (provider) {
      setHistoricalCourier(null);
      setCourierOption("OTHER");
      setCustomCourier(provider);
    } else {
      setHistoricalCourier(null);
      const preferred = courierOptions.find((item) => item.isDefault) ?? courierOptions[0];
      setCourierOption(preferred?.code ?? "OTHER");
      setCustomCourier("");
    }
    setCourierService(detail.shipment.courierService ?? "");
    setActualCourierCost(detail.shipment.actualCourierCost?.toString() ?? "");
    setShippingNotes(detail.shipment.shippingNotes ?? "");
    setDialogError("");
    setPendingAction({ action, detail });
  }

  async function confirmAction() {
    if (!pendingAction || busy) return;
    if ((pendingAction.action === "reject-payment" || pendingAction.action === "cancel-order") && !reason.trim()) {
      setDialogError("Enter a reason before continuing.");
      return;
    }
    const usesShipment =
      pendingAction.action === "edit-shipment" || pendingAction.action === "mark-shipped";
    const configuredCourier =
      courierOptions.find((item) => item.code === courierOption)
      ?? (historicalCourier?.code === courierOption ? historicalCourier : undefined);
    const courierProvider =
      courierOption === "OTHER" ? customCourier.trim() : configuredCourier?.displayName ?? "";
    const courierProviderCode =
      courierOption === "OTHER" ? undefined : configuredCourier?.code;
    if (usesShipment && (!courierProvider || !trackingNumber.trim())) {
      setDialogError("Enter a courier provider and tracking number before continuing.");
      return;
    }
    const parsedCost = actualCourierCost.trim() === "" ? undefined : Number(actualCourierCost);
    if (usesShipment && (parsedCost != null && (!Number.isFinite(parsedCost) || parsedCost < 0))) {
      setDialogError("Actual courier cost must be zero or more.");
      return;
    }

    setBusy(true);
    setDialogError("");
    try {
      const id = pendingAction.detail.order.id;
      const result = pendingAction.action === "confirm-payment"
        ? await adminConfirmOrderPayment(id)
        : pendingAction.action === "reject-payment"
          ? await adminRejectOrderPayment(id, reason)
          : pendingAction.action === "mark-preparing"
            ? await adminMarkOrderPreparing(id, pendingAction.detail.shipment.rowVersion)
            : pendingAction.action === "mark-ready-to-ship"
              ? await adminMarkOrderReadyToShip(id, pendingAction.detail.shipment.rowVersion)
              : pendingAction.action === "edit-shipment"
                ? await adminUpdateShipment(id, {
                    courierProviderCode,
                    courierProvider,
                    courierService: courierService.trim() || undefined,
                    trackingNumber: trackingNumber.trim(),
                    actualCourierCost: parsedCost,
                    shippingNotes: shippingNotes.trim() || undefined,
                    rowVersion: pendingAction.detail.shipment.rowVersion,
                  })
                : pendingAction.action === "mark-shipped"
                  ? await adminMarkOrderShipped(id, {
                      courierProviderCode,
                      courierProvider,
                      courierService: courierService.trim() || undefined,
                      trackingNumber: trackingNumber.trim(),
                      actualCourierCost: parsedCost,
                      shippingNotes: shippingNotes.trim() || undefined,
                      rowVersion: pendingAction.detail.shipment.rowVersion,
                    })
                  : pendingAction.action === "mark-delivered"
                    ? await adminMarkOrderDelivered(id, pendingAction.detail.shipment.rowVersion)
                : await adminCancelOrder(id, reason);
      if (!result.data) throw new Error("This action is no longer available for the order's current status.");
      setMessage(actionSuccess(pendingAction.action, pendingAction.detail.order.orderNumber ?? id));
      setPendingAction(null);
      setSelectedIds(new Set());
      refresh();
    } catch (caught) {
      setDialogError(getFriendlyTagErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitTag(input: { tagId: string; reason: string; note: string; orderItemId?: string; currentTagId?: string }) {
    if (!tagModal || busy) return;
    setBusy(true);
    try {
      const id = tagModal.detail.order.id;
      const result = tagModal.mode === "assign"
        ? await adminAssignInventoryTag(id, input.tagId, input.orderItemId)
        : tagModal.mode === "change"
          ? await adminChangeAssignedTag(id, input.tagId, input.reason, input.currentTagId)
          : await adminReplaceTag(id, input.tagId, input.reason, input.note, input.currentTagId);
      if (!result.data) throw new Error("This tag action is no longer available for the order's current status.");
      setMessage(tagModal.mode === "assign" ? "Inventory tag assigned." : tagModal.mode === "change" ? "Assigned tag changed." : "Replacement tag issued.");
      setTagModal(null);
      refresh();
    } catch (caught) {
      setMessage(getFriendlyTagErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<AdminOrder>[] = [
    {
      id: "orderNumber",
      header: "Order number",
      sortId: "orderNumber",
      cell: (order) => (
        <button className="max-w-64 text-left font-bold text-[#1b4f9c] underline-offset-2 hover:underline" onClick={() => actions.setExtraParam("order", order.id)} type="button">
          <span className="block whitespace-nowrap">{order.orderNumber}</span>
          {order.receiptNumber ? (
            <span className="block break-all font-mono text-[11px] text-slate-500">
              {order.receiptNumber}
            </span>
          ) : null}
        </button>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      sortId: "customer",
      cell: (order) => <span className="block min-w-32"><span className="block font-bold text-slate-900">{order.ownerName}</span><span className="block text-xs text-slate-500">{order.ownerEmail}</span></span>,
    },
    { id: "pet", header: "Pet", cell: (order) => <span className="whitespace-nowrap text-slate-600">{order.petName}</span> },
    { id: "item", header: "Item", cell: (order) => <div className="min-w-40"><p className="font-semibold text-slate-700">{order.productName ?? getTagTypeLabel(order.hasNfc)}</p><p className="font-mono text-xs text-slate-500">{order.sku ?? `${order.variant} Tag`}</p></div> },
    { id: "amount", header: "Amount", sortId: "amount", cell: (order) => <span className="whitespace-nowrap font-bold text-slate-700">{order.currency} {(order.amount + order.deliveryFee).toFixed(2)}</span> },
    {
      id: "paymentStatus",
      header: "Payment",
      sortId: "paymentStatus",
      cell: (order) => <Badge tone={order.paymentStatus === "Confirmed" ? "mint" : order.paymentStatus === "Rejected" ? "danger" : "warm"}>{paymentStatusLabels[order.paymentStatus]}</Badge>,
    },
    {
      id: "proof",
      header: "Payment proof",
      sortId: "proofSubmittedAt",
      cell: (order) => <span className="whitespace-nowrap text-slate-600">{order.hasPaymentProof ? order.latestPaymentProofStatus?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? "Submitted" : "—"}</span>,
    },
    {
      id: "fulfilmentStatus",
      header: "Fulfilment",
      sortId: "fulfilmentStatus",
      cell: (order) => <Badge tone={order.fulfilmentStatus === "Delivered" ? "mint" : order.fulfilmentStatus === "Cancelled" ? "danger" : "teal"}>{fulfilmentStatusLabels[order.fulfilmentStatus]}</Badge>,
    },
    { id: "assignedTag", header: "Assigned tag", cell: (order) => <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-600">{order.assignedTagCode ?? "—"}</span> },
    { id: "createdAt", header: "Created", sortId: "createdAt", cell: (order) => <span className="whitespace-nowrap text-slate-600">{formatAdminDate(order.createdAt)}</span> },
    { id: "updatedAt", header: "Updated", sortId: "updatedAt", hideable: true, defaultHidden: true, cell: (order) => <span className="whitespace-nowrap text-slate-600">{formatAdminDate(order.updatedAt)}</span> },
    { id: "tracking", header: "Tracking", hideable: true, defaultHidden: true, cell: (order) => <span className="whitespace-nowrap text-slate-600">{order.trackingNumber ?? "—"}</span> },
  ];

  const dialog = dialogCopy(pendingAction?.action);

  return (
    <AdminSection title="Tag orders" description="Review payments and move paid orders through tag assignment, preparation, shipping, and delivery.">
      <div className="overflow-x-auto border-b border-slate-200 px-4 pt-3">
        <div className="flex min-w-max gap-1" aria-label="Order stage shortcuts">
          {shortcuts.map((shortcut) => (
            <button
              aria-current={(query.filters.stage ?? "") === shortcut.value ? "page" : undefined}
              className={`min-h-10 rounded-t-xl px-3 text-xs font-extrabold ${(query.filters.stage ?? "") === shortcut.value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              key={shortcut.label}
              onClick={() => actions.setFilter("stage", shortcut.value || null)}
              type="button"
            >
              {shortcut.label} <span className="opacity-70">{loading ? "…" : counts[shortcut.count]}</span>
            </button>
          ))}
        </div>
      </div>

      <AdminFilterBar
        endSlot={<AdminExportMenu busy={exportBusy} formats={getAdminOrderExportFormats()} onExport={(format, scope) => void runExport(format, scope)} selectedCount={selectedIds.size} />}
        filters={filterDefs}
        hasActiveFilters={hasActiveFilters}
        onClearAll={actions.clearAllFilters}
        onFilterChange={actions.setFilter}
        onFiltersChange={actions.setFilters}
        searchSlot={<AdminSearchInput onChange={actions.setSearch} placeholder="Search order, customer, pet, tag, tracking…" value={query.search} />}
        values={query.filters}
      />

      {message ? <p className="px-4 pt-3 text-sm font-bold text-[#1b4f9c]" role="status">{message}</p> : null}

      <AdminDataTable
        columns={columns}
        emptyDescription={hasActiveFilters ? "Try changing or clearing the filters above." : "New customer tag orders will appear here."}
        emptyTitle={hasActiveFilters ? "No orders match these filters." : "No tag orders yet."}
        error={listError || undefined}
        loading={loading}
        onPageChange={actions.setPage}
        onPageSizeChange={actions.setPageSize}
        onRetry={refresh}
        onRowOpen={(order) => actions.setExtraParam("order", order.id)}
        onSelectedIdsChange={setSelectedIds}
        onSortChange={actions.setSort}
        page={query.page}
        pageSize={query.pageSize}
        rowKey={(order) => order.id}
        rowOpenLabel="View"
        rows={items}
        selectable
        selectedIds={selectedIds}
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        stickyFirstColumn
        total={total}
      />

      <AdminBulkActionBar
        actions={[{ id: "export-selected", label: "Export selected CSV", onClick: () => void runExport("csv", "selected"), tone: "primary" }]}
        busy={exportBusy}
        onClearSelection={() => setSelectedIds(new Set())}
        selectedCount={selectedIds.size}
      />

      {openOrder ? (
        <AdminOrderDetailDrawer
          busy={busy}
          onAction={(action, detail) => void requestAction(action, detail)}
          onClose={() => actions.setExtraParam("order", null)}
          refreshKey={reloadKey}
          summary={openOrder}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel={busy ? "Working…" : dialog.confirmLabel}
        confirmDisabled={busy}
        destructive={pendingAction?.action === "reject-payment" || pendingAction?.action === "cancel-order"}
        message={dialog.message}
        onCancel={() => !busy && setPendingAction(null)}
        onConfirm={() => void confirmAction()}
        open={pendingAction !== null}
        title={dialog.title}
      >
        {pendingAction?.action === "reject-payment" || pendingAction?.action === "cancel-order" ? (
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Reason
            <textarea className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-slate-400" maxLength={600} onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        ) : pendingAction?.action === "mark-shipped" || pendingAction?.action === "edit-shipment" ? (
          <div className="grid gap-3 text-sm font-bold text-slate-700">
            <label className="grid gap-1">
              Courier provider
              <select className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold outline-none focus:border-slate-400" onChange={(event) => setCourierOption(event.target.value)} value={courierOption}>
                {historicalCourier && !courierOptions.some((item) => item.code === historicalCourier.code) ? (
                  <option value={historicalCourier.code}>{historicalCourier.displayName} (inactive or historical)</option>
                ) : null}
                {courierOptions.map((courier) => (
                  <option key={courier.code} value={courier.code}>
                    {courier.displayName}{courier.isDefault ? " (default)" : ""}
                  </option>
                ))}
                <option value="OTHER">Other</option>
              </select>
            </label>
            {courierOption === "OTHER" ? (
              <label className="grid gap-1">
                Courier name
                <input className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold outline-none focus:border-slate-400" maxLength={120} onChange={(event) => setCustomCourier(event.target.value)} value={customCourier} />
              </label>
            ) : null}
            <label className="grid gap-1">
              Courier service (optional)
              <input className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold outline-none focus:border-slate-400" maxLength={120} onChange={(event) => setCourierService(event.target.value)} value={courierService} />
            </label>
            <label className="grid gap-1">
              Tracking number
              <input className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold outline-none focus:border-slate-400" maxLength={120} onChange={(event) => setTrackingNumber(event.target.value)} value={trackingNumber} />
            </label>
            <label className="grid gap-1">
              Actual courier cost (internal)
              <input className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold outline-none focus:border-slate-400" min="0" onChange={(event) => setActualCourierCost(event.target.value)} step="0.01" type="number" value={actualCourierCost} />
            </label>
            <label className="grid gap-1">
              Shipping notes (internal)
              <textarea className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold outline-none focus:border-slate-400" maxLength={1000} onChange={(event) => setShippingNotes(event.target.value)} value={shippingNotes} />
            </label>
          </div>
        ) : null}
        {dialogError ? <p className="mt-2 text-sm font-bold text-red-700" role="alert">{dialogError}</p> : null}
      </ConfirmDialog>

      {tagModal ? (
        <TagAssignmentModal
          availableTags={tagModal.tags}
          busy={busy}
          currentTag={tagModal.detail.order.tagId ? { id: tagModal.detail.order.tagId, tagCode: tagModal.detail.backendOrder?.smartTagCode ?? "Assigned tag", hasNfc: tagModal.detail.order.tagType.includes("NFC"), variant: tagModal.detail.order.variant, status: tagModal.detail.order.status === "Delivered" ? "Delivered" : "Preparing" } : undefined}
          fulfilmentItems={tagModal.detail.fulfilmentItems}
          mode={tagModal.mode}
          onCancel={() => !busy && setTagModal(null)}
          onSubmit={(input) => void submitTag(input)}
          order={tagModal.detail.order}
          ownerName={tagModal.detail.owner.name}
          petName={tagModal.detail.order.petName ?? "Pet profile"}
        />
      ) : null}
    </AdminSection>
  );
}

function dialogCopy(action?: PendingAction["action"]) {
  if (action === "confirm-payment") return { title: "Confirm this payment?", message: "The latest submitted proof will be approved and fulfilment can begin.", confirmLabel: "Confirm payment" };
  if (action === "reject-payment") return { title: "Reject this payment proof?", message: "The owner will be asked to submit a new proof. The reason is required.", confirmLabel: "Reject proof" };
  if (action === "mark-preparing") return { title: "Start preparing this tag?", message: "The assigned inventory tag will move into preparation.", confirmLabel: "Start preparing" };
  if (action === "mark-ready-to-ship") return { title: "Mark this order ready to ship?", message: "Confirm that the tag is prepared, packed, and ready for courier handover.", confirmLabel: "Mark ready to ship" };
  if (action === "edit-shipment") return { title: "Save shipment details?", message: "Courier cost and shipping notes stay visible to administrators only.", confirmLabel: "Save shipment" };
  if (action === "mark-shipped") return { title: "Mark this order shipped?", message: "Confirm the courier and tracking details. The order will be recorded as handed to the courier.", confirmLabel: "Mark shipped" };
  if (action === "mark-delivered") return { title: "Mark this order delivered?", message: "The delivery timestamp and tag status will be updated.", confirmLabel: "Mark delivered" };
  if (action === "cancel-order") return { title: "Cancel this order?", message: "Unshipped assigned stock will return to available inventory. The reason is required and recorded in the audit history.", confirmLabel: "Cancel order" };
  return { title: "Confirm action", message: "Review this order before continuing.", confirmLabel: "Confirm" };
}

function actionSuccess(action: PendingAction["action"], orderNumber: string) {
  const result: Record<PendingAction["action"], string> = {
    "confirm-payment": "Payment confirmed",
    "reject-payment": "Payment proof rejected",
    "mark-preparing": "Preparation started",
    "mark-ready-to-ship": "Order marked ready to ship",
    "edit-shipment": "Shipment details saved",
    "mark-shipped": "Order marked shipped",
    "mark-delivered": "Order marked delivered",
    "cancel-order": "Order cancelled",
  };
  return `${result[action]} for ${orderNumber}.`;
}
