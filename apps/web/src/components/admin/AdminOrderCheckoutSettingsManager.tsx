"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import {
  AdminStatusBadge,
  AdminStatusCard,
} from "@/components/admin/AdminStatus";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import {
  getOrderCheckoutSettings,
  getOrderCheckoutSettingsError,
  updateOrderCheckoutSettings,
  type AdminOrderCheckoutSettings,
} from "@/services/adminOrderCheckoutService";
import { isApiClientError } from "@/services/apiClient";

export function AdminOrderCheckoutSettingsManager() {
  const [settings, setSettings] = useState<AdminOrderCheckoutSettings | null>(null);
  const [minutes, setMinutes] = useState(120);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await getOrderCheckoutSettings();
      if (!response.data) throw new Error("Order checkout settings were not returned.");
      setSettings(response.data);
      setMinutes(response.data.paymentReservationMinutes);
      setError("");
      setStatus("ready");
    } catch (caught) {
      setError(getOrderCheckoutSettingsError(caught));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function save() {
    if (!settings || saving) return;
    if (
      !Number.isInteger(minutes) ||
      minutes < settings.minPaymentReservationMinutes ||
      minutes > settings.maxPaymentReservationMinutes
    ) {
      setMessage("");
      setError(
        `Enter between ${settings.minPaymentReservationMinutes} minutes and ${
          settings.maxPaymentReservationMinutes / 60
        } hours.`
      );
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await updateOrderCheckoutSettings(minutes, settings.rowVersion);
      if (!response.data) throw new Error("Updated settings were not returned.");
      setSettings(response.data);
      setMinutes(response.data.paymentReservationMinutes);
      setMessage("Order checkout settings saved.");
    } catch (caught) {
      setError(getOrderCheckoutSettingsError(caught));
      if (isApiClientError(caught) && (caught.code === "concurrency_conflict" || caught.status === 409)) {
        await load();
        setError(getOrderCheckoutSettingsError(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">Loading order checkout settings...</div>;
  }
  if (status === "error" || !settings) {
    return <div className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-6 text-sm font-bold text-[#a63c2e]" role="alert">{error || "We could not load order checkout settings."}</div>;
  }

  const changed = minutes !== settings.paymentReservationMinutes;
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <AdminStatusCard
          detail="Automatically releases inventory held by unpaid orders after their saved deadline."
          footnote={<AdminStatusBadge tone="neutral">Read-only deployment setting</AdminStatusBadge>}
          icon="settings"
          label="Reservation expiry worker"
          status={settings.expiryWorker.enabled ? "Enabled" : "Disabled"}
          tone={settings.expiryWorker.enabled ? "positive" : "warning"}
        />
        <AdminStatusCard
          detail="How often MyPetLink checks for unpaid reservations that have reached their deadline."
          icon="record"
          label="Check interval"
          status={formatDuration(settings.expiryWorker.pollIntervalSeconds)}
          tone="neutral"
        />
        <AdminStatusCard
          detail="Maximum number of expired orders processed in one check."
          icon="record"
          label="Orders per check"
          status={String(settings.expiryWorker.batchSize)}
          tone="neutral"
        />
      </div>

      {message ? <AdminNotice>{message}</AdminNotice> : null}
      {error ? <div className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">{error}</div> : null}

      <AdminSection
        description="How long inventory is reserved while an owner completes manual payment and submits proof."
        title="Payment reservation"
      >
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid max-w-md gap-2">
            <label className="text-sm font-black text-slate-900" htmlFor="payment-reservation-minutes">Unpaid order reservation window</label>
            <span className="text-sm leading-6 text-slate-500">Orders with no payment proof are automatically expired after this time and their inventory is released.</span>
            <div className="flex items-center gap-3">
              <input
                className="brand-input max-w-40"
                id="payment-reservation-minutes"
                inputMode="numeric"
                max={settings.maxPaymentReservationMinutes}
                min={settings.minPaymentReservationMinutes}
                onChange={(event) => {
                  setMinutes(Number(event.target.value));
                  setError("");
                  setMessage("");
                }}
                required
                step={1}
                type="number"
                value={Number.isNaN(minutes) ? "" : minutes}
              />
              <span className="text-sm font-bold text-slate-600">minutes</span>
            </div>
            <span className="text-xs font-semibold text-slate-500">Allowed: {settings.minPaymentReservationMinutes} minutes to {settings.maxPaymentReservationMinutes / 60} hours. Current value: {formatMinutes(settings.paymentReservationMinutes)}.</span>
          </div>
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving || !changed}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
        <dl className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">
          <div className="flex flex-wrap gap-x-2 gap-y-1"><dt className="font-bold text-slate-600">Last updated</dt><dd>{formatAdminDateTime(settings.updatedAt)}</dd><dt className="font-bold text-slate-600">by</dt><dd>{settings.updatedBy ?? "System default"}</dd></div>
        </dl>
      </AdminSection>
    </div>
  );
}

function formatMinutes(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;
  return `${minutes} minutes`;
}

function formatDuration(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
}
