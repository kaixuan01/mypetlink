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
  type OwnerNotificationPreferences,
  type OwnerPrivacyDefaults,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { logoutOwner } from "@/services/authService";
import { isApiConfigured } from "@/services/apiConfig";
import { isApiClientError } from "@/services/apiClient";
import {
  getOwnerProfileSettings,
  updateOwnerProfileSettings,
} from "@/services/ownerProfileService";

type PrivacyKey = keyof OwnerPrivacyDefaults;
type NotificationKey = keyof OwnerNotificationPreferences;

const privacyDefaults: { key: PrivacyKey; label: string }[] = [
  {
    key: "showOwnerName",
    label: "Show owner display name",
  },
  {
    key: "showGeneralArea",
    label: "Show general area",
  },
  {
    key: "showWhatsapp",
    label: "Show WhatsApp contact",
  },
  {
    key: "showPhone",
    label: "Show call contact",
  },
  {
    key: "showEmergencyNote",
    label: "Show emergency note",
  },
  {
    key: "showCareBadges",
    label: "Show care badges",
  },
  {
    key: "showMoments",
    label: "Show public memories",
  },
  {
    key: "showTimeline",
    label: "Show Life Timeline",
  },
  {
    key: "showBirthdayOnTimeline",
    label: "Show birthday in Life Timeline",
  },
  {
    key: "showAdoptionDayOnTimeline",
    label: "Show adoption day in Life Timeline",
  },
  {
    key: "showHealthSummary",
    label: "Allow public care record details",
  },
];

const notificationOptions: { key: NotificationKey; label: string }[] = [
  { key: "whatsappReminders", label: "WhatsApp reminders" },
  { key: "emailReminders", label: "Email reminders" },
  { key: "careDigest", label: "Monthly care digest" },
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

  function updatePrivacy(key: PrivacyKey, value: boolean) {
    setSettings((current) =>
      current
        ? {
            ...current,
            privacyDefaults: { ...current.privacyDefaults, [key]: value },
          }
        : current
    );
    setSaved(false);
  }

  function updateNotification(key: NotificationKey, value: boolean) {
    setSettings((current) =>
      current
        ? {
            ...current,
            notificationPreferences: {
              ...current.notificationPreferences,
              [key]: value,
            },
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

      <div className="sticky top-4 z-10 hidden justify-end lg:flex">
        <CTAButton disabled={!dirty || saving} type="submit" variant="coral">
          {saving ? "Saving..." : "Save Settings"}
        </CTAButton>
      </div>

      <FormSection
        id="owner-contact"
        title="Owner Contact Details"
        description="These details help finders contact you quickly if your pet is ever lost. They are also used as the defaults for new pet profiles."
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

      <div className="brand-soft-card rounded-[1.5rem] p-5 text-sm leading-6 text-pet-muted">
        The settings below are used as defaults for new pet profiles. You can
        override them for each pet from that pet&apos;s Edit Pet Details page.
      </div>

      <FormSection
        title="Privacy defaults"
        description="Choose what new pet profiles should show by default. Existing pets keep their own settings unless you update them."
      >
        <p className="mb-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
          To update an existing pet, open that pet&apos;s Edit Pet Details page.
        </p>
        <div className="grid gap-3">
          {privacyDefaults.map((option) => (
            <Checkbox
              checked={settings.privacyDefaults[option.key]}
              key={option.key}
              label={option.label}
              onChange={(value) => updatePrivacy(option.key, value)}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Notification preferences"
        description="Choose how you receive vaccine, grooming, deworming, and care reminders."
      >
        <div className="grid gap-3">
          {notificationOptions.map((option) => (
            <Checkbox
              checked={settings.notificationPreferences[option.key]}
              key={option.key}
              label={option.label}
              onChange={(value) => updateNotification(option.key, value)}
            />
          ))}
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

      <MobileFormActionBar
        disabled={!dirty}
        formId="owner-settings-form"
        pending={saving}
        primaryLabel="Save Settings"
      />
    </form>
  );
}

function isSettingsDirty(current: OwnerSettings, saved: OwnerSettings) {
  return JSON.stringify(current) !== JSON.stringify(saved);
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

function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink">
      {label}
      <input
        checked={checked}
        className="h-4 w-4 shrink-0 accent-pet-teal"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
