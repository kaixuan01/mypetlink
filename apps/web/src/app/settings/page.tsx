import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SettingsPanel } from "@/components/portal/SettingsPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Owner Profile & Contact",
};

export default function SettingsPage() {
  return (
    <AppLayout>
      <PageHeader
        eyebrow="Owner account"
        title="Owner Profile & Contact"
        description="Keep your phone and WhatsApp details up to date so finders can reach you quickly if your pet is ever lost."
      />
      <SettingsPanel />
    </AppLayout>
  );
}
