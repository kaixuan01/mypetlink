"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { MobileFormActionBar } from "@/components/portal/MobileFormActionBar";
import { PlanSummaryCard } from "@/components/portal/PlanSummaryCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import {
  defaultOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { logoutOwner } from "@/services/authService";
import { isApiConfigured } from "@/services/apiConfig";
import { isApiClientError } from "@/services/apiClient";
import {
  getOwnerProfileSettings,
  updateOwnerProfileSettings,
} from "@/services/ownerProfileService";

const premiumReminderOptions = [
  {
    label: "WhatsApp care reminders",
    description:
      "Receive vaccine, grooming, deworming, medication, and appointment reminders through WhatsApp.",
  },
  {
    label: "Email care reminders",
    description: "Receive upcoming care reminders by email.",
  },
  {
    label: "Monthly care digest",
    description:
      "Receive a monthly summary of upcoming and recently completed care activities.",
  },
];

export function SettingsPanel() {
  const router = useRouter();
  const apiMode = isApiConfigured();
  // null = the authenticated owner's data has not resolved yet. The form (and
  // Save) only render with real values — never sample/default personal data.
  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<OwnerSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getOwnerProfileSettings()
      .then((response) => {
        if (active) {
          const loaded = structuredClone(response.data);
          setSettings(loaded);
          setSavedSettings(structuredClone(loaded));
          setLoadError("");
        }
      })
      .catch((caught) => {
        if (!active) {
          return;
        }

        // No profile yet: start a brand-new, empty owner profile — never a
        // sample one.
        if (isApiClientError(caught) && caught.status === 404) {
          const empty = structuredClone(defaultOwnerSettings);
          setSettings(empty);
          setSavedSettings(structuredClone(empty));
          setLoadError("");
          return;
        }

        setLoadError(getSettingsErrorMessage(caught));
      });

    return () => {
      active = false;
    };
  }, [retryToken]);

  function updateField(
    field:
      | "ownerDisplayName"
      | "email"
      | "whatsappNumber"
      | "phoneNumber"
      | "defaultGeneralArea",
    value: string
  ) {
    setSettings((current) => (current ? { ...current, [field]: value } : current));
    setSaved(false);
  }

  function updateMarketingEmailOptIn(value: boolean) {
    setSettings((current) =>
      current
        ? {
            ...current,
            marketingEmailOptIn: value,
          }
        : current
    );
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settings || !savedSettings || !isSettingsDirty(settings, savedSettings)) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await updateOwnerProfileSettings(settings);
      const savedResponse = structuredClone(response.data);
      setSettings(savedResponse);
      setSavedSettings(structuredClone(savedResponse));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3500);
    } catch (caught) {
      setError(getSettingsErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logoutOwner();
    router.replace("/");
  }

  if (!settings && loadError) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6 text-center">
        <p className="text-sm font-extrabold uppercase text-[#a63c2e]">
          Connection needed
        </p>
        <h2 className="mt-2 text-xl font-black text-pet-ink">
          We couldn&rsquo;t load your details
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-pet-muted">
          {loadError}
        </p>
        <CTAButton
          className="mt-5"
          onClick={() => setRetryToken((token) => token + 1)}
          variant="secondary"
        >
          Retry
        </CTAButton>
      </section>
    );
  }

  if (!settings) {
    return <SettingsSkeleton />;
  }

  const dirty = savedSettings ? isSettingsDirty(settings, savedSettings) : false;

  return (
    <form className="grid gap-5" id="owner-settings-form" onSubmit={handleSubmit}>
      {error ? (
        <div
          className="rounded-[1.25rem] border border-[#ffd5cf] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {saved ? (
        <div
          className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage"
          role="status"
        >
          Account defaults saved.
        </div>
      ) : null}

      {dirty ? (
        <div className="sticky top-4 z-10 hidden justify-end lg:flex">
          <CTAButton disabled={saving} type="submit" variant="coral">
            {saving ? "Saving..." : "Save settings"}
          </CTAButton>
        </div>
      ) : null}

      <FormSection
        id="owner-contact"
        title="Contact details"
        description="These details help finders contact you quickly if your pet is ever lost."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Owner display name"
            onChange={(value) => updateField("ownerDisplayName", value)}
            placeholder="e.g. Sarah Tan"
            value={settings.ownerDisplayName}
          />
          <TextField
            disabled={apiMode}
            label="Email"
            onChange={(value) => updateField("email", value)}
            placeholder="you@example.com"
            type="email"
            value={settings.email}
          />
          <PhoneNumberInput
            label="WhatsApp number"
            onChange={(value) => updateField("whatsappNumber", value)}
            value={settings.whatsappNumber}
          />
          <PhoneNumberInput
            label="Phone number"
            onChange={(value) => updateField("phoneNumber", value)}
            value={settings.phoneNumber}
          />
          <TextField
            label="Default general area"
            onChange={(value) => updateField("defaultGeneralArea", value)}
            placeholder="e.g. Petaling Jaya, Selangor"
            value={settings.defaultGeneralArea}
          />
        </div>
        <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
          Your full address is not shown on public profiles. Use a general area
          so finders know where your pet is usually from.
        </p>
      </FormSection>

      <FormSection
        title="Communication preferences"
        description="Review essential messages, future care reminders, and optional MyPetLink updates separately."
      >
        <div className="grid gap-5">
          <section
            aria-labelledby="essential-email-heading"
            className="rounded-[1.25rem] border border-pet-border bg-white p-4"
          >
            <h3
              className="text-sm font-black text-pet-ink"
              id="essential-email-heading"
            >
              Essential account and order emails
            </h3>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              Important account and order emails are sent when required.
            </p>
          </section>

          <section
            aria-labelledby="care-reminders-heading"
            className="rounded-[1.25rem] border border-pet-border bg-pet-cream p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-sm font-black text-pet-ink"
                id="care-reminders-heading"
              >
                Premium care reminders
              </h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-pet-teal">
                Coming soon
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              Care reminders will be available with MyPetLink Premium.
            </p>
            <div className="mt-4 grid gap-3">
              {premiumReminderOptions.map((option) => (
                <PreferenceCheckbox
                  checked={false}
                  description={option.description}
                  disabled
                  key={option.label}
                  label={option.label}
                />
              ))}
            </div>
          </section>

          <section
            aria-labelledby="marketing-email-heading"
            className="rounded-[1.25rem] border border-[#b9d8ff] bg-[#f4f9ff] p-4"
          >
            <h3
              className="text-sm font-black text-pet-ink"
              id="marketing-email-heading"
            >
              Optional updates
            </h3>
            <div className="mt-3">
              <PreferenceCheckbox
                checked={settings.marketingEmailOptIn}
                description="Receive occasional product updates, promotions, new features, and special offers."
                label="MyPetLink news and offers"
                onChange={updateMarketingEmailOptIn}
              />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-pet-muted">
              You can change this preference at any time.
            </p>
          </section>
        </div>
      </FormSection>

      <PlanSummaryCard />

      <div className="brand-card flex flex-col gap-3 rounded-[1.5rem] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-pet-ink">Account actions</h2>
          <p className="mt-1 text-sm text-pet-muted">
            Sign out of the owner portal on this device.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>
      </div>

      {dirty ? (
        <MobileFormActionBar
          formId="owner-settings-form"
          pending={saving}
          primaryLabel="Save settings"
        />
      ) : null}
    </form>
  );
}

