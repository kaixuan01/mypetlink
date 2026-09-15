import type { Metadata } from "next";
import { SocialExploreView } from "@/components/social/SocialExploreView";

export const metadata: Metadata = {
  title: "Explore pets",
  description:
    "Meet pets shared by MyPetLink families and follow the families behind them.",
};

// Deliberately outside the owner portal shell: somebody who followed a shared
// link should be able to look around before deciding whether to join.
export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-pet-cream">
      <SocialExploreView />
    </main>
  );
}
