"use client";

import { useEffect, useState } from "react";
import { isApiClientError } from "@/services/apiClient";
import {
  listAdminDeliveryRates,
  saveAdminDeliveryRate,
  type AdminDeliveryRate,
  type DeliveryRateInput,
} from "@/services/adminDeliveryRateService";

const zones = [
  ["PEN", "Peninsular"],
  ["SBH", "Sabah"],
  ["SWK", "Sarawak"],
  ["LBN", "Labuan"],
] as const;

const blank: DeliveryRateInput = {
  name: "",
  zoneCode: "PEN",
  fee: 0,
  currency: "MYR",
  freeShippingThreshold: null,
  isActive: false,
  displayOrder: 0,
};

export function AdminDeliveryRatesManager() {
  const [rates, setRates] = useState<AdminDeliveryRate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DeliveryRateInput>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try { setRates(await listAdminDeliveryRates()); }
    catch (caught) { setError(deliveryRateError(caught)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function edit(rate: AdminDeliveryRate) {
    setEditingId(rate.id);
    setForm({
      name: rate.name,
      zoneCode: rate.zoneCode,
      fee: rate.fee,
      currency: "MYR",
      freeShippingThreshold: rate.freeShippingThreshold ?? null,
      isActive: rate.isActive,
      displayOrder: rate.displayOrder,
      concurrencyToken: rate.concurrencyToken,
    });
    setMessage("");
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const existing = rates.find((rate) => rate.id === editingId);
    if (existing?.isActive && !form.isActive &&
        !window.confirm("Deactivate this delivery rate? Customers in this zone will be unable to place new orders.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveAdminDeliveryRate(editingId, form);
      setMessage(editingId ? "Delivery rate updated." : "Delivery rate created.");
      setEditingId(null);
      setForm(blank);
      await refresh();
    } catch (caught) {
      setError(deliveryRateError(caught));
    } finally { setSaving(false); }
  }

  if (loading) return <div className="brand-card rounded-3xl p-6 text-sm font-semibold text-pet-muted">Loading delivery rates...</div>;

  return <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
    <section className="brand-card overflow-hidden rounded-3xl">
      <div className="border-b border-pet-border p-5"><h2 className="text-xl font-black text-pet-ink">Malaysia delivery zones</h2><p className="mt-1 text-sm text-pet-muted">One active rate covers every state in its fixed zone. RM 0 is treated as free delivery.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-pet-cream text-xs uppercase text-pet-muted"><tr><th className="p-4">Zone</th><th className="p-4">States</th><th className="p-4">Fee</th><th className="p-4">Free from</th><th className="p-4">Status</th><th className="p-4"></th></tr></thead><tbody>{rates.map((rate) => <tr className="border-t border-pet-border" key={rate.id}><td className="p-4 font-black text-pet-ink">{rate.zoneName}<p className="text-xs font-semibold text-pet-muted">{rate.name}</p></td><td className="max-w-sm p-4 text-pet-muted">{rate.applicableStateNames.join(", ")}</td><td className="p-4 font-bold">{rate.fee === 0 ? "Free" : `RM ${rate.fee.toFixed(2)}`}</td><td className="p-4">{rate.freeShippingThreshold == null ? "—" : `RM ${rate.freeShippingThreshold.toFixed(2)}`}</td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${rate.isActive ? "bg-[#e8f8f0] text-pet-sage" : "bg-slate-100 text-slate-600"}`}>{rate.isActive ? "Active" : "Inactive"}</span></td><td className="p-4"><button className="font-bold text-pet-teal" onClick={() => edit(rate)} type="button">Edit</button></td></tr>)}</tbody></table></div>
      {!rates.length ? <p className="p-6 text-sm text-pet-muted">No delivery rates have been configured yet.</p> : null}
    </section>
    <form className="brand-card h-fit rounded-3xl p-5" onSubmit={submit}>
      <h2 className="text-xl font-black text-pet-ink">{editingId ? "Edit delivery rate" : "Add delivery rate"}</h2>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-bold">Name<input className="brand-input" required value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} /></label>
        <label className="grid gap-2 text-sm font-bold">Zone<select className="brand-input" value={form.zoneCode} onChange={(e) => setForm({...form, zoneCode:e.target.value})}>{zones.map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold">Delivery fee (MYR)<input className="brand-input" min="0" required step="0.01" type="number" value={form.fee} onChange={(e) => setForm({...form, fee:Number(e.target.value)})} /></label>
        <label className="grid gap-2 text-sm font-bold">Free delivery threshold (optional)<input className="brand-input" min="0" placeholder="No threshold" step="0.01" type="number" value={form.freeShippingThreshold ?? ""} onChange={(e) => setForm({...form, freeShippingThreshold:e.target.value === "" ? null : Number(e.target.value)})} /></label>
        <label className="grid gap-2 text-sm font-bold">Display order<input className="brand-input" min="0" type="number" value={form.displayOrder} onChange={(e) => setForm({...form, displayOrder:Number(e.target.value)})} /></label>
        <label className="flex items-center gap-3 text-sm font-bold"><input checked={form.isActive} onChange={(e) => setForm({...form, isActive:e.target.checked})} type="checkbox" />Available for new orders</label>
      </div>
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-[#e8f8f0] p-3 text-sm font-bold text-pet-sage" role="status">{message}</p> : null}
      <div className="mt-5 flex gap-3"><button className="rounded-full bg-pet-teal px-5 py-3 text-sm font-black text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? "Saving..." : "Save rate"}</button>{editingId ? <button className="rounded-full border border-pet-border px-5 py-3 text-sm font-bold" onClick={() => {setEditingId(null);setForm(blank);}} type="button">Cancel</button> : null}</div>
    </form>
  </div>;
}

function deliveryRateError(error: unknown) {
  return isApiClientError(error)
    ? error.message
    : "We couldn't save the delivery rate. Please try again.";
}
