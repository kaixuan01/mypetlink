"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { canUseAdminApi } from "@/services/adminService";
import {
  createInventoryReceipt,
  getProfitabilityReport,
  listInventoryReceiptOptions,
  listInventoryReceipts,
  type InventoryReceipt,
  type InventoryReceiptSkuOption,
  type ProfitabilityReport,
  type ReceiptCostMode,
} from "@/services/adminInventoryCostingService";

const fieldClass = "min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-400";
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const money = (value: number) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(value);
const nextDay = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
};

export function AdminInventoryCostingPanel() {
  const connected = canUseAdminApi();
  const [options, setOptions] = useState<InventoryReceiptSkuOption[]>([]);
  const [receipts, setReceipts] = useState<InventoryReceipt[]>([]);
  const [variantId, setVariantId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [receivedAt, setReceivedAt] = useState(today());
  const [mode, setMode] = useState<ReceiptCostMode>("Simple");
  const [currency, setCurrency] = useState("MYR");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [goods, setGoods] = useState(0);
  const [freight, setFreight] = useState(0);
  const [customs, setCustoms] = useState(0);
  const [other, setOther] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<ProfitabilityReport | null>(null);

  const selected = options.find((option) => option.id === variantId);
  const previewTotal = mode === "Simple"
    ? quantity * unitCost
    : (goods + freight + customs + other) * (currency === "MYR" ? 1 : exchangeRate);
  const previewUnit = quantity > 0 ? previewTotal / quantity : 0;

  const refresh = useCallback(async () => {
    if (!connected) return;
    const [nextOptions, nextReceipts] = await Promise.all([
      listInventoryReceiptOptions(), listInventoryReceipts(),
    ]);
    setOptions(nextOptions);
    setReceipts(nextReceipts);
    setVariantId((current) => current || nextOptions[0]?.id || "");
  }, [connected]);

  useEffect(() => {
    void Promise.resolve().then(refresh).catch(() => setMessage("Stock receipts could not be loaded."));
  }, [refresh]);

  async function save() {
    setBusy(true); setMessage("");
    try {
      const receipt = await createInventoryReceipt({
        productVariantId: variantId,
        smartTagBatchId: batchId || undefined,
        quantityReceived: quantity,
        receivedAt: `${receivedAt}T00:00:00Z`,
        supplierName: supplier || undefined,
        supplierReference: supplierReference || undefined,
        notes: notes || undefined,
        purchaseCurrency: currency,
        exchangeRateToMyr: currency === "MYR" ? 1 : exchangeRate,
        costMode: mode,
        unitLandedCostMyr: mode === "Simple" ? unitCost : undefined,
        goodsCost: mode === "Detailed" ? goods : undefined,
        freightCost: mode === "Detailed" ? freight : undefined,
        customsTaxCost: mode === "Detailed" ? customs : undefined,
        otherLandedCost: mode === "Detailed" ? other : undefined,
      });
      setMessage(`${receipt.receiptNumber} saved and linked to ${receipt.quantityReceived} serialized tag(s).`);
      setBatchId(""); setQuantity(1); setNotes("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The stock receipt could not be saved.");
    } finally { setBusy(false); }
  }

  async function runReport() {
    setBusy(true); setMessage("");
    try {
      setReport(await getProfitabilityReport(`${from}T00:00:00Z`, nextDay(to)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The report could not be loaded.");
    } finally { setBusy(false); }
  }

  if (!connected) return <AdminNotice>Stock receipts and profitability are unavailable in this preview.</AdminNotice>;

  return <>
    <AdminSection title="Stock receipts" description="Record physical stock received and its landed cost. Generating tag codes does not create a stock receipt.">
      <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="SKU"><select className={fieldClass} value={variantId} onChange={(e) => { setVariantId(e.target.value); setBatchId(""); }}>
          {options.map((option) => <option key={option.id} value={option.id}>{option.sku} · {option.variantName}</option>)}
        </select></Field>
        <Field label="Production batch (optional)"><select className={fieldClass} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">Any eligible tag in this SKU</option>
          {selected?.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.unreceivedEligibleQuantity} eligible</option>)}
        </select></Field>
        <NumberField label="Quantity received" value={quantity} min={1} onChange={setQuantity} />
        <Field label="Received date"><input className={fieldClass} type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
        <Field label="Cost workflow"><select className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value as ReceiptCostMode)}><option value="Simple">Simple · cost per tag</option><option value="Detailed">Detailed · landed-cost components</option></select></Field>
        <Field label="Purchase currency"><input className={fieldClass} maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
        {currency !== "MYR" ? <NumberField label="Exchange rate to MYR" value={exchangeRate} min={0.000001} step="0.000001" onChange={setExchangeRate} /> : null}
        {mode === "Simple" ? <NumberField label="Landed cost per tag (MYR)" value={unitCost} min={0.000001} step="0.000001" onChange={setUnitCost} /> : <>
          <NumberField label={`Goods cost (${currency})`} value={goods} onChange={setGoods} />
          <NumberField label={`Freight (${currency})`} value={freight} onChange={setFreight} />
          <NumberField label={`Customs / tax (${currency})`} value={customs} onChange={setCustoms} />
          <NumberField label={`Other landed cost (${currency})`} value={other} onChange={setOther} />
        </>}
        <Field label="Supplier"><input className={fieldClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <Field label="Supplier reference"><input className={fieldClass} value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} /></Field>
        <Field label="Notes"><input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
        <p className="text-sm font-bold text-slate-700">Calculated: {money(previewTotal)} total · {money(previewUnit)} per tag</p>
        <AdminActionButton tone="primary" disabled={busy || !variantId || quantity < 1 || previewTotal <= 0} onClick={() => void save()}>Save Stock Receipt</AdminActionButton>
      </div>
      {message ? <p className="px-4 pb-4 text-sm font-bold text-[#1b4f9c]" role="status">{message}</p> : null}
      <div className="overflow-x-auto border-t border-slate-100">
        <table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Receipt</th><th className="p-3">SKU / batch</th><th className="p-3">Received</th><th className="p-3">Quantity</th><th className="p-3">Landed cost</th></tr></thead>
          <tbody>{receipts.map((receipt) => <tr className="border-t border-slate-100" key={receipt.id}><td className="p-3 font-bold">{receipt.receiptNumber}</td><td className="p-3">{receipt.sku}<br/><span className="text-xs text-slate-500">{receipt.batchNumber ?? "No batch selected"}</span></td><td className="p-3">{new Date(receipt.receivedAt).toLocaleDateString("en-MY")}</td><td className="p-3">{receipt.quantityReceived}</td><td className="p-3">{money(receipt.totalLandedCostMyr)}<br/><span className="text-xs text-slate-500">{money(receipt.unitLandedCostMyr)} / tag</span></td></tr>)}</tbody>
        </table>
      </div>
    </AdminSection>

    <AdminSection title="Profitability" description="Shipment-time product margin from immutable tag costs. Missing costs are shown as unavailable, never as zero.">
      <div className="flex flex-wrap items-end gap-3 p-4"><Field label="From"><input className={fieldClass} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input className={fieldClass} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field><AdminActionButton disabled={busy} onClick={() => void runReport()} tone="primary">Run Report</AdminActionButton></div>
      {report ? <div className="grid gap-3 p-4 pt-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Product revenue", money(report.productRevenue)], ["Discounts", money(report.discounts)], ["Net product revenue", money(report.netProductRevenue)], ["Units sold", String(report.unitsSold)],
          [report.isCostOfGoodsComplete ? "COGS" : "Known COGS", money(report.knownCostOfGoods)], ["Gross profit", report.grossProfit == null ? "Unavailable" : money(report.grossProfit)], ["Gross margin", report.grossMarginPercentage == null ? "Unavailable" : `${report.grossMarginPercentage}%`], ["Uncosted units", String(report.uncostedUnits)],
          ["Recorded courier cost", money(report.recordedCourierCost)], ["Recorded sales commission", money(report.recordedSalesCommission)], ["Contribution profit", report.contributionProfit == null ? "Unavailable" : money(report.contributionProfit)], ["Missing courier costs", String(report.ordersMissingCourierCost)],
        ].map(([label, value]) => <div className="rounded-xl bg-slate-50 p-3" key={label}><p className="text-xs font-extrabold uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-900">{value}</p></div>)}</div>
        <ul className="text-xs font-semibold text-slate-500">{report.excludedCosts.map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Order</th><th className="p-3">Selling amount</th><th className="p-3">COGS</th><th className="p-3">Gross profit</th><th className="p-3">Units</th></tr></thead><tbody>{report.orders.map((order) => <tr className="border-t border-slate-100" key={`${order.channel}-${order.orderId}`}><td className="p-3 font-bold">{order.orderNumber}<br/><span className="text-xs text-slate-500">{order.channel}</span></td><td className="p-3">{money(order.sellingAmount)}</td><td className="p-3">{order.costOfGoods == null ? "Uncosted" : money(order.costOfGoods)}</td><td className="p-3">{order.grossProfit == null ? "Unavailable" : money(order.grossProfit)}</td><td className="p-3">{order.units}{order.uncostedUnits ? ` · ${order.uncostedUnits} uncosted` : ""}</td></tr>)}</tbody></table></div>
      </div> : null}
    </AdminSection>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1 text-xs font-extrabold uppercase text-slate-500">{label}{children}</label>; }
function NumberField({ label, value, onChange, min = 0, step = "0.01" }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: string }) { return <Field label={label}><input className={fieldClass} min={min} step={step} type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} /></Field>; }
