import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SocialFeedView } from "@/components/social/SocialFeedView";

export const metadata: Metadata = {
  title: "Moments",
  // A feed is one person's, and it is made of relationships they chose.
  robots: { index: false, follow: false },
};

// Signed-in only. AppLayout carries the owner guard and the existing portal
// chrome; how this route is reached from the global navigation is Phase 1L's
// decision, not this one's.
export default function FeedPage() {
  return (
    <AppLayout>
      <SocialFeedView />
    </AppLayout>
  );
}
