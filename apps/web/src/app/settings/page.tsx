import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SettingsPanel } from "@/components/portal/SettingsPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Owner settings",
};

export default function SettingsPage() {
  return (
    <AppLayout>
      <PageHeader
        eyebrow="Owner account"
        title="Owner settings"
        description="Manage your contact details, privacy, communication preferences, and account settings."
      />
      <SettingsPanel />
    </AppLayout>
  );
}
