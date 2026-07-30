"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import {
  AdminEmptyPanel,
  AdminStat,
  AdminStatStrip,
  AdminStatusBadge,
} from "@/components/admin/AdminStatus";
import { AdminDeliveryStateOverrides } from "@/components/admin/AdminDeliveryStateOverrides";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setRates(await listAdminDeliveryRates());
    } catch (caught) {
      setError(deliveryRateError(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const summary = useMemo(() => {
    const active = rates.filter((rate) => rate.isActive);
    return {
      active: active.length,
      inactive: rates.length - active.length,
      free: active.filter((rate) => rate.fee === 0).length,
    };
  }, [rates]);

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

  function reset() {
    setEditingId(null);
    setForm(blank);
    setError("");
  }

  async function persist() {
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
    } finally {
      setSaving(false);
      setConfirmDeactivate(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const existing = rates.find((rate) => rate.id === editingId);
    // Switching a live zone off stops new orders for every state it covers, so
    // it always asks first.
    if (existing?.isActive && !form.isActive) {
      setConfirmDeactivate(true);
      return;
    }

    void persist();
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
        Loading delivery zones...
      </div>
    );
  }

  const editingRate = rates.find((rate) => rate.id === editingId) ?? null;
  const selectedZoneName =
    zones.find(([code]) => code === form.zoneCode)?.[1] ?? form.zoneCode;

  return (
    <div className="space-y-5 sm:space-y-6">
      <AdminStatStrip>
        <AdminStat
          hint="Accepting orders"
          label="Active zones"
          tone={summary.active > 0 ? "positive" : "warning"}
          value={summary.active}
        />
        <AdminStat
          hint="Checkout blocked"
          label="Inactive zones"
          tone={summary.inactive > 0 ? "warning" : "neutral"}
          value={summary.inactive}
        />
        <AdminStat label="Free delivery" value={summary.free} />
        <AdminStat label="Zones configured" value={rates.length} />
      </AdminStatStrip>

      {summary.active === 0 && rates.length > 0 ? (
        <div className="rounded-xl border border-[#f6dfae] bg-[#fdf6e7] px-4 py-3 text-sm font-semibold leading-6 text-[#8a5a10]">
          No delivery zone is active, so customers cannot complete checkout. Switch
          on at least one zone to accept orders.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <AdminSection
          description="One active rate covers every state in its zone. Self-pickup is not offered, so a delivery address always needs a matching active zone."
          title="Malaysia delivery zones"
        >
          {rates.length === 0 ? (
            <AdminEmptyPanel
              description="Add a rate for Peninsular Malaysia, Sabah, Sarawak or Labuan to start accepting orders."
              icon="pin"
              title="No delivery zones configured yet"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rates.map((rate) => {
                const selected = rate.id === editingId;
                return (
                  <li key={rate.id}>
                    <button
                      aria-current={selected ? "true" : undefined}
                      className={`flex w-full flex-col gap-3 border-l-4 p-4 text-left transition sm:p-5 ${
                        selected
                          ? "border-l-pet-teal bg-[#f0f7ff]"
                          : "border-l-transparent hover:bg-slate-50/70"
                      }`}
                      onClick={() => edit(rate)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-slate-950">
                          {rate.zoneName}
                        </span>
                        <AdminStatusBadge
                          dot
                          tone={rate.isActive ? "positive" : "neutral"}
                        >
                          {rate.isActive ? "Active" : "Inactive"}
                        </AdminStatusBadge>
                        {rate.isActive && rate.fee === 0 ? (
                          <AdminStatusBadge tone="info">Free delivery</AdminStatusBadge>
                        ) : null}
                        {rate.enabledStateOverrideCount > 0 ? (
                          <AdminStatusBadge tone="info">
                            {rate.enabledStateOverrideCount === 1
                              ? "1 state override"
                              : `${rate.enabledStateOverrideCount} state overrides`}
                          </AdminStatusBadge>
                        ) : null}
                      </div>

                      <p className="text-sm font-semibold text-slate-500">{rate.name}</p>

                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Figure
                          label="Fee"
                          value={rate.fee === 0 ? "Free" : `RM ${rate.fee.toFixed(2)}`}
                        />
                        <Figure
                          label="Free from"
                          value={
                            rate.freeShippingThreshold == null
                              ? "—"
                              : `RM ${rate.freeShippingThreshold.toFixed(2)}`
                          }
                        />
                        <Figure label="Order" value={`${rate.displayOrder}`} />
                      </div>

                      <p className="text-xs leading-5 text-slate-500">
                        <span className="font-bold text-slate-400">Covers: </span>
                        {rate.applicableStateNames.join(", ")}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </AdminSection>

        <form className="min-w-0 xl:sticky xl:top-4" onSubmit={submit}>
          <AdminSection
            action={
              editingRate ? (
                <AdminStatusBadge tone={editingRate.isActive ? "positive" : "neutral"}>
                  {editingRate.zoneName}
                </AdminStatusBadge>
              ) : (
                <AdminStatusBadge tone="info">New</AdminStatusBadge>
              )
            }
            description={
              editingId
                ? "Default rate for all states in this zone. Changes apply to new orders only; existing orders keep the fee they were charged."
                : "Create a default rate for one of the four Malaysia delivery zones."
            }
            title={editingId ? "Zone default rate" : "Add delivery zone"}
          >
            <div className="space-y-5 p-4 sm:p-5">
              <Field
                help="Shown to customers at checkout, for example “Peninsular Standard Delivery”."
                label="Rate name"
              >
                <input
                  className="brand-input"
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                  value={form.name}
                />
              </Field>

              {editingId ? (
                // Zones are fixed, so an existing rate can never be moved to a
                // different zone by accident.
                <Field
                  help={`Covers every state in ${selectedZoneName}. A zone cannot be changed after the rate is created.`}
                  label="Delivery zone"
                >
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">
                    {selectedZoneName}
                  </p>
                </Field>
              ) : (
                <Field
                  help={`Covers every state in ${selectedZoneName}. Each zone can have one active rate.`}
                  label="Delivery zone"
                >
                  <select
                    className="brand-input"
                    onChange={(event) => setForm({ ...form, zoneCode: event.target.value })}
                    value={form.zoneCode}
                  >
                    {zones.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field help="Enter 0 for free delivery." label="Delivery fee (RM)">
                  <input
                    className="brand-input"
                    min="0"
                    onChange={(event) =>
                      setForm({ ...form, fee: Number(event.target.value) })
                    }
                    required
                    step="0.01"
                    type="number"
                    value={form.fee}
                  />
                </Field>
                <Field help="Lower numbers appear first." label="Display order">
                  <input
                    className="brand-input"
                    min="0"
                    onChange={(event) =>
                      setForm({ ...form, displayOrder: Number(event.target.value) })
                    }
                    type="number"
                    value={form.displayOrder}
                  />
                </Field>
              </div>

              <Field
                help="Leave empty to always charge the fee above."
                label="Free delivery from (RM, optional)"
              >
                <input
                  className="brand-input"
                  min="0"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      freeShippingThreshold:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  placeholder="No threshold"
                  step="0.01"
                  type="number"
                  value={form.freeShippingThreshold ?? ""}
                />
              </Field>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                  form.isActive
                    ? "border-[#bfe7d4] bg-[#eefaf4]"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <input
                  checked={form.isActive}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#1d9a68]"
                  onChange={(event) =>
                    setForm({ ...form, isActive: event.target.checked })
                  }
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-slate-900">
                    Available for new orders
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {form.isActive
                      ? `Customers in ${selectedZoneName} can check out using this rate.`
                      : `Checkout is blocked for ${selectedZoneName} while this is off.`}
                  </span>
                </span>
              </label>

              {error ? (
                <p
                  className="rounded-xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[#a63c2e]"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              {message ? (
                <p
                  className="rounded-xl border border-[#bfe7d4] bg-[#eefaf4] px-4 py-3 text-sm font-semibold text-[#166b48]"
                  role="status"
                >
                  {message}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                <button
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-pet-teal px-5 text-sm font-extrabold text-white transition hover:bg-[#1160d4] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Saving..." : editingId ? "Save changes" : "Create zone"}
                </button>
                {editingId ? (
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                    onClick={reset}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          </AdminSection>
        </form>
      </div>

      {editingRate ? (
        <AdminDeliveryStateOverrides
          key={editingRate.zoneCode}
          onChanged={() => void refresh()}
          zoneCode={editingRate.zoneCode}
        />
      ) : null}

      <ConfirmDialog
        confirmDisabled={saving}
        confirmLabel={saving ? "Switching off..." : "Switch off zone"}
        destructive
        message={`Customers in ${selectedZoneName} will not be able to place new orders until this zone is switched back on.`}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={() => void persist()}
        open={confirmDeactivate}
        title="Switch off this delivery zone?"
      />
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-black text-slate-900">{label}</span>
      {help ? (
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{help}</span>
      ) : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function deliveryRateError(error: unknown) {
  return isApiClientError(error)
    ? error.message
    : "We couldn't save the delivery rate. Please try again.";
}
