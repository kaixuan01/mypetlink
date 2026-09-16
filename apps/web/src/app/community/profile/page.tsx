import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { CommunityMyProfileView } from "@/components/social/CommunityMyProfileView";
import { socialEnabled } from "@/lib/features";

export const metadata: Metadata = {
  title: "My profile",
  // One person's own profile, inside the app.
  robots: { index: false, follow: false },
};

/**
 * The owner's own Community profile.
 *
 * Inside the Community shell, so opening your own profile does not feel like
 * leaving the product. The public page a visitor sees stays at /u/{handle} and
 * keeps its own bare shell — same content, different audience.
 */
export default function CommunityProfilePage() {
  return (
    <AppLayout>
      {socialEnabled ? (
        <CommunityMyProfileView />
      ) : (
        <p className="mt-5 text-sm font-semibold text-pet-muted">
          The MyPetLink community isn&rsquo;t open yet. Your pet profiles and
          Safety Profiles are unaffected.
        </p>
      )}
    </AppLayout>
  );
}
