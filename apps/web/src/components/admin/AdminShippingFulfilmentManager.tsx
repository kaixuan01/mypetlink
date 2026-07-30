"use client";

import { useEffect, useMemo, useState, type InputHTMLAttributes } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  createShippingCourier,
  getShippingFulfilmentConfiguration,
  getShippingSettingsError,
  setDefaultShippingCourier,
  setShippingCourierActive,
  updateShippingCourier,
  updateShippingSettings,
  type ShippingCourier,
  type ShippingCourierInput,
  type ShippingFulfilmentConfiguration,
  type ShippingSettings,
} from "@/services/adminShippingFulfilmentService";

type CourierForm = ShippingCourierInput & { id?: string };

const emptyCourier: CourierForm = {
  code: "",
  displayName: "",
  isActive: true,
  isDefault: false,
  trackingUrlTemplate: "",
  displayOrder: 50,
  internalNotes: "",
};

export function AdminShippingFulfilmentManager() {
  const [configuration, setConfiguration] =
    useState<ShippingFulfilmentConfiguration | null>(null);
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [courierForm, setCourierForm] = useState<CourierForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedSettingsJson, setSavedSettingsJson] = useState("");

  useEffect(() => {
    let active = true;
    void getShippingFulfilmentConfiguration()
      .then((data) => {
        if (!active) return;
        setConfiguration(data);
        setSettings(data.settings);
        setSavedSettingsJson(JSON.stringify(data.settings));
      })
      .catch((reason) => active && setError(getShippingSettingsError(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const dirty = settings != null && JSON.stringify(settings) !== savedSettingsJson;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const sortedCouriers = useMemo(
    () =>
      [...(configuration?.couriers ?? [])].sort(
        (a, b) => a.displayOrder - b.displayOrder || a.displayName.localeCompare(b.displayName)
      ),
    [configuration?.couriers]
  );

  function replaceCourier(next: ShippingCourier) {
    setConfiguration((current) =>
      current
        ? {
            ...current,
            couriers: current.couriers
              .map((item) => (item.id === next.id ? next : next.isDefault ? { ...item, isDefault: false } : item))
              .concat(current.couriers.some((item) => item.id === next.id) ? [] : [next]),
          }
        : current
    );
  }

  async function saveSettings() {
    if (!settings || busy) return;
    setBusy("settings");
    setError("");
    setMessage("");
    try {
      const saved = await updateShippingSettings({
        senderName: settings.senderName,
        companyName: settings.companyName,
        senderPhone: settings.senderPhone,
        senderEmail: settings.senderEmail,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        postcode: settings.postcode,
        stateCode: settings.stateCode,
        country: settings.country,
        defaultParcelWeightKg: Number(settings.defaultParcelWeightKg),
        defaultParcelLengthCm: Number(settings.defaultParcelLengthCm),
        defaultParcelWidthCm: Number(settings.defaultParcelWidthCm),
        defaultParcelHeightCm: Number(settings.defaultParcelHeightCm),
        customerTrackingLinksEnabled: settings.customerTrackingLinksEnabled,
        rowVersion: settings.rowVersion,
      });
      setSettings(saved);
      setSavedSettingsJson(JSON.stringify(saved));
      setMessage("Shipping and fulfilment settings saved.");
    } catch (reason) {
      setError(getShippingSettingsError(reason));
    } finally {
      setBusy("");
    }
  }

  async function saveCourier() {
    if (!courierForm || busy) return;
    setBusy("courier");
    setError("");
    setMessage("");
    try {
      const saved = courierForm.id
        ? await updateShippingCourier(courierForm.id, courierForm)
        : await createShippingCourier(courierForm);
      replaceCourier(saved);
      setCourierForm(null);
      setMessage(courierForm.id ? "Courier saved." : "Courier added.");
    } catch (reason) {
      setError(getShippingSettingsError(reason));
    } finally {
      setBusy("");
    }
  }

  async function toggleCourier(courier: ShippingCourier) {
    if (busy) return;
    if (
      courier.isActive &&
      !window.confirm(
        `${courier.displayName} will no longer appear for new shipments. Historical orders will not change. Continue?`
      )
    ) {
      return;
    }
    setBusy(courier.id);
    setError("");
    try {
      replaceCourier(await setShippingCourierActive(courier, !courier.isActive));
      setMessage(courier.isActive ? "Courier deactivated." : "Courier activated.");
    } catch (reason) {
      setError(getShippingSettingsError(reason));
    } finally {
      setBusy("");
    }
  }

  async function makeDefault(courier: ShippingCourier) {
    if (busy || courier.isDefault) return;
    setBusy(courier.id);
    setError("");
    try {
      replaceCourier(await setDefaultShippingCourier(courier));
      setMessage(`${courier.displayName} is now the default courier.`);
    } catch (reason) {
      setError(getShippingSettingsError(reason));
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div className="brand-card rounded-[1.5rem] p-6 font-bold text-pet-muted">Loading shipping settings…</div>;
  }
  if (!configuration || !settings) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error || "Shipping settings are unavailable."}</div>;
  }

  return (
    <div className="grid gap-6">
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error}</div> : null}
      {message ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-800">{message}</div> : null}

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-pet-ink">Sender / return address</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-pet-muted">
              Used as the parcel sender and return address. It is never shown through public APIs.
            </p>
          </div>
          <Badge tone={settings.senderConfigured ? "mint" : "warm"}>
            {settings.senderConfigured ? "Configured" : "Needs setup"}
          </Badge>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Sender name" required value={settings.senderName} onChange={(value) => setSettings({ ...settings, senderName: value })} />
          <Field label="Company / business name" value={settings.companyName ?? ""} onChange={(value) => setSettings({ ...settings, companyName: value })} />
          <Field label="Sender phone number" required value={settings.senderPhone} onChange={(value) => setSettings({ ...settings, senderPhone: value })} />
          <Field label="Sender email" type="email" value={settings.senderEmail ?? ""} onChange={(value) => setSettings({ ...settings, senderEmail: value })} />
          <div className="sm:col-span-2"><Field label="Address line 1" required value={settings.addressLine1} onChange={(value) => setSettings({ ...settings, addressLine1: value })} /></div>
          <div className="sm:col-span-2"><Field label="Address line 2" value={settings.addressLine2 ?? ""} onChange={(value) => setSettings({ ...settings, addressLine2: value })} /></div>
          <Field label="City" required value={settings.city} onChange={(value) => setSettings({ ...settings, city: value })} />
          <Field label="Postcode" required maxLength={5} inputMode="numeric" value={settings.postcode} onChange={(value) => setSettings({ ...settings, postcode: value })} />
          <label className="grid gap-1 text-sm font-bold text-pet-ink">
            State <span className="sr-only">required</span>
            <select required className={inputClass} value={settings.stateCode} onChange={(event) => setSettings({ ...settings, stateCode: event.target.value })}>
              <option value="">Select state</option>
              {configuration.malaysiaStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
            </select>
          </label>
          <Field label="Country" required disabled value={settings.country} onChange={() => undefined} />
        </div>
      </section>

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <h2 className="text-xl font-black text-pet-ink">Parcel defaults</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-pet-muted">
          Packing defaults only. They do not change delivery fees or customer order totals.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Weight (kg)" step="0.001" value={settings.defaultParcelWeightKg} onChange={(value) => setSettings({ ...settings, defaultParcelWeightKg: value })} />
          <NumberField label="Length (cm)" value={settings.defaultParcelLengthCm} onChange={(value) => setSettings({ ...settings, defaultParcelLengthCm: value })} />
          <NumberField label="Width (cm)" value={settings.defaultParcelWidthCm} onChange={(value) => setSettings({ ...settings, defaultParcelWidthCm: value })} />
          <NumberField label="Height (cm)" value={settings.defaultParcelHeightCm} onChange={(value) => setSettings({ ...settings, defaultParcelHeightCm: value })} />
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-2xl bg-pet-cream p-4">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={settings.customerTrackingLinksEnabled} onChange={(event) => setSettings({ ...settings, customerTrackingLinksEnabled: event.target.checked })} />
          <span>
            <span className="block font-black text-pet-ink">Enable customer Track Parcel links</span>
            <span className="mt-1 block text-sm font-semibold leading-6 text-pet-muted">
              Links appear only after shipment and only for an active courier with a valid HTTPS tracking template.
            </span>
          </span>
        </label>
        <div className="mt-5 flex justify-end">
          <button className="min-h-12 rounded-full bg-pet-teal px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!dirty || Boolean(busy)} onClick={() => void saveSettings()} type="button">
            {busy === "settings" ? "Saving…" : "Save sender and parcel settings"}
          </button>
        </div>
      </section>

      <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-pet-ink">Courier providers</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-pet-muted">
              Active couriers appear in manual shipment forms. Deactivation never changes historical orders.
            </p>
          </div>
          <button className="min-h-11 rounded-full bg-pet-teal px-5 py-2.5 text-sm font-black text-white" onClick={() => setCourierForm({ ...emptyCourier })} type="button">
            Add courier
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {sortedCouriers.map((courier) => (
            <article key={courier.id} className="rounded-2xl border border-pet-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-pet-ink">{courier.displayName}</h3>
                    <Badge tone={courier.isActive ? "mint" : "soft"}>{courier.isActive ? "Active" : "Inactive"}</Badge>
                    {courier.isDefault ? <Badge tone="teal">Default</Badge> : null}
                  </div>
                  <p className="mt-1 break-words text-xs font-bold text-pet-muted">
                    Code {courier.code} · Display order {courier.displayOrder} · {courier.trackingUrlTemplate ? "Tracking link configured" : "No tracking link"}
                  </p>
                </div>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <button className={secondaryButton} onClick={() => setCourierForm({ ...courier })} type="button">Edit</button>
                  {!courier.isDefault && courier.isActive ? <button className={secondaryButton} disabled={Boolean(busy)} onClick={() => void makeDefault(courier)} type="button">Set as default</button> : null}
                  <button className={secondaryButton} disabled={Boolean(busy)} onClick={() => void toggleCourier(courier)} type="button">
                    {busy === courier.id ? "Updating…" : courier.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {courierForm ? (
        <section className="brand-card rounded-[1.75rem] border-2 border-pet-teal p-5 sm:p-6" aria-label={courierForm.id ? "Edit courier" : "Add courier"}>
          <h2 className="text-xl font-black text-pet-ink">{courierForm.id ? "Edit courier" : "Add courier"}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Stable courier code" required disabled={Boolean(courierForm.id)} value={courierForm.code ?? ""} onChange={(value) => setCourierForm({ ...courierForm, code: value.toUpperCase() })} />
            <Field label="Display name" required value={courierForm.displayName} onChange={(value) => setCourierForm({ ...courierForm, displayName: value })} />
            <NumberField label="Display order" min={0} value={courierForm.displayOrder} onChange={(value) => setCourierForm({ ...courierForm, displayOrder: value })} />
            <div className="sm:col-span-2"><Field label="Tracking URL template" placeholder="https://example.test/track?number={trackingNumber}" value={courierForm.trackingUrlTemplate ?? ""} onChange={(value) => setCourierForm({ ...courierForm, trackingUrlTemplate: value })} /></div>
            <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
              Internal notes
              <textarea className={`${inputClass} min-h-24 py-3`} maxLength={1000} value={courierForm.internalNotes ?? ""} onChange={(event) => setCourierForm({ ...courierForm, internalNotes: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 font-bold text-pet-ink"><input type="checkbox" checked={courierForm.isActive} onChange={(event) => setCourierForm({ ...courierForm, isActive: event.target.checked, isDefault: event.target.checked ? courierForm.isDefault : false })} /> Active</label>
            <label className="flex items-center gap-2 font-bold text-pet-ink"><input type="checkbox" disabled={!courierForm.isActive} checked={courierForm.isDefault} onChange={(event) => setCourierForm({ ...courierForm, isDefault: event.target.checked })} /> Default courier</label>
          </div>
          <div className="mt-5 grid gap-2 sm:flex sm:justify-end">
            <button className={secondaryButton} disabled={Boolean(busy)} onClick={() => setCourierForm(null)} type="button">Cancel</button>
            <button className="min-h-11 rounded-full bg-pet-teal px-5 py-2.5 text-sm font-black text-white disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void saveCourier()} type="button">{busy === "courier" ? "Saving…" : "Save courier"}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-pet-border bg-white px-3 font-semibold text-pet-ink outline-none focus:border-pet-teal disabled:bg-slate-100";
const secondaryButton =
  "min-h-11 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-black text-pet-ink disabled:cursor-not-allowed disabled:opacity-50";

function Field({
  label,
  value,
  onChange,
  required,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="grid gap-1 text-sm font-bold text-pet-ink">
      {label}{required ? " *" : ""}
      <input {...inputProps} required={required} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "0.01",
  min = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-pet-ink">
      {label}
      <input className={inputClass} min={min} required step={step} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
