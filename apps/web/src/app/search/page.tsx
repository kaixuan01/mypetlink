import type { Metadata } from "next";
import { Suspense } from "react";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import { SocialSearchView } from "@/components/social/SocialSearchView";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

// Public, like Explore. The Suspense boundary is what lets a statically
// exported page read its own query string on the client.
export default function SearchPage() {
  return (
    <SocialLayout>
      <Suspense fallback={null}>
        <SocialSearchView />
      </Suspense>
    </SocialLayout>
  );
}
