import type { Metadata } from "next";
import { AppLayout } from "@/components/layouts/AppLayout";
import { SocialNotificationsView } from "@/components/social/SocialNotificationsView";

export const metadata: Metadata = {
  title: "Activity",
  // One person's activity, made of relationships they chose.
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return (
    <AppLayout>
      <SocialNotificationsView />
    </AppLayout>
  );
}
