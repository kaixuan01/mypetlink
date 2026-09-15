import type { Metadata } from "next";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import { SocialExploreView } from "@/components/social/SocialExploreView";

export const metadata: Metadata = {
  title: "Explore pets",
  description:
    "Meet pets shared by MyPetLink families and follow the families behind them.",
};

// Public, and part of the product: a visitor gets a brand header and a way in,
// a signed-in owner gets the same page inside the shell they already use.
export default function ExplorePage() {
  return (
    <SocialLayout>
      <SocialExploreView />
    </SocialLayout>
  );
}
