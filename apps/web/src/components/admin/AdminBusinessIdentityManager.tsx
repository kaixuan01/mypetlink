"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
} from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import {
  getBusinessIdentity,
  getBusinessIdentityError,
  getBusinessIdentityFieldErrors,
  updateBusinessIdentity,
  type AdminBusinessIdentity,
} from "@/services/adminBusinessIdentityService";
import { isApiClientError } from "@/services/apiClient";
import { listMalaysiaStates } from "@/services/deliveryService";

// The details printed on every customer document. Editing them changes what
// future documents say; documents already issued keep the wording they were
// issued with.

type Draft = {
  brandName: string;
  legalBusinessName: string;
  businessRegistrationNumber: string;
  taxIdentificationNumber: string;
  sstRegistrationNumber: string;
  registeredAddressLine1: string;
  registeredAddressLine2: string;
  registeredPostcode: string;
  registeredCity: string;
  registeredState: string;
  registeredCountry: string;
  supportEmail: string;
  businessPhone: string;
  businessWebsite: string;
  paymentInstructions: string;
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  duitNowDisplayName: string;
};

function toDraft(identity: AdminBusinessIdentity): Draft {
  return {
    brandName: identity.brandName,
    legalBusinessName: identity.legalBusinessName,
    businessRegistrationNumber: identity.businessRegistrationNumber,
    taxIdentificationNumber: identity.taxIdentificationNumber ?? "",
    sstRegistrationNumber: identity.sstRegistrationNumber ?? "",
    registeredAddressLine1: identity.registeredAddressLine1,
    registeredAddressLine2: identity.registeredAddressLine2 ?? "",
    registeredPostcode: identity.registeredPostcode,
    registeredCity: identity.registeredCity,
    registeredState: identity.registeredState,
    registeredCountry: identity.registeredCountry,
    supportEmail: identity.supportEmail,
    businessPhone: identity.businessPhone ?? "",
    businessWebsite: identity.businessWebsite ?? "",
    paymentInstructions: identity.paymentInstructions ?? "",
    bankAccountName: identity.bankAccountName ?? "",
    bankName: identity.bankName ?? "",
    bankAccountNumber: identity.bankAccountNumber ?? "",
    duitNowDisplayName: identity.duitNowDisplayName ?? "",
  };
}

