import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { BlockedAccountsSettings } from "@/components/portal/BlockedAccountsSettings";
import { SettingsPanel } from "@/components/portal/SettingsPanel";
import { CommunityProfileSettingsLink } from "@/components/portal/CommunityProfileSettingsLink";
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
            <CommunityProfileSettingsLink />
          </div>
          <div className="mt-5">
            <BlockedAccountsSettings />
          </div>
        </>
      ) : null}
    </AppLayout>
  );
}
