import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SettingsPanel } from "@/components/portal/SettingsPanel";
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
      <SettingsPanel />
    </AppLayout>
  );
}
