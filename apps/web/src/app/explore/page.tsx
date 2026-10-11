import type { Metadata } from "next";
import { Suspense } from "react";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import {
  ExploreIntro,
  ExploreViewFallback,
} from "@/components/social/ExploreIntro";
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
// Indexable only while Community is offered: `seoRoutes.ts` ties this page's
// robots tag and its sitemap entry to the same flag.
export const metadata: Metadata = createMarketingMetadata({
  path: socialRoutes.explore,
  title: "Explore Pets and Pet Families | MyPetLink Community",
  description:
    "Meet pets shared by MyPetLink families in Malaysia and see the everyday Moments they post. Browse the community free — no account needed.",
});

// Public, and part of the product: a visitor gets a brand header and a way in,
// a signed-in owner gets the same page inside the shell they already use.
//
// The heading and introduction sit outside the Suspense boundary so they are in
// the exported HTML; the view below reads the URL and renders in the browser.
export default function ExplorePage() {
  return (
    <SocialLayout>
      <ExploreIntro />
      <Suspense fallback={<ExploreViewFallback />}>
        <SocialExploreView />
      </Suspense>
    </SocialLayout>
  );
}
