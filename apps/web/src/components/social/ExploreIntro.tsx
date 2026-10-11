import Link from "next/link";
import {
  MomentStreamSkeleton,
  PetCardSkeleton,
} from "@/components/social/SocialSkeletons";
import { marketingRoutes } from "@/lib/routes";

/**
 * What Explore is, in the page's own HTML.
 *
 * Everything below this is client-rendered: the view reads the URL's species
 * filter with `useSearchParams`, which in a static export moves its whole
 * subtree to the browser. Explore used to put its only heading inside that
 * subtree, so the exported page — the one search engines are asked to index —
 * was a title tag and one link. This block renders on the server, outside the
 * Suspense boundary, so the heading, the explanation and the way into the rest
 * of MyPetLink exist before any script runs, and stay put after it does.
 *
 * It names no pet, household or Moment: the page is public, but who appears on
 * it is a per-request answer from the Community visibility rules, never
 * something baked into a file.
 */
export function ExploreIntro() {
  return (
    <section
      aria-labelledby="explore-title"
      className="mx-auto w-full max-w-5xl pt-6"
      data-testid="explore-intro"
    >
      <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal sm:text-sm">
        MyPetLink Community
      </p>
      <h1
        className="mt-1 text-2xl font-black text-pet-ink sm:text-3xl"
        id="explore-title"
      >
        Explore pets and pet families
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-pet-muted sm:text-base">
        Meet cats, dogs and other pets shared by MyPetLink families in
        Malaysia, and see the everyday Moments they post. Only families who
        chose to be found appear here, and anyone can browse without an
        account.
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-pet-muted sm:text-base">
        Every pet here starts with a free{" "}
        <Link
          className="font-bold text-pet-teal underline-offset-4 hover:underline"
          href={marketingRoutes.petProfile}
        >
          Pet Profile
        </Link>
        , with a separate{" "}
        <Link
          className="font-bold text-pet-teal underline-offset-4 hover:underline"
          href={marketingRoutes.safetyProfile}
        >
          Safety Profile
        </Link>{" "}
        for whoever finds them.{" "}
        <Link
          className="font-bold text-pet-teal underline-offset-4 hover:underline"
          href={marketingRoutes.howItWorks}
        >
          See how MyPetLink works
        </Link>
        .
      </p>
    </section>
  );
}

/**
 * Explore while its view is still on the way: the toolbar's footprint, then
 * the two sections in the shape they arrive in.
 *
 * This is the Suspense fallback, so it is what the exported HTML carries and
 * what the browser paints until the view mounts. It used to be `null`, which
 * left a blank page and then pushed everything down at once. The section
 * headings match the view's own, and the view replaces this whole block, so
 * nothing is ever on the page twice.
 */
export function ExploreViewFallback() {
  return (
    <div
      aria-busy="true"
      className="mx-auto w-full max-w-5xl pt-6"
      data-testid="explore-view-fallback"
    >
      <div aria-hidden="true" className="flex gap-2">
        <span className="block h-10 w-40 animate-pulse rounded-full bg-white" />
        <span className="block h-10 w-24 animate-pulse rounded-full bg-white" />
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-black text-pet-ink">Suggested pets</h2>
        <p className="mt-1 text-sm font-semibold text-pet-muted">
          Follow a pet&rsquo;s family to see their Moments in your feed.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PetCardSkeleton />
          <div className="hidden sm:block">
            <PetCardSkeleton />
          </div>
          <div className="hidden lg:block">
            <PetCardSkeleton />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 w-full max-w-xl">
        <h2 className="text-lg font-black text-pet-ink">Latest Moments</h2>
        <MomentStreamSkeleton className="mt-5" />
      </section>
    </div>
  );
}
