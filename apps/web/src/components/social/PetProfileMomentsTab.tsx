"use client";

import { useCallback } from "react";
import { SocialMomentCard } from "@/components/social/SocialMomentCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { MomentPagesFooter } from "@/components/social/MomentPagesFooter";
import { useMomentPages } from "@/lib/useMomentPages";
import { useSignedIn } from "@/lib/useSignedIn";
import { getPublicPetMoments } from "@/services/publicSocialService";

type PetProfileMomentsTabProps = {
  /** The pet's public slug or code; the API accepts either form. */
  publicSlug: string;
  petName: string;
};

/**
 * A pet's Moments, on the same social read model as every other social surface.
 *
 * This tab used to render from the Moment array embedded in the public profile
 * payload, which meant it was the one social surface with no like state and no
 * paging — an older version of the product sitting inside the new one. It now
 * reads the social listing, so a Moment looks and behaves the same here, on the
 * household's profile, in the feed and in Explore.
 *
 * The household's byline is deliberately hidden: this page already belongs to
 * one pet and one household, and repeating the attribution on every card would
 * be noise. Following is offered once, in the byline at the top of the page.
 */
export function PetProfileMomentsTab({
  publicSlug,
  petName,
}: PetProfileMomentsTabProps) {
  const signedIn = useSignedIn();
  const load = useCallback(
    (cursor?: string) => getPublicPetMoments(publicSlug, cursor),
    [publicSlug]
  );
  const {
    state,
    moments,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadedAt,
    loadMore,
    onLikeChange,
    reload,
  } = useMomentPages(load);

  if (state === "loading") {
    return (
      <div aria-busy="true" className="grid gap-4" data-testid="pet-moments-loading">
        <span className="sr-only">Loading Moments</span>
        <div className="h-64 animate-pulse rounded-[1.5rem] bg-white" />
        <div className="h-64 animate-pulse rounded-[1.5rem] bg-white" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-[1.5rem] border border-pet-border bg-white p-8 text-center">
        <p className="text-sm font-bold text-pet-ink">
          We couldn&rsquo;t load {petName}&rsquo;s Moments.
        </p>
        <div className="mt-4">
          <CTAButton onClick={reload} type="button" variant="secondary">
            Try again
          </CTAButton>
        </div>
      </div>
    );
  }

  if (moments.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-pet-border bg-pet-cream p-8 text-center text-sm font-semibold text-pet-muted">
        {petName}&rsquo;s shared Moments will appear here.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {moments.map((moment) => (
        <SocialMomentCard
          key={moment.id}
          moment={moment}
          now={loadedAt}
          onLikeChange={onLikeChange}
          showAuthor={false}
          signedIn={signedIn}
        />
      ))}

      <MomentPagesFooter
        failed={loadMoreFailed}
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
