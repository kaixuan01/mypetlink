"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { logoutOwner } from "@/services/authService";

const profileFields = [
  ["Name", "Aina Rahman"],
  ["Email", "aina@example.com"],
  ["WhatsApp number", "+60123456789"],
  ["Phone number", "+60123456789"],
  ["Default general area", "Petaling Jaya, Selangor"],
] as const;

const privacyDefaults = [
  "Show owner display name on public profiles",
  "Show general area instead of full address",
  "Show WhatsApp contact on finder safety pages",
  "Show public pet moments on share profiles",
  "Keep detailed care notes private by default",
];

const notificationOptions = [
  "WhatsApp reminders",
  "Email reminders",
  "Monthly care digest",
];

export function SettingsPanel() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          {profileFields.map(([label, value]) => (
            <label className="grid gap-2" key={label}>
              <span className="text-sm font-bold text-pet-ink">{label}</span>
              <input
                className="brand-input"
                defaultValue={value}
                type={label === "Email" ? "email" : "text"}
              />
            </label>
          ))}
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
        <div className="grid gap-3">
          {privacyDefaults.map((label) => (
            <label
              className="flex items-center justify-between gap-4 rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink"
              key={label}
            >
              {label}
              <input
                className="h-4 w-4 shrink-0 accent-pet-teal"
                defaultChecked
                type="checkbox"
              />
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Notification preferences"
        description="Choose how you receive vaccine, grooming, deworming, and care reminders."
      >
        <div className="grid gap-3">
          {notificationOptions.map((label) => (
            <label
              className="flex items-center justify-between gap-4 rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink"
              key={label}
            >
              {label}
              <input
                className="h-4 w-4 shrink-0 accent-pet-teal"
                defaultChecked
                type="checkbox"
              />
            </label>
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
