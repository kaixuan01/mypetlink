import type { Metadata } from "next";
import { Suspense } from "react";
import { SocialSearchView } from "@/components/social/SocialSearchView";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

// Public, like Explore. The Suspense boundary is what lets a statically
// exported page read its own query string on the client.
export default function SearchPage() {
  return (
    <main className="min-h-screen bg-pet-cream">
      <Suspense fallback={null}>
        <SocialSearchView />
      </Suspense>
    </main>
  );
}
