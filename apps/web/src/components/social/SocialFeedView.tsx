"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { SocialMomentCard } from "@/components/social/SocialMomentCard";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { trackEvent } from "@/lib/analytics";
import { socialRoutes } from "@/lib/routes";
import { useMomentPages } from "@/lib/useMomentPages";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  getSuggestedPets,
  type SocialPetCard as SocialPetCardModel,
} from "@/services/socialDiscoveryService";
import { getSocialFeed } from "@/services/socialFeedService";

/**
 * The home feed.
 *
 * Chronological, and only that. Everything here is either from a household the
 * reader chose to follow or their own — so the answer to "why am I seeing
 * this?" is always the same, and always something they did.
 *
 * Two places discovery appears, both clearly outside the feed itself: the empty
 * state, and a labelled section BELOW a short feed. Suggestions are never
 * interleaved with followed Moments. The moment a reader cannot tell which is
 * which, the feed stops being theirs.
 */
export function SocialFeedView() {
  const signedIn = useSignedIn();

  // Two events, two meanings. "Viewed" is one screen opening; "page loaded" is
  // each further page fetched with a cursor. The first page is counted once,
  // by "viewed", and never twice.
  const load = useCallback(async (cursor?: string) => {
    const page = await getSocialFeed(cursor);

    if (cursor) {
      trackEvent("social_feed_page_loaded", { source: "feed" });
    }

    return page;
  }, []);

  useEffect(() => {
    trackEvent("social_feed_viewed", { source: "feed" });
  }, []);
  const {
    state,
    moments,
    hasMore,
    loadingMore,
    loadedAt,
    loadMore,
    onLikeChange,
    reload,
  } = useMomentPages(load);

  const sparse = state === "ready" && moments.length < 5;

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-black text-pet-ink">Moments</h1>
        <Link
          className="text-sm font-bold text-pet-teal transition hover:text-pet-ink"
          href={socialRoutes.explore}
        >
          Explore pets
        </Link>
      </header>

      {state === "loading" ? (
        <div aria-busy="true" className="mt-5 grid gap-4" data-testid="feed-loading">
          <span className="sr-only">Loading your feed</span>
          <div className="h-72 animate-pulse rounded-[1.5rem] bg-white" />
          <div className="h-72 animate-pulse rounded-[1.5rem] bg-white" />
        </div>
      ) : null}

      {state === "error" ? (
        <div
          className="mt-5 rounded-[1.5rem] border border-pet-border bg-white p-8 text-center"
          data-testid="feed-error"
        >
          <p className="text-sm font-bold text-pet-ink">
            We couldn&rsquo;t load your Moments.
          </p>
          <p className="mt-1 text-sm font-semibold text-pet-muted">
            Please try again in a moment.
          </p>
          <div className="mt-4">
            <CTAButton onClick={reload} type="button" variant="secondary">
              Try again
            </CTAButton>
          </div>
        </div>
      ) : null}

      {state === "ready" && moments.length === 0 ? <FeedEmptyState /> : null}

      {moments.length > 0 ? (
        <div className="mt-5 grid gap-4" data-testid="feed-list">
          {moments.map((moment) => (
            <SocialMomentCard
              analyticsSource="feed"
              key={moment.id}
              moment={moment}
              now={loadedAt}
              onLikeChange={onLikeChange}
              signedIn={signedIn}
            />
          ))}
        </div>
      ) : null}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <CTAButton
            disabled={loadingMore}
            onClick={loadMore}
            type="button"
            variant="secondary"
          >
            {loadingMore ? "Loading…" : "Show more Moments"}
          </CTAButton>
        </div>
      ) : null}

      {state === "ready" && moments.length > 0 && !hasMore ? (
        <p
          className="mt-6 text-center text-sm font-semibold text-pet-muted"
          data-testid="feed-end"
        >
          You&rsquo;re all caught up.
        </p>
      ) : null}

      {sparse ? <MeetMorePets /> : null}
    </div>
  );
}

/**
 * A brand-new owner's first screen.
 *
 * Says what the feed is FOR and gives one way to fill it. It never pretends
 * there is content, and it never apologises for an empty screen that is empty
 * for a perfectly ordinary reason.
 */
function FeedEmptyState() {
  return (
    <div
      className="mt-5 rounded-[1.75rem] border border-pet-border bg-white p-8 text-center"
      data-testid="feed-empty"
    >
      <LinkoMascot
        alt="Linko the MyPetLink mascot waving"
        className="mx-auto"
        pose="wave"
        size={96}
      />
      <h2 className="mt-4 text-lg font-black text-pet-ink">
        Your feed starts with pets you care about
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        Follow a pet&rsquo;s family and their new Moments will appear here.
        Anything you share publicly shows up too.
      </p>
      <div className="mt-5">
        <CTAButton href={socialRoutes.explore}>Explore pets</CTAButton>
      </div>
    </div>
  );
}

/**
 * Discovery below a short feed — never inside it.
 *
 * Its own heading, its own visual block, and the same suggestions Explore
 * shows. A reader should never have to work out whether a card arrived because
 * they follow somebody or because we guessed.
 */
function MeetMorePets() {
  const [pets, setPets] = useState<SocialPetCardModel[]>([]);

  useEffect(() => {
    let active = true;

    getSuggestedPets()
      .then((suggested) => {
        if (active) setPets(suggested.slice(0, 6));
      })
      .catch(() => {
        // Discovery is a bonus on this screen. A failure here must not become
        // an error message about somebody's feed.
        if (active) setPets([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const onFollowChange = useCallback((handle: string, isFollowing: boolean) => {
    setPets((current) =>
      current.map((pet) =>
        pet.owner.handle === handle
          ? { ...pet, viewerFollowsOwner: isFollowing }
          : pet
      )
    );
  }, []);

  if (pets.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="meet-more-pets"
      className="mt-10 border-t border-pet-border pt-6"
      data-testid="feed-suggestions"
    >
      <h2 className="text-lg font-black text-pet-ink" id="meet-more-pets">
        Meet more pets
      </h2>
      <p className="mt-1 text-sm font-semibold text-pet-muted">
        Pets shared by other MyPetLink families. Following a pet follows their
        family.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pets.map((pet) => (
          <li key={pet.publicSlug}>
            <SocialPetCard
              analyticsSource="feed"
              onFollowChange={onFollowChange}
              pet={pet}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
