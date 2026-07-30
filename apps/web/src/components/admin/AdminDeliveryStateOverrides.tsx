"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStatusBadge } from "@/components/admin/AdminStatus";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isApiClientError } from "@/services/apiClient";
import {
  listAdminDeliveryStateRates,
  removeAdminDeliveryStateOverride,
  saveAdminDeliveryStateOverride,
  type AdminDeliveryStateRate,
  type AdminDeliveryZoneStateRates,
} from "@/services/adminDeliveryRateService";

type Draft = {
  stateCode: string;
  stateName: string;
  fee: string;
  threshold: string;
  isEnabled: boolean;
  concurrencyToken: string | null;
  isNew: boolean;
};

function money(value: number) {
  return value === 0 ? "Free" : `RM ${value.toFixed(2)}`;
}

function threshold(value: number | null) {
  return value == null ? "—" : `RM ${value.toFixed(2)}`;
}

/**
 * State-level exceptions to the selected zone's default rate.
 *
 * Every fee shown here is calculated by the API, so what an administrator sees
 * is what checkout would charge.
 */
export function AdminDeliveryStateOverrides({
  zoneCode,
  onChanged,
}: {
  zoneCode: string;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<AdminDeliveryZoneStateRates | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<AdminDeliveryStateRate | null>(null);

  const load = useCallback(
    () =>
      listAdminDeliveryStateRates(zoneCode)
        .then((result) => {
          setData(result);
          setStatus("ready");
        })
        .catch(() => setStatus("error")),
    [zoneCode]
  );

  // The parent keys this component by zone, so switching zones remounts it and
  // clears the draft without a state reset inside the effect.
  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(state: AdminDeliveryStateRate) {
    setError("");
    setMessage("");
    setDraft({
      stateCode: state.stateCode,
      stateName: state.stateName,
      fee: (state.overrideFee ?? state.zoneDefaultFee).toFixed(2),
      threshold:
        state.overrideFreeShippingThreshold == null
          ? ""
          : state.overrideFreeShippingThreshold.toFixed(2),
      isEnabled: state.hasOverride ? state.overrideEnabled : true,
      concurrencyToken: state.concurrencyToken,
      isNew: !state.hasOverride,
    });
  }

  async function persist() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveAdminDeliveryStateOverride(zoneCode, {
        stateCode: draft.stateCode,
        fee: Number(draft.fee),
        freeShippingThreshold: draft.threshold === "" ? null : Number(draft.threshold),
        isEnabled: draft.isEnabled,
        concurrencyToken: draft.concurrencyToken,
      });
      setData(result);
      setDraft(null);
      setMessage(
        draft.isEnabled
          ? `${draft.stateName} now uses its own delivery rate.`
          : `${draft.stateName} override saved but switched off, so the ${result.zoneName} default applies.`
      );
      onChanged?.();
    } catch (caught) {
      setError(overrideError(caught));
      if (isApiClientError(caught) && caught.status === 409) {
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await removeAdminDeliveryStateOverride(zoneCode, removing.stateCode);
      setData(result);
      setMessage(
        `${removing.stateName} returned to the ${result.zoneName} default delivery rate.`
      );
      onChanged?.();
    } catch (caught) {
      setError(overrideError(caught));
    } finally {
      setSaving(false);
      setRemoving(null);
    }
  }

  if (status === "loading") {
    return (
      <AdminSection description="Loading state rates..." title="State overrides">
        <div className="p-4 text-sm font-semibold text-slate-500 sm:p-5">
          Loading state rates...
        </div>
      </AdminSection>
    );
  }

  if (status === "error" || !data) {
    return (
      <AdminSection description="State-level exceptions to this zone." title="State overrides">
        <p className="p-4 text-sm font-semibold text-[#a63c2e] sm:p-5" role="alert">
          We could not load state rates for this zone. Please try again in a moment.
        </p>
      </AdminSection>
    );
  }

  const allDefault = data.storedOverrideCount === 0;
  const disabledStored = data.storedOverrideCount - data.enabledOverrideCount;

  return (
    <AdminSection
      action={
        <AdminStatusBadge tone={data.enabledOverrideCount > 0 ? "info" : "neutral"}>
          {data.enabledOverrideCount === 1
            ? "1 state override"
            : `${data.enabledOverrideCount} state overrides`}
        </AdminStatusBadge>
      }
      description="Use an override only when a state needs a different rate. States without an override use the zone default."
      title="State overrides"
    >
      <div className="space-y-4 p-4 sm:p-5">
        {!data.zoneActive && data.storedOverrideCount > 0 ? (
          <p className="rounded-xl border border-[#f6dfae] bg-[#fdf6e7] px-4 py-3 text-sm font-semibold leading-6 text-[#8a5a10]">
            This zone is switched off, so none of its stored overrides are in use.
            Customers in {data.zoneName} cannot check out until the zone default is
            switched back on.
          </p>
        ) : null}
        {disabledStored > 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            {disabledStored === 1
              ? "1 stored override is switched off"
              : `${disabledStored} stored overrides are switched off`}
            , so those states use the {data.zoneName} default of{" "}
            {money(data.zoneDefaultFee)}.
          </p>
        ) : null}
        {allDefault ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Every state in {data.zoneName} uses the zone default of{" "}
            {money(data.zoneDefaultFee)}. Add an override only where a state needs a
            different rate.
          </p>
        ) : null}

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

        <ul className="divide-y divide-slate-100">
          {data.states.map((state) => {
            const editing = draft?.stateCode === state.stateCode;
            const overrides = state.source !== "Zone default";
            return (
              <li className="py-3 first:pt-0 last:pb-0" key={state.stateCode}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-950">
                        {state.stateName}
                      </span>
                      <AdminStatusBadge
                        dot={overrides}
                        tone={overrides ? "info" : "neutral"}
                      >
                        {state.source}
                      </AdminStatusBadge>
                      {state.hasOverride && !state.overrideEnabled ? (
                        <AdminStatusBadge tone="warning">Override off</AdminStatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Effective fee{" "}
                      <span className="font-black text-slate-800">
                        {money(state.effectiveFee)}
                      </span>
                      {" · Free from "}
                      {threshold(state.effectiveFreeShippingThreshold)}
                      {overrides
                        ? ` · Zone default ${money(state.zoneDefaultFee)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => startEdit(state)}
                      type="button"
                    >
                      {state.hasOverride ? "Edit override" : "Add override"}
                    </button>
                    {state.hasOverride ? (
                      <button
                        className="inline-flex min-h-9 items-center justify-center rounded-full border border-[#ffd2c9] bg-[#fff2ef] px-3.5 text-xs font-extrabold text-[#a63c2e] transition hover:bg-[#ffe3dc]"
                        onClick={() => setRemoving(state)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>

                {editing && draft ? (
                  <form
                    className="mt-3 space-y-4 rounded-xl border border-[#cfe3ff] bg-[#f8fbff] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void persist();
                    }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">
                          State
                        </p>
                        <p className="text-sm font-black text-slate-900">
                          {draft.stateName}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">
                          Parent zone
                        </p>
                        <p className="text-sm font-black text-slate-900">
                          {data.zoneName}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                      This rate replaces the zone default only for this state.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-sm font-black text-slate-900">
                          Override delivery fee (RM)
                        </span>
                        <input
                          className="brand-input mt-2"
                          min="0"
                          onChange={(event) =>
                            setDraft({ ...draft, fee: event.target.value })
                          }
                          required
                          step="0.01"
                          type="number"
                          value={draft.fee}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-black text-slate-900">
                          Free delivery from (RM, optional)
                        </span>
                        <input
                          className="brand-input mt-2"
                          min="0"
                          onChange={(event) =>
                            setDraft({ ...draft, threshold: event.target.value })
                          }
                          placeholder="No threshold"
                          step="0.01"
                          type="number"
                          value={draft.threshold}
                        />
                      </label>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <input
                        checked={draft.isEnabled}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#1d9a68]"
                        onChange={(event) =>
                          setDraft({ ...draft, isEnabled: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-900">
                          Enabled for pricing
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          {draft.isEnabled
                            ? `${draft.stateName} will be charged this rate.`
                            : `${draft.stateName} will use the ${data.zoneName} default of ${money(data.zoneDefaultFee)}.`}
                        </span>
                      </span>
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-pet-teal px-5 text-sm font-extrabold text-white transition hover:bg-[#1160d4] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={saving}
                        type="submit"
                      >
                        {saving ? "Saving..." : "Save override"}
                      </button>
                      <button
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                        onClick={() => setDraft(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        confirmDisabled={saving}
        confirmLabel={saving ? "Removing..." : "Remove override"}
        destructive
        message={
          removing
            ? `${removing.stateName} will return to the ${data.zoneName} default delivery rate of ${money(data.zoneDefaultFee)}.`
            : ""
        }
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
        open={removing !== null}
        title="Remove this state override?"
      />
    </AdminSection>
  );
}

function overrideError(error: unknown) {
  return isApiClientError(error)
    ? error.message
    : "We couldn't save the delivery-rate override. Please try again.";
}
