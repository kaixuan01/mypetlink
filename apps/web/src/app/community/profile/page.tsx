import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SocialProfileSettingsSection } from "@/components/portal/SocialProfileSettingsSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { socialEnabled } from "@/lib/features";

export const metadata: Metadata = {
  title: "Edit your Community profile",
  // One person's own settings screen.
  robots: { index: false, follow: false },
};

/**
 * Editing the Community identity, from inside Community.
 *
 * This used to live only at the bottom of Owner Settings, which meant changing
 * how you appear in the community required leaving it, opening a pet-management
 * screen and scrolling past contact details and plan usage to find yourself.
 * The form is the same one — moved, not forked — so there is still exactly one
 * implementation of handle, display name, photo, the social switches and each
 * pet's participation.
 */
export default function CommunityProfilePage() {
  return (
    <AppLayout>
      <PageHeader
        eyebrow="Community"
        title="Your Community profile"
        description="The name, photo and handle other pet parents see, and which of your pets appear alongside them."
      />
      {socialEnabled ? (
        <SocialProfileSettingsSection />
      ) : (
        <p className="mt-5 text-sm font-semibold text-pet-muted">
          The MyPetLink community isn&rsquo;t open yet. Your pet profiles and
          Safety Profiles are unaffected.
        </p>
      )}
    </AppLayout>
  );
}
