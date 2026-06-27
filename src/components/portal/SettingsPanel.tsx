"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import {
  defaultOwnerSettings,
  readOwnerSettings,
  writeOwnerSettings,
  type OwnerNotificationPreferences,
  type OwnerPrivacyDefaults,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { logoutOwner } from "@/services/authService";

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
  const [settings, setSettings] = useState<OwnerSettings>(defaultOwnerSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(readOwnerSettings());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function updateField(
    field:
      | "ownerDisplayName"
      | "email"
      | "whatsappNumber"
      | "phoneNumber"
      | "defaultGeneralArea",
    value: string
  ) {
    setSettings((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function updatePrivacy(key: PrivacyKey, value: boolean) {
    setSettings((current) => ({
      ...current,
      privacyDefaults: { ...current.privacyDefaults, [key]: value },
    }));
    setSaved(false);
  }

  function updateNotification(key: NotificationKey, value: boolean) {
    setSettings((current) => ({
      ...current,
      notificationPreferences: {
        ...current.notificationPreferences,
        [key]: value,
      },
    }));
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    writeOwnerSettings(settings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3500);
  }

  function handleLogout() {
    logoutOwner();
    router.replace("/");
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      {saved ? (
        <div
          className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage"
          role="status"
        >
          Account defaults saved.
        </div>
      ) : null}

      <div className="brand-soft-card rounded-[1.5rem] p-5 text-sm leading-6 text-pet-muted">
        These settings are used as defaults for new pet profiles. You can
        override them for each pet from that pet&apos;s Edit Pet Details page.
      </div>

      <FormSection
        title="Owner profile and contact"
        description="Account-level details used when you create a new pet profile."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Owner display name"
            onChange={(value) => updateField("ownerDisplayName", value)}
            value={settings.ownerDisplayName}
          />
          <TextField
            label="Email"
            onChange={(value) => updateField("email", value)}
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
            value={settings.defaultGeneralArea}
          />
        </div>
        <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
          Your full address is not shown on public profiles. Use a general area
          so finders know where your pet is usually from.
        </p>
      </FormSection>

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

      <div className="brand-card flex flex-col gap-3 rounded-[1.5rem] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-pet-ink">Account actions</h2>
          <p className="mt-1 text-sm text-pet-muted">
            Save your preferences or sign out of the owner portal.
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
          <CTAButton type="submit" variant="coral">
            Save Settings
          </CTAButton>
        </div>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "email" | "text";
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>
      <input
        className="brand-input"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
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
