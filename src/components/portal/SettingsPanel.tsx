"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { logoutOwner } from "@/services/authService";

type SettingsState = {
  name: string;
  email: string;
  whatsapp: string;
  phone: string;
  defaultArea: string;
  privacy: Record<PrivacyKey, boolean>;
  notifications: Record<NotificationKey, boolean>;
};

type PrivacyKey =
  | "ownerName"
  | "generalArea"
  | "whatsapp"
  | "moments"
  | "careNotesPrivate";

type NotificationKey = "whatsappReminders" | "emailReminders" | "careDigest";

const SETTINGS_STORAGE_KEY = "mypetlink_owner_settings";

const defaultSettings: SettingsState = {
  name: "Aina Rahman",
  email: "aina@example.com",
  whatsapp: "+60123456789",
  phone: "+60123456789",
  defaultArea: "Petaling Jaya, Selangor",
  privacy: {
    ownerName: true,
    generalArea: true,
    whatsapp: true,
    moments: true,
    careNotesPrivate: true,
  },
  notifications: {
    whatsappReminders: true,
    emailReminders: true,
    careDigest: true,
  },
};

const privacyDefaults: { key: PrivacyKey; label: string }[] = [
  {
    key: "ownerName",
    label: "Show owner display name publicly",
  },
  {
    key: "generalArea",
    label: "Show general area instead of full address",
  },
  {
    key: "whatsapp",
    label: "Show WhatsApp contact on finder safety pages",
  },
  {
    key: "moments",
    label: "Show public pet moments on share profiles",
  },
  {
    key: "careNotesPrivate",
    label: "Keep detailed care notes private by default",
  },
];

const notificationOptions: { key: NotificationKey; label: string }[] = [
  { key: "whatsappReminders", label: "WhatsApp reminders" },
  { key: "emailReminders", label: "Email reminders" },
  { key: "careDigest", label: "Monthly care digest" },
];

export function SettingsPanel() {
  const router = useRouter();
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(readStoredSettings());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function updateField(
    field: "name" | "email" | "whatsapp" | "phone" | "defaultArea",
    value: string
  ) {
    setSettings((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function updatePrivacy(key: PrivacyKey, value: boolean) {
    setSettings((current) => ({
      ...current,
      privacy: { ...current.privacy, [key]: value },
    }));
    setSaved(false);
  }

  function updateNotification(key: NotificationKey, value: boolean) {
    setSettings((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }));
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
          Settings saved.
        </div>
      ) : null}

      <FormSection
        title="Owner profile and contact"
        description="These details help keep your pet profiles and finder contact actions up to date."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Owner display name"
            onChange={(value) => updateField("name", value)}
            value={settings.name}
          />
          <TextField
            label="Email"
            onChange={(value) => updateField("email", value)}
            type="email"
            value={settings.email}
          />
          <TextField
            label="WhatsApp number"
            onChange={(value) => updateField("whatsapp", value)}
            value={settings.whatsapp}
          />
          <TextField
            label="Phone number"
            onChange={(value) => updateField("phone", value)}
            value={settings.phone}
          />
          <TextField
            label="Default general area"
            onChange={(value) => updateField("defaultArea", value)}
            value={settings.defaultArea}
          />
        </div>
        <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
          Your full address is not shown on public profiles. Use a general area
          so finders know where your pet is usually from.
        </p>
      </FormSection>

      <FormSection
        title="Privacy defaults"
        description="Choose what new pet profiles should show unless you change it for a specific pet."
      >
        <p className="mb-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
          Public owner name setting: use your display name when you want it
          shown, or leave pet profiles set to show labels such as Milo&apos;s
          owner.
        </p>
        <div className="grid gap-3">
          {privacyDefaults.map((option) => (
            <Checkbox
              checked={settings.privacy[option.key]}
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
              checked={settings.notifications[option.key]}
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

function readStoredSettings(): SettingsState {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  const value = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

  if (!value) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SettingsState>;

    return {
      ...defaultSettings,
      ...parsed,
      privacy: {
        ...defaultSettings.privacy,
        ...parsed.privacy,
      },
      notifications: {
        ...defaultSettings.notifications,
        ...parsed.notifications,
      },
    };
  } catch {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    return defaultSettings;
  }
}
