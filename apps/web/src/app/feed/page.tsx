import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SocialFeedView } from "@/components/social/SocialFeedView";

export const metadata: Metadata = {
  // "Home", like the heading and the bottom bar. "Moments" named a thing that
  // exists in two other places — My Pets and the Community profile — and named
  // none of them uniquely.
  title: "Home",
  // A feed is one person's, and it is made of relationships they chose.
  robots: { index: false, follow: false },
};

// Signed-in only. AppLayout carries the owner guard and the shared shell; the
// social phone bar replaces the management one while you are on this side.
export default function FeedPage() {
  return (
    <AppLayout>
      <SocialFeedView />
    </AppLayout>
  );
}