function isSettingsDirty(current: OwnerSettings, saved: OwnerSettings) {
  return JSON.stringify(toEditableSettings(current)) !== JSON.stringify(toEditableSettings(saved));
}

function toEditableSettings(settings: OwnerSettings) {
  return {
    ownerDisplayName: settings.ownerDisplayName,
    email: settings.email,
    whatsappNumber: settings.whatsappNumber,
    phoneNumber: settings.phoneNumber,
    defaultGeneralArea: settings.defaultGeneralArea,
    marketingEmailOptIn: settings.marketingEmailOptIn,
  };
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: "email" | "text";
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>
      <input
        className="brand-input"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

// Form-shaped placeholder shown while the owner's saved details load. It
// deliberately contains no field values at all.
function SettingsSkeleton() {
  return (
    <div aria-live="polite" className="grid gap-5" role="status">
      <span className="sr-only">Loading your saved details</span>
      {[0, 1, 2].map((section) => (
        <section
          aria-hidden="true"
          className="brand-card rounded-[1.75rem] p-5 sm:p-6"
          key={section}
        >
          <div className="h-5 w-48 animate-pulse rounded-full bg-pet-cream" />
          <div className="mt-2 h-3.5 w-72 max-w-full animate-pulse rounded-full bg-pet-cream" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((field) => (
              <div className="grid gap-2" key={field}>
                <div className="h-3.5 w-32 animate-pulse rounded-full bg-pet-cream" />
                <div className="h-12 animate-pulse rounded-2xl bg-pet-cream" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function getSettingsErrorMessage(error: unknown) {
  if (isApiClientError(error)) {
    if (error.code === "validation_failed" && error.details) {
      return Object.values(error.details)[0]?.[0] ?? error.message;
    }

    if (error.status === 0) {
      return "We could not reach MyPetLink right now. Please try again.";
    }

    return error.message;
  }

  return "We could not save your settings. Please try again.";
}

function PreferenceCheckbox({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-14 items-start justify-between gap-4 rounded-2xl border p-4 ${
        disabled
          ? "cursor-not-allowed border-pet-border bg-white/70 text-pet-muted"
          : "cursor-pointer border-[#cfe3ff] bg-white text-pet-ink"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-pet-muted">
          {description}
        </span>
      </span>
      <input
        checked={checked}
        className="mt-1 h-5 w-5 shrink-0 accent-pet-teal"
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
