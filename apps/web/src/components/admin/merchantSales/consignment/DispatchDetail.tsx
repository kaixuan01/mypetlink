"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStat, AdminStatStrip, AdminStatusBadge } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";
import { dateTime, fieldClass, primaryButton, secondaryButton } from "../shared";
import type { ConsignmentContext, ConsignmentPermissions } from "./context";
import {
  dispatchStages,
  dispatchStatusLabel,
  dispatchTone,
  errorMessage,
  percentLabel,
  statusLabel,
  unitReference,
} from "./model";
import { GenerateDeliveryOrderDialog } from "./GenerateDeliveryOrderDialog";
import { BackLink, Callout, dangerButton, SelectField, StatusPill, TextField, WorkflowStepper } from "./ui";

type Movement = "return" | "release" | "external-handover" | "correct-handover" | "reverse-handover" | "write-off";

const movements: {
  action: Movement;
  title: string;
  button: string;
  description: string;
  permission: keyof ConsignmentPermissions;
  single?: boolean;
}[] = [
  {
    action: "return",
    title: "Receive returned tags",
    button: "Receive selected returns",
    description: "Unsold tags the partner sent back. They go to inspection, never straight to available stock.",
    permission: "returns",
  },
  {
    action: "release",
    title: "Release inspected returns",
    button: "Release inspected returns",
    description: "Returned tags that passed a fresh physical inspection go back to available stock.",
    permission: "release",
  },
  {
    action: "external-handover",
    title: "Record customer handover",
    button: "Record external customer handover",
    description: "One tag per unique tracker entry. A reported sale stays unverified and creates no invoice, commission or settlement.",
    permission: "reconcile",
    single: true,
  },
  {
    action: "correct-handover",
    title: "Correct a handover",
    button: "Correct current handover record",
    description: "Records a corrected entry under a new reference. The original record is kept.",
    permission: "reconcile",
    single: true,
  },
  {
    action: "reverse-handover",
    title: "Reverse a handover",
    button: "Reverse current handover record",
    description: "Marks the current handover as reversed. It does not undo customer ownership or activation.",
    permission: "reconcile",
    single: true,
  },
  {
    action: "write-off",
    title: "Write off failed returns",
    button: "Write off failed returned stock",
    description: "Only returned tags that failed inspection or need review. Missing stock stays under discrepancy investigation.",
    permission: "writeOff",
  },
];

const receivingActions: api.CustodyAction[] = ["receive", "record-discrepancy", "resolve-discrepancy"];
type Panel = "dispatch" | "receipt" | "movement";

