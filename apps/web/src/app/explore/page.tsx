import type { Metadata } from "next";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import { SocialExploreView } from "@/components/social/SocialExploreView";
import { createMarketingMetadata } from "@/lib/seo";
import { socialRoutes } from "@/lib/routes";

/**
 * Explore is the public front door of Community, so it is described like one:
 * canonical URL, title and description through the same helper every public
 * page uses, and indexable.
 *
 * What stays out of the index is the content itself. A household choosing to be
 * discoverable inside MyPetLink has not thereby asked to appear in a search
 * engine, so individual profiles and Moments keep their noindex and only this
 * doorway is listed. If that ever changes it should be an explicit choice an
 * owner makes, not a side effect of a marketing decision.
 */
export const metadata: Metadata = createMarketingMetadata({
  path: socialRoutes.explore,
  title: "Explore Pets and Pet Families | MyPetLink Community",
  description:
    "Meet pets shared by MyPetLink families in Malaysia and see the everyday Moments they post. Browse the community free — no account needed.",
});

// Public, and part of the product: a visitor gets a brand header and a way in,
// a signed-in owner gets the same page inside the shell they already use.
export default function ExplorePage() {
  return (
    <SocialLayout>
      <SocialExploreView />
    </SocialLayout>
  );
}