export function AdminBusinessIdentityManager() {
  const [identity, setIdentity] = useState<AdminBusinessIdentity | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [states, setStates] = useState<Array<{ code: string; name: string }>>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await getBusinessIdentity();
      if (!response.data) throw new Error("Business details were not returned.");
      setIdentity(response.data);
      setDraft(toDraft(response.data));
      setError("");
      setStatus("ready");
    } catch (caught) {
      setError(getBusinessIdentityError(caught));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    // A state list we cannot fetch must not block editing: the field falls back
    // to free text below.
    void listMalaysiaStates()
      .then(setStates)
      .catch(() => setStates([]));
  }, []);

  const dirty = useMemo(
    () =>
      identity != null &&
      draft != null &&
      JSON.stringify(draft) !== JSON.stringify(toDraft(identity)),
    [draft, identity]
  );

  async function save() {
    if (!identity || !draft || saving) return;

    setSaving(true);
    setMessage("");
    setError("");
    setFieldErrors({});

    try {
      const response = await updateBusinessIdentity({
        brandName: draft.brandName.trim(),
        legalBusinessName: draft.legalBusinessName.trim(),
        businessRegistrationNumber: draft.businessRegistrationNumber.trim(),
        taxIdentificationNumber: draft.taxIdentificationNumber.trim() || null,
        sstRegistrationNumber: draft.sstRegistrationNumber.trim() || null,
        registeredAddressLine1: draft.registeredAddressLine1.trim(),
        registeredAddressLine2: draft.registeredAddressLine2.trim() || null,
        registeredPostcode: draft.registeredPostcode.trim(),
        registeredCity: draft.registeredCity.trim(),
        registeredState: draft.registeredState.trim(),
        registeredCountry: draft.registeredCountry.trim(),
        supportEmail: draft.supportEmail.trim(),
        businessPhone: draft.businessPhone.trim() || null,
        businessWebsite: draft.businessWebsite.trim() || null,
        paymentInstructions: draft.paymentInstructions.trim() || null,
        bankAccountName: draft.bankAccountName.trim() || null,
        bankName: draft.bankName.trim() || null,
        bankAccountNumber: draft.bankAccountNumber.trim() || null,
        duitNowDisplayName: draft.duitNowDisplayName.trim() || null,
        concurrencyToken: identity.concurrencyToken,
      });
      if (!response.data) throw new Error("Updated details were not returned.");
      setIdentity(response.data);
      setDraft(toDraft(response.data));
      setMessage("Business details saved. New documents will use them.");
    } catch (caught) {
      setError(getBusinessIdentityError(caught));
      setFieldErrors(getBusinessIdentityFieldErrors(caught));
      if (
        isApiClientError(caught) &&
        (caught.code === "concurrency_conflict" || caught.status === 409)
      ) {
        await load();
        setError(getBusinessIdentityError(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
        Loading business details...
      </div>
    );
  }

  if (status === "error" || !identity || !draft) {
    return (
      <div
        className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-6 text-sm font-bold text-[#a63c2e]"
        role="alert"
      >
        {error || "We could not load the business details."}
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const missing = identity.completeness.missingForMerchantInvoice;

  return (
    <div className="space-y-5 sm:space-y-6" data-testid="business-identity">
      <div
        className="rounded-2xl border border-slate-200 bg-white p-5"
        data-testid="business-identity-readiness"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={identity.completeness.readyForRetailDocuments ? "mint" : "warm"}>
            {identity.completeness.readyForRetailDocuments
              ? "Ready for customer receipts"
              : "Customer receipts incomplete"}
          </Badge>
          <Badge tone={identity.completeness.readyForMerchantInvoice ? "mint" : "warm"}>
            {identity.completeness.readyForMerchantInvoice
              ? "Ready for business invoices"
              : "Business invoices incomplete"}
          </Badge>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-500">
          {missing.length > 0
            ? `Add the following before issuing a business quotation or invoice: ${missing.join(", ")}.`
            : "Everything needed for customer receipts and business invoices has been filled in."}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Last updated {formatAdminDateTime(identity.updatedAt)}
          {identity.updatedBy ? ` by ${identity.updatedBy}` : ""}.
        </p>
      </div>

      {message ? <AdminNotice>{message}</AdminNotice> : null}
      {error ? (
        <div
          className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <AdminSection
        description="How the business is named on order summaries, receipts, quotations and invoices."
        title="Business name and registration"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            error={fieldErrors.brandName}
            label="Brand name"
            onChange={(value) => set({ brandName: value })}
            required
            value={draft.brandName}
          />
          <Field
            error={fieldErrors.legalBusinessName}
            label="Registered business name"
            onChange={(value) => set({ legalBusinessName: value })}
            required
            value={draft.legalBusinessName}
          />
          <Field
            error={fieldErrors.businessRegistrationNumber}
            label="Business registration number"
            onChange={(value) => set({ businessRegistrationNumber: value })}
            required
            value={draft.businessRegistrationNumber}
          />
          <Field
            hint="Leave empty if the business is not registered for tax."
            label="Tax identification number"
            onChange={(value) => set({ taxIdentificationNumber: value })}
            value={draft.taxIdentificationNumber}
          />
          <Field
            hint="Leave empty if the business is not SST registered."
            label="SST registration number"
            onChange={(value) => set({ sstRegistrationNumber: value })}
            value={draft.sstRegistrationNumber}
          />
        </div>
      </AdminSection>

      <AdminSection
        description="Printed on business quotations and invoices. Fill in every line, or leave the whole address empty until it is confirmed."
        title="Registered address"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              error={fieldErrors.registeredAddressLine1}
              label="Address line 1"
              onChange={(value) => set({ registeredAddressLine1: value })}
              value={draft.registeredAddressLine1}
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Address line 2"
              onChange={(value) => set({ registeredAddressLine2: value })}
              value={draft.registeredAddressLine2}
            />
          </div>
          <Field
            label="Postcode"
            maxLength={5}
            inputMode="numeric"
            onChange={(value) => set({ registeredPostcode: value })}
            value={draft.registeredPostcode}
          />
          <Field
            label="City"
            onChange={(value) => set({ registeredCity: value })}
            value={draft.registeredCity}
          />
          {states.length > 0 ? (
            <label className="grid gap-1 text-sm font-bold text-pet-ink">
              State
              <select
                className={inputClass}
                onChange={(event) => set({ registeredState: event.target.value })}
                value={draft.registeredState}
              >
                <option value="">Select state</option>
                {states.map((state) => (
                  <option key={state.code} value={state.name}>
                    {state.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Field
              label="State"
              onChange={(value) => set({ registeredState: value })}
              value={draft.registeredState}
            />
          )}
          <Field
            error={fieldErrors.registeredCountry}
            label="Country"
            onChange={(value) => set({ registeredCountry: value })}
            required
            value={draft.registeredCountry}
          />
        </div>
      </AdminSection>

      <AdminSection
        description="How customers and business buyers reach MyPetLink."
        title="Contact details"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            error={fieldErrors.supportEmail}
            label="Support email"
            onChange={(value) => set({ supportEmail: value })}
            required
            type="email"
            value={draft.supportEmail}
          />
          <Field
            label="Business phone"
            onChange={(value) => set({ businessPhone: value })}
            value={draft.businessPhone}
          />
          <Field
            label="Website"
            onChange={(value) => set({ businessWebsite: value })}
            value={draft.businessWebsite}
          />
        </div>
      </AdminSection>

      <AdminSection
        description="Shown on business invoices so a buyer knows how to pay. Never enter a login, PIN or password here."
        title="Payment details"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            label="Account holder name"
            onChange={(value) => set({ bankAccountName: value })}
            value={draft.bankAccountName}
          />
          <Field
            label="Bank"
            onChange={(value) => set({ bankName: value })}
            value={draft.bankName}
          />
          <Field
            label="Account number"
            onChange={(value) => set({ bankAccountNumber: value })}
            value={draft.bankAccountNumber}
          />
          <Field
            hint="The name a buyer sees when paying by DuitNow."
            label="DuitNow display name"
            onChange={(value) => set({ duitNowDisplayName: value })}
            value={draft.duitNowDisplayName}
          />
          <label className="grid gap-1 text-sm font-bold text-pet-ink sm:col-span-2">
            Payment instructions
            <textarea
              className={`${inputClass} min-h-28 py-3`}
              maxLength={2000}
              onChange={(event) => set({ paymentInstructions: event.target.value })}
              value={draft.paymentInstructions}
            />
            <span className="text-sm font-semibold text-pet-muted">
              Printed under the payment details on business invoices.
            </span>
          </label>
        </div>
      </AdminSection>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          className="min-h-11 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-black text-pet-ink disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!dirty || saving}
          onClick={() => {
            setDraft(toDraft(identity));
            setFieldErrors({});
            setError("");
            setMessage("");
          }}
          type="button"
        >
          Discard changes
        </button>
        <button
          className="min-h-11 rounded-full bg-pet-teal px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"
          data-testid="business-identity-save"
          disabled={!dirty || saving}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "Saving…" : "Save business details"}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-pet-border bg-white px-3 font-semibold text-pet-ink outline-none focus:border-pet-teal disabled:bg-slate-100";

function Field({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="grid gap-1 text-sm font-bold text-pet-ink">
      {label}
      {required ? " *" : ""}
      <input
        {...inputProps}
        aria-invalid={error ? true : undefined}
        className={inputClass}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {error ? (
        <span className="text-sm font-bold text-[#a63c2e]">{error}</span>
      ) : hint ? (
        <span className="text-sm font-semibold text-pet-muted">{hint}</span>
      ) : null}
    </label>
  );
}
