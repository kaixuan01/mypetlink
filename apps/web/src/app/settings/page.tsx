import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { BlockedAccountsSettings } from "@/components/portal/BlockedAccountsSettings";
import { SettingsPanel } from "@/components/portal/SettingsPanel";
import { SocialProfileSettingsSection } from "@/components/portal/SocialProfileSettingsSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { socialEnabled } from "@/lib/features";

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
      {socialEnabled ? (
        <>
          <div className="mt-5">
            <SocialProfileSettingsSection />
          </div>
          <div className="mt-5">
            <BlockedAccountsSettings />
          </div>
        </>
      ) : null}
    </AppLayout>
  );
}