export function DispatchDetail({
  context,
  dispatchId,
  onBack,
}: {
  context: ConsignmentContext;
  dispatchId: string;
  onBack: () => void;
}) {
  const { can, actions, policy, reloadKey } = context;
  const [record, setRecord] = useState<api.ConsignmentDispatch | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [taskError, setTaskError] = useState<{ panel: Panel; message: string } | null>(null);
  const [shipmentReference, setShipmentReference] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [receipt, setReceipt] = useState({ recipient: "", receivedAt: "", signedEvidenceReference: "" });
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [movement, setMovement] = useState<Movement | null>(null);
  const [handover, setHandover] = useState({
    eventReference: "",
    eventAt: "",
    isReportedSale: false,
    sellingPrice: null as number | null,
    discountAmount: null as number | null,
    discountDescription: "",
  });
  const [attribution, setAttribution] = useState<api.HandoverAttribution | "">("");
  const [returnBucket, setReturnBucket] = useState<"Sellable" | "Unsellable">("Sellable");
  const [generatingDeliveryOrder, setGeneratingDeliveryOrder] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getDispatch(dispatchId)
      .then((value) => {
        if (!active) return;
        setRecord(value);
        setLoadError("");
      })
      .catch((e) => {
        if (active) setLoadError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [dispatchId, reloadKey]);

  if (!record || record.id !== dispatchId) {
    return (
      <div className="grid gap-3">
        <BackLink label="All deliveries" onClick={onBack} />
        <AdminSection title="Delivery">
          <div className="p-5">
            {loadError ? (
              <Callout role="alert" tone="critical">
                {loadError}
              </Callout>
            ) : (
              <p className="text-sm font-semibold text-slate-500" role="status">
                Loading delivery…
              </p>
            )}
          </div>
        </AdminSection>
      </div>
    );
  }

  const d = record;
  // Tracking is decided per unit: one delivery can hold units received before tracking began and
  // units counted since. Older responses without per-unit state fall back to the delivery's flag.
  const unitTracked = (u: api.CustodyUnit) => u.stockTracked ?? Boolean(d.stockTracked);
  const selectedUnits = d.units.filter((u) => selected.includes(u.id));
  const selectionTracked = selectedUnits.length ? selectedUnits.every(unitTracked) : Boolean(d.stockTracked);
  const selectionAnyTracked = selectedUnits.length ? selectedUnits.some(unitTracked) : Boolean(d.stockTracked);
  const busy = actions.busy;
  const sent = d.status !== "Reserved" && d.status !== "Cancelled";
  const receiving = can.reconcile && (d.status === "Dispatched" || d.hasOpenDiscrepancy);
  const availableMovements = sent ? movements.filter((m) => can[m.permission]) : [];
  const activeMovement = availableMovements.find((m) => m.action === movement) ?? null;
  const selectable = availableMovements.length > 0;
  const findings = (finding: string) => d.units.filter((u) => choices[u.id] === finding).length;
  const fail = (panel: Panel, message: string) => setTaskError({ panel, message });

  function confirm(action: api.CustodyAction, label: string, reference: string, panel: Panel) {
    setTaskError(null);
    if (!reference.trim()) {
      fail(
        panel,
        panel === "dispatch"
          ? "Enter the courier or shipment reference first."
          : panel === "receipt"
            ? "Enter the receipt acknowledgment reference first."
            : "Enter the reason or tracker entry reference first."
      );
      return;
    }
    if (["return", "release", "external-handover", "correct-handover", "reverse-handover", "write-off"].includes(action) && selected.length === 0) {
      fail(panel, "Select the affected units first.");
      return;
    }
    const evidence: api.ActionEvidence = {};
    if (receivingActions.includes(action)) {
      if (!receipt.recipient.trim() || !receipt.receivedAt || receipt.signedEvidenceReference.trim().length < 5) {
        fail(panel, "Enter the actual recipient, receipt date, quantities and signed evidence reference.");
        return;
      }
      // Mirrors the server: a receipt cannot predate dispatch or lie in the future.
      const receivedAt = new Date(receipt.receivedAt).getTime();
      if (Number.isNaN(receivedAt) || (d.dispatchedAt && receivedAt < Date.parse(d.dispatchedAt)) || receivedAt > Date.now() + 120000) {
        fail(
          panel,
          d.dispatchedAt
            ? `The receipt date must be on or after dispatch (${dateTime(d.dispatchedAt)}) and not in the future.`
            : "The receipt date cannot be in the future."
        );
        return;
      }
      const ids = (finding: string) => d.units.filter((u) => choices[u.id] === finding).map((u) => u.id);
      const goodUnitIds = ids("Good");
      const damagedUnitIds = ids("Damaged");
      const missingUnitIds = ids("Missing");
      const returnedUnitIds = ids("Returned");
      if (!goodUnitIds.length && !damagedUnitIds.length && !missingUnitIds.length && !returnedUnitIds.length) {
        fail(panel, "Choose the actual receiving finding for each affected unit.");
        return;
      }
      evidence.receipt = {
        ...receipt,
        receivedAt: new Date(receipt.receivedAt).toISOString(),
        quantity: goodUnitIds.length + damagedUnitIds.length,
        damagedQuantity: damagedUnitIds.length,
        missingQuantity: missingUnitIds.length,
        goodUnitIds,
        damagedUnitIds,
        missingUnitIds,
        returnedUnitIds,
      };
    }
    if (action === "external-handover" || action === "correct-handover" || action === "reverse-handover") {
      if (selected.length !== 1 || !handover.eventReference.trim() || !handover.eventAt) {
        fail(panel, "Select one unit and enter a unique external entry reference and event date.");
        return;
      }
      const reversal = action === "reverse-handover";
      // Tracked partners report sales by SKU, so an identified handover carries no price.
      const sale = !reversal && !selectionTracked && handover.isReportedSale;
      if (selectionTracked && action === "external-handover" && !attribution) {
        fail(panel, "Say whether this tag is one of the partner’s reported sales or left without a sale.");
        return;
      }
      evidence.handover = {
        ...handover,
        eventAt: new Date(handover.eventAt).toISOString(),
        isReportedSale: sale,
        sellingPrice: sale ? handover.sellingPrice : null,
        discountAmount: sale ? handover.discountAmount : null,
        discountDescription: sale ? handover.discountDescription || null : null,
        supersedesRecordId: action === "external-handover" ? null : (d.units.find((u) => u.id === selected[0])?.currentHandoverRecordId ?? null),
        ...(selectionTracked && action === "external-handover" && attribution ? { attribution } : {}),
      };
    }
    if (action === "return" && selectionAnyTracked) evidence.returnFromBucket = returnBucket;
    actions.request({
      title: `${label}?`,
      message: `${d.dispatchNumber} · ${d.merchantName}. ${
        action === "dispatch"
          ? "This confirms stock custody only and creates no invoice, sale or commission."
          : "The reference and affected units will be retained in the activity history."
      }`,
      allowSelfReview: policy?.canSelfReview && receivingActions.includes(action),
      run: async ({ selfReview }) => {
        setRecord(await api.custodyAction(d, action, reference, selected, { ...evidence, ...(selfReview ? { selfReview } : {}) }));
        setSelected([]);
        setShipmentReference("");
        setReceiptReference("");
        setMovementReference("");
        setAttribution("");
        setChoices({});
      },
    });
  }

  function cancelReservation() {
    actions.request({
      title: "Cancel reservation?",
      message: `${d.dispatchNumber} · ${d.merchantName}. The ${d.units.length} reserved tags return to central availability. Nothing has been sent.`,
      destructive: true,
      confirmLabel: "Cancel reservation",
      reason: { label: "Reason for cancelling", hint: "Kept in the delivery’s activity history." },
      run: async ({ reason }) => {
        setRecord(await api.custodyAction(d, "cancel", reason, selected, {}));
        setSelected([]);
      },
    });
  }

  const error = (panel: Panel) =>
    taskError?.panel === panel ? (
      <div className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
        {taskError.message}
      </div>
    ) : null;

  const good = d.units.filter((u) => u.status === "Received" && u.receivingState === "Good").length;
  const damaged = d.units.filter((u) => u.receivingState === "Damaged").length;
  const missing = d.units.filter((u) => u.receivingState === "Missing").length;
  const unconfirmed = d.units.filter((u) => u.status === "Dispatched" && u.receivingState === "Unconfirmed").length;

  return (
    <div className="grid gap-4">
      <BackLink label="All deliveries" onClick={onBack} />
      {generatingDeliveryOrder ? (
        <GenerateDeliveryOrderDialog
          actions={actions}
          dispatch={d}
          onClose={() => setGeneratingDeliveryOrder(false)}
          onIssued={(order) => setRecord((current) => (current && current.id === d.id ? { ...current, deliveryOrder: order } : current))}
          open
        />
      ) : null}

      <section aria-labelledby="dispatch-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{d.merchantName}</p>
              <h3 className="mt-1 break-words font-mono text-xl font-black text-slate-950" id="dispatch-title">
                {d.dispatchNumber}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill tone={dispatchTone(d.status)}>{dispatchStatusLabel(d.status)}</StatusPill>
                {d.hasOpenDiscrepancy ? <AdminStatusBadge tone="critical">Discrepancy open</AdminStatusBadge> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {d.deliveryOrder ? (
                <button
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => void actions.work(async () => { await api.downloadConsignment(d.id, "delivery-order.pdf"); }, `Delivery Order ${d.deliveryOrder?.deliveryOrderNumber} downloaded.`, { refresh: false })}
                  title="Download the Delivery Order for signing"
                  type="button"
                >
                  Download DO
                </button>
              ) : sent && can.dispatch ? (
                <button className={secondaryButton} disabled={busy} onClick={() => setGeneratingDeliveryOrder(true)} title="Generate the Delivery Order for signing" type="button">
                  Generate DO
                </button>
              ) : null}
              {d.hasIssuedDocument ? (
                <button
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => void actions.work(async () => { await api.downloadConsignment(d.id, "dispatch-note.pdf"); }, "Issued dispatch note downloaded.", { refresh: false })}
                  type="button"
                >
                  Download Dispatch Note
                </button>
              ) : null}
              {can.exportRecords ? (
                <>
                  <button
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() => void actions.work(async () => setRecord(await api.getDispatch(d.id, true)), "Controlled manifest opened.", { refresh: false })}
                    type="button"
                  >
                    View Tag Codes
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() => void actions.work(async () => { await api.downloadConsignment(d.id, "manifest.csv"); }, "Controlled manifest downloaded.", { refresh: false })}
                    type="button"
                  >
                    Download controlled manifest
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Info label="Agreement">
              {d.agreementReference} v{d.agreementVersion} · {percentLabel(d.commissionPercentage)} partner commission
            </Info>
            <Info label="Destination">{d.destination}</Info>
            <Info label="External tracker">{d.externalTrackerReference}</Info>
            <Info label="Dispatched">
              {d.dispatchedAt ? `${dateTime(d.dispatchedAt)}${d.shipmentReference ? ` · ${d.shipmentReference}` : ""}` : "Not yet"}
            </Info>
            {d.deliveryOrder ? (
              <Info label="Delivery Order">
                {d.deliveryOrder.deliveryOrderNumber} · {d.deliveryOrder.deliveredQuantity}{" "}
                {d.deliveryOrder.deliveredQuantity === 1 ? "tag" : "tags"} · generated {dateTime(d.deliveryOrder.issuedAt)}
                {d.deliveryOrder.signatoryName
                  ? ` · Delivered By signed by ${d.deliveryOrder.signatoryName}${d.deliveryOrder.signatoryPosition ? `, ${d.deliveryOrder.signatoryPosition}` : ""}`
                  : " · unsigned"}
              </Info>
            ) : null}
            {d.recipientName || d.partnerReceivedAt ? (
              <Info label="Partner receipt">
                {[d.recipientName, d.partnerReceivedAt ? dateTime(d.partnerReceivedAt) : null].filter(Boolean).join(" · ")}
              </Info>
            ) : null}
          </dl>
          {!d.hasIssuedDocument && d.status === "Reserved" ? (
            <p className="text-xs text-slate-500">The dispatch note is issued when physical dispatch is confirmed.</p>
          ) : null}

          {d.status === "Cancelled" ? (
            <Callout tone="info">This reservation was cancelled. Its tags returned to central availability.</Callout>
          ) : (
            <WorkflowStepper label="Delivery progress" stages={dispatchStages(d)} />
          )}
        </div>
      </section>

      {d.hasOpenDiscrepancy ? (
        <Callout title="Delivery discrepancy open" tone="critical">
          Delivery discrepancy remains open for the affected units. Confirmed good units can proceed. Customer handovers remain
          blocked for missing, damaged and unconfirmed units.
        </Callout>
      ) : null}
      {d.activatedWithoutExternalReference > 0 ? (
        <Callout role="status" tone="warning">
          {d.activatedWithoutExternalReference} activated tags still need an external handover reference. Check the tracker;
          activation is not proof of sale.
        </Callout>
      ) : null}

      <div className="grid gap-2">
        <AdminStatStrip>
          <AdminStat label="Awaiting dispatch" tone="info" value={d.reserved} />
          <AdminStat label="Partner custody" tone="info" value={d.partnerHeld} />
          <AdminStat label="Return inspection" tone="warning" value={d.returnedQuarantine} />
          <AdminStat label="Customer handovers" tone="positive" value={d.externalHandovers} />
          <AdminStat label="Released" value={d.released} />
          <AdminStat label="Written off" tone="critical" value={d.writtenOff} />
        </AdminStatStrip>
        {sent ? (
          <p className="px-1 text-xs font-semibold text-slate-500">
            Receiving: {good} confirmed good at partner · {damaged} damaged under review · {missing} missing under review ·{" "}
            {unconfirmed} not yet confirmed
          </p>
        ) : null}
      </div>

      {d.status === "Reserved" && (can.dispatch || can.allocate) ? (
        <TaskPanel
          description="Send the reserved tags, then confirm here. The dispatch note is issued at this point."
          title="Next step: confirm physical dispatch"
        >
          {can.dispatch ? (
            <TextField
              hint="The courier tracking number or handover reference. Exclude customer personal details."
              label="Courier or shipment reference"
              onChange={setShipmentReference}
              requirement="required"
              value={shipmentReference}
            />
          ) : null}
          {error("dispatch")}
          <div className="flex flex-wrap gap-2">
            {can.dispatch ? (
              <button className={primaryButton} disabled={busy} onClick={() => confirm("dispatch", "Confirm dispatch", shipmentReference, "dispatch")} type="button">
                Confirm dispatch
              </button>
            ) : null}
            {can.allocate ? (
              <button className={dangerButton} disabled={busy} onClick={cancelReservation} type="button">
                Cancel reservation
              </button>
            ) : null}
          </div>
        </TaskPanel>
      ) : null}

      {receiving ? (
        <TaskPanel
          description={
            d.hasOpenDiscrepancy
              ? "Record what the partner actually found for the affected units, with new supporting evidence."
              : "Record the partner’s actual signed count. Choose a finding for each unit in the table below — missing or damaged units stay open for investigation."
          }
          title={d.hasOpenDiscrepancy ? "Next step: review the delivery discrepancy" : "Next step: record partner receipt"}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Actual partner recipient"
              onChange={(value) => setReceipt((r) => ({ ...r, recipient: value }))}
              placeholder="Name on signed receipt"
              requirement="required"
              value={receipt.recipient}
            />
            <TextField
              hint={d.dispatchedAt ? `On or after dispatch: ${dateTime(d.dispatchedAt)}.` : undefined}
              label="Actual receipt date"
              onChange={(value) => setReceipt((r) => ({ ...r, receivedAt: value }))}
              requirement="required"
              type="datetime-local"
              value={receipt.receivedAt}
            />
            <TextField
              hint="Reference to the retained signed receipt or count."
              label="Signed receipt / evidence reference"
              onChange={(value) => setReceipt((r) => ({ ...r, signedEvidenceReference: value }))}
              requirement="required"
              value={receipt.signedEvidenceReference}
            />
            <TextField
              hint="Exclude customer personal details."
              label="Receipt acknowledgment reference"
              onChange={setReceiptReference}
              requirement="required"
              value={receiptReference}
            />
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-700">
              Counts cover only units with a finding: {findings("Good") + findings("Damaged")} counted (including {findings("Damaged")} damaged),{" "}
              {findings("Missing")} missing, {findings("Returned")} physically returned.
            </p>
            {unconfirmed > 0 ? (
              <button
                className={secondaryButton}
                disabled={busy}
                onClick={() =>
                  setChoices(Object.fromEntries(d.units.filter((u) => u.status === "Dispatched" && u.receivingState === "Unconfirmed").map((u) => [u.id, "Good"])))
                }
                type="button"
              >
                Mark all unconfirmed units good
              </button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-slate-500">
            {policy?.mode === "Solo"
              ? "Solo Mode: the authorized founder may self-review with new supporting evidence. Review actual returns separately; never count them at the partner."
              : "Team Mode: the reviewer must not have dispatched this stock or recorded the unit’s discrepancy. Review actual returns separately; never count them at the partner."}
          </p>
          {error("receipt")}
          <div className="flex flex-wrap gap-2">
            {d.status === "Dispatched" ? (
              <button
                className={d.hasOpenDiscrepancy ? secondaryButton : primaryButton}
                disabled={busy}
                onClick={() => confirm("receive", "Acknowledge receipt", receiptReference, "receipt")}
                type="button"
              >
                Acknowledge receipt
              </button>
            ) : null}
            {d.hasOpenDiscrepancy ? (
              <button className={primaryButton} disabled={busy} onClick={() => confirm("resolve-discrepancy", "Review selected discrepancy outcomes", receiptReference, "receipt")} type="button">
                Review selected discrepancy outcomes
              </button>
            ) : null}
            <button className={secondaryButton} disabled={busy} onClick={() => confirm("record-discrepancy", "Record delivery discrepancy", receiptReference, "receipt")} type="button">
              Record delivery discrepancy
            </button>
          </div>
        </TaskPanel>
      ) : null}

      <AdminSection
        compact
        description={
          d.units.some((u) => u.tagCode)
            ? "Tag Codes are shown because you opened the controlled manifest. Keep them private."
            : "Tag Codes stay hidden. Units are identified by their custody reference."
        }
        title={`Units (${d.units.length})`}
      >
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                {selectable ? <th className="w-12 px-4 py-2.5">Select</th> : null}
                <th className="px-4 py-2.5">Tag / Unit</th>
                <th className="px-4 py-2.5">SKU / Batch</th>
                <th className="px-4 py-2.5">Custody</th>
                <th className="px-4 py-2.5">Inspection</th>
                <th className="px-4 py-2.5">External reference</th>
                <th className="px-4 py-2.5">Receiving</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.units.map((u) => (
                <tr className={selected.includes(u.id) ? "bg-[#f0f7ff]" : undefined} key={u.id}>
                  {selectable ? (
                    <td className="px-4 py-2.5">
                      <input
                        aria-label={`Select ${u.unitReference}`}
                        checked={selected.includes(u.id)}
                        className="h-4 w-4"
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.id] : s.filter((id) => id !== u.id)))}
                        type="checkbox"
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-900">
                    {u.tagCode ?? u.unitReference}
                    {u.isActivated ? <span className="ml-2 font-sans text-[0.7rem] font-extrabold text-[#166b48]">Activated</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {u.sku} / {u.batch ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{statusLabel(u.status)}</td>
                  <td className="px-4 py-2.5">{statusLabel(u.qaStatus)}</td>
                  <td className="px-4 py-2.5 text-xs">{u.externalReference ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-bold text-slate-700">{statusLabel(u.receivingState)}</span>
                    {receiving ? (
                      <select
                        aria-label={`Receiving finding for ${u.unitReference}`}
                        className={`${fieldClass} mt-1 !min-h-9 text-xs`}
                        onChange={(e) => setChoices((c) => ({ ...c, [u.id]: e.target.value }))}
                        value={choices[u.id] ?? ""}
                      >
                        <option value="">No new finding</option>
                        <option value="Good">Received good / located good</option>
                        <option value="Damaged">Received damaged</option>
                        <option value="Missing">Missing</option>
                        <option value="Returned">Physical return reviewed</option>
                      </select>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      {availableMovements.length > 0 ? (
        <TaskPanel
          description="Returns, customer handovers and write-offs for units with the partner. Select the affected units in the table above."
          title="Record a stock movement"
        >
          <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <legend className="sr-only">Movement type</legend>
            {availableMovements.map((m) => (
              <label
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition ${
                  movement === m.action ? "border-pet-teal bg-[#f0f7ff]" : "border-slate-200 hover:bg-slate-50"
                }`}
                key={m.action}
              >
                <input
                  checked={movement === m.action}
                  className="mt-1 h-4 w-4 shrink-0"
                  name="consignment-movement"
                  onChange={() => {
                    setMovement(m.action);
                    setTaskError(null);
                  }}
                  type="radio"
                />
                <span>
                  <span className="block font-black text-slate-900">{m.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">{m.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {activeMovement ? (
            <div className="grid gap-4 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-700">
                {selected.length} {selected.length === 1 ? "unit" : "units"} selected
                {activeMovement.single ? " · choose exactly one" : ""}
              </p>
              <TextField
                hint="Evidence or tracker entry reference. Exclude customer personal details."
                label="Reason or tracker entry reference"
                onChange={setMovementReference}
                requirement="required"
                value={movementReference}
              />
              {activeMovement.action === "return" && selectionAnyTracked ? (
                <SelectField
                  emptyLabel="Choose"
                  hint="Where the package was counted at the shop."
                  label="Returned from"
                  onChange={(value) => setReturnBucket(value === "Unsellable" ? "Unsellable" : "Sellable")}
                  options={[
                    { value: "Sellable", label: "Sellable shelf stock" },
                    { value: "Unsellable", label: "Unsellable stock (damaged or opened)" },
                  ]}
                  value={returnBucket}
                />
              ) : null}
              {activeMovement.action.endsWith("handover") ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    hint="Unique tracker entry; corrections need a new reference."
                    label="Unique external event reference"
                    onChange={(value) => setHandover((h) => ({ ...h, eventReference: value }))}
                    requirement="required"
                    value={handover.eventReference}
                  />
                  <TextField
                    label="Actual handover / correction date"
                    onChange={(value) => setHandover((h) => ({ ...h, eventAt: value }))}
                    requirement="required"
                    type="datetime-local"
                    value={handover.eventAt}
                  />
                  {selectionTracked && activeMovement.action === "external-handover" ? (
                    <fieldset className="grid gap-2 sm:col-span-2">
                      <legend className="mb-1 text-sm font-black text-slate-800">What happened to this tag?</legend>
                      {(
                        [
                          ["AggregateSale", "It is one of the partner’s reported sales", "Identifies a sale already verified in a sales report. It isn’t counted again."],
                          ["NonSaleWithdrawal", "It left the shop without a sale", "For example a display sample. It comes off the shelf stock."],
                        ] as const
                      ).map(([value, title, description]) => (
                        <label
                          className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${attribution === value ? "border-pet-teal bg-[#f0f7ff]" : "border-slate-200"}`}
                          key={value}
                        >
                          <input
                            checked={attribution === value}
                            className="mt-1 h-4 w-4 shrink-0"
                            name="handover-attribution"
                            onChange={() => setAttribution(value)}
                            type="radio"
                          />
                          <span>
                            <span className="block font-black text-slate-900">{title}</span>
                            <span className="block text-xs leading-5 text-slate-500">{description}</span>
                          </span>
                        </label>
                      ))}
                      <p className="text-xs text-slate-500">This partner’s sales and prices are recorded in sales reports, not per tag.</p>
                    </fieldset>
                  ) : null}
                  {activeMovement.action !== "reverse-handover" && !selectionTracked ? (
                    <label className="flex items-start gap-3 text-sm font-semibold text-slate-800 sm:col-span-2">
                      <input
                        checked={handover.isReportedSale}
                        className="mt-1 h-4 w-4"
                        onChange={(e) => setHandover((h) => ({ ...h, isReportedSale: e.target.checked }))}
                        type="checkbox"
                      />
                      Includes an unverified externally reported sale
                    </label>
                  ) : null}
                  {handover.isReportedSale && activeMovement.action !== "reverse-handover" && !selectionTracked ? (
                    <>
                      <TextField
                        inputMode="decimal"
                        label="Actual selling price (MYR)"
                        max="999999.99"
                        min="0"
                        onChange={(v) => setHandover((h) => ({ ...h, sellingPrice: v === "" ? null : Number(v) }))}
                        step="0.01"
                        type="number"
                        value={handover.sellingPrice === null ? "" : String(handover.sellingPrice)}
                      />
                      <TextField
                        hint="Zero if none."
                        inputMode="decimal"
                        label="Discount amount (MYR)"
                        max="999999.99"
                        min="0"
                        onChange={(v) => setHandover((h) => ({ ...h, discountAmount: v === "" ? null : Number(v) }))}
                        step="0.01"
                        type="number"
                        value={handover.discountAmount === null ? "" : String(handover.discountAmount)}
                      />
                      <div className="sm:col-span-2">
                        <TextField
                          label="Discount explanation"
                          onChange={(v) => setHandover((h) => ({ ...h, discountDescription: v }))}
                          requirement="optional"
                          value={handover.discountDescription}
                        />
                      </div>
                      <p className="text-xs text-slate-500 sm:col-span-2">
                        Reported sale details are unverified. They create no invoice, commission or settlement.
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}
              {error("movement")}
              <div>
                <button
                  className={activeMovement.action === "write-off" ? dangerButton : primaryButton}
                  disabled={
                    busy ||
                    (activeMovement.action === "correct-handover" || activeMovement.action === "reverse-handover"
                      ? selected.length !== 1
                      : selected.length === 0)
                  }
                  onClick={() => confirm(activeMovement.action, activeMovement.button, movementReference, "movement")}
                  type="button"
                >
                  {activeMovement.button}
                </button>
              </div>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-slate-500">
            Returns remain unavailable until a fresh physical inspection passes and an authorized administrator releases them.
            Customer-owned tags cannot use this stock-return process.
          </p>
        </TaskPanel>
      ) : null}

      <AdminSection compact title="History">
        <div className="divide-y divide-slate-100">
          <HistorySection count={d.history.length} title="Custody activity">
            <ul className="divide-y divide-slate-100">
              {d.history.map((h, i) => (
                <li className="grid gap-1 py-3" key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-black text-slate-900">{statusLabel(h.action)}</span>
                    <span className="text-xs text-slate-500">{dateTime(h.occurredAt)}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {h.unitId ? d.units.find((u) => u.id === h.unitId)?.unitReference ?? unitReference(h.unitId) : "Whole delivery"} ·{" "}
                    {h.actorName ?? "Administrator"} · Reference {h.reference}
                  </p>
                  {h.reviewMode ? (
                    <span>
                      <AdminStatusBadge tone="warning">{h.reviewMode}</AdminStatusBadge>
                    </span>
                  ) : null}
                  {h.evidenceJson ? <p className="text-xs text-slate-500">{receiptSummary(h.evidenceJson)}</p> : null}
                </li>
              ))}
            </ul>
          </HistorySection>
          {d.reviews?.length ? (
            <HistorySection count={d.reviews.length} title="Receiving review evidence">
              <ul className="divide-y divide-slate-100">
                {d.reviews.map((e) => (
                  <li className="grid gap-1 py-3 text-xs text-slate-600" key={e.id}>
                    <span>
                      <AdminStatusBadge tone="warning">{e.reviewMode}</AdminStatusBadge>
                    </span>
                    <span>
                      {dateTime(e.recordedAt)} · Reviewer {e.actorAdminUserId} · {e.reason} · Evidence {e.externalEvidenceReference}
                    </span>
                  </li>
                ))}
              </ul>
            </HistorySection>
          ) : null}
          <HistorySection count={d.reconciliation.length} title="External reconciliation history">
            <ul className="divide-y divide-slate-100">
              {d.reconciliation.map((h) => (
                <li className="py-3 text-xs text-slate-600" key={h.id}>
                  <span className="font-bold text-slate-900">{h.eventReference}</span> · {h.kind} · {dateTime(h.eventAt)} ·{" "}
                  {d.units.find((u) => u.id === h.unitId)?.unitReference ?? unitReference(h.unitId)} ·{" "}
                  {h.isReportedSale
                    ? `Reported MYR ${h.sellingPrice?.toFixed(2)}; discount MYR ${h.discountAmount?.toFixed(2)}`
                    : "Custody evidence"}{" "}
                  · {h.verificationStatus} · {h.evidenceReference}
                </li>
              ))}
            </ul>
            <p className="pb-3 text-xs text-slate-500">
              Corrections and reversals retain their originals. Reversal does not undo customer ownership or activation.
            </p>
          </HistorySection>
        </div>
      </AdminSection>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-extrabold uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

function TaskPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-2xl border-2 border-[#cfe3ff] bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h3 className="text-base font-black text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function HistorySection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="group px-4 sm:px-5">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-sm font-black text-slate-800">
        <span>{title}</span>
        <span className="text-xs font-bold text-slate-400">{count === 0 ? "None yet" : `${count} ${count === 1 ? "entry" : "entries"}`}</span>
      </summary>
      {count === 0 ? <p className="pb-3 text-xs text-slate-500">Nothing recorded yet.</p> : children}
    </details>
  );
}

function receiptSummary(json: string) {
  try {
    const e = JSON.parse(json) as {
      ReceivingState?: string;
      Recipient?: string;
      Quantity?: number;
      DamagedQuantity?: number;
      MissingQuantity?: number;
      SignedEvidenceReference?: string;
    };
    if (e.ReceivingState) return `Receiving finding: ${statusLabel(e.ReceivingState)}`;
    return `${e.Recipient ?? "Recipient"}: ${e.Quantity ?? 0} counted, ${e.DamagedQuantity ?? 0} damaged, ${e.MissingQuantity ?? 0} missing · ${e.SignedEvidenceReference ?? ""}`;
  } catch {
    return "Receipt evidence retained.";
  }
}
