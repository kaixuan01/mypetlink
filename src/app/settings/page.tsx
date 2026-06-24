import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <AppLayout>
      <PageHeader
        eyebrow="Settings"
        title="Owner account preferences"
        description="Manage your contact details, privacy preferences, and reminder options."
      />
      <div className="grid gap-5">
        <FormSection
          title="Profile"
          description="Owner details used for pet profiles and reminders."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Name", "Aina Rahman"],
              ["Email", "aina@example.com"],
              ["Phone", "+60123456789"],
              ["Default area", "Petaling Jaya, Selangor"],
            ].map(([label, value]) => (
              <label className="grid gap-2" key={label}>
                <span className="text-sm font-bold text-pet-ink">{label}</span>
                <input
                  className="brand-input"
                  defaultValue={value}
                  type="text"
                />
              </label>
            ))}
          </div>
        </FormSection>
        <FormSection
          title="Notifications"
          description="Choose how you receive vaccine, grooming, and deworming reminders."
        >
          <div className="grid gap-3">
            {["WhatsApp reminders", "Email reminders", "Monthly care digest"].map(
              (label) => (
                <label
                  className="flex items-center justify-between rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink"
                  key={label}
                >
                  {label}
                  <input
                    className="h-4 w-4 accent-pet-teal"
                    defaultChecked
                    type="checkbox"
                  />
                </label>
              )
            )}
          </div>
        </FormSection>
        <div className="flex justify-end">
          <CTAButton disabled>Save Settings</CTAButton>
        </div>
      </div>
    </AppLayout>
  );
}
