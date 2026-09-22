"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { SocialMomentStream } from "@/components/social/SocialMomentStream";
import { MomentCardSkeleton } from "@/components/social/SocialSkeletons";
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
  /*
    Null until the first page answers. The server reports it because an empty
    feed cannot: "nothing here" is either "you have not followed anyone" or
    "nobody you follow has posted lately", and those want opposite things said
    to them. Kept here rather than in useMomentPages because Explore shares that
    hook and has no viewer relationship to report.
  */
  const [hasFollowing, setHasFollowing] = useState<boolean | null>(null);

  // Two events, two meanings. "Viewed" is one screen opening; "page loaded" is
  // each further page fetched with a cursor. The first page is counted once,
  // by "viewed", and never twice.
  const load = useCallback(async (cursor?: string) => {
    const page = await getSocialFeed(cursor);

    setHasFollowing(page.hasFollowing);

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
    loadMoreFailed,
    loadedAt,
    loadMore,
    onLikeChange,
    reload,
  } = useMomentPages(load);

  const ready = state === "ready";
  /*
    Four states, and the difference that matters is the relationship, not the
    count. Somebody who follows nobody is invited to go and find families;
    somebody who follows a dozen quiet ones is told they are up to date. The old
    screen said the first thing to both of them.
  */
  const followsNobody = ready && hasFollowing === false;
  const onboarding = followsNobody;
  const caughtUpWithFollows =
    ready && hasFollowing === true && moments.length === 0;
  // Discovery under a short feed, only once there is a real feed to be short.
  const sparse = ready && !followsNobody && moments.length > 0 && moments.length < 5;

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        {/*
          "Home", not "Moments". My Pets already has a Moments section and so
          does the Community profile, and this is neither — it is what the
          households you follow have been doing. The bottom bar has always
          called it Home; the page now agrees with it.
        */}
        <h1 className="text-2xl font-black text-pet-ink">Home</h1>
        <Link
          className="text-sm font-bold text-pet-teal transition hover:text-pet-ink"
          href={socialRoutes.explore}
        >
          Explore
        </Link>
      </header>

      {state === "loading" ? (
        <div aria-busy="true" className="mt-5 grid gap-4" data-testid="feed-loading">
          <span className="sr-only">Loading your feed</span>
          <MomentCardSkeleton />
          <MomentCardSkeleton />
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

      {onboarding ? <FeedOnboarding hasOwnMoments={moments.length > 0} /> : null}

      {caughtUpWithFollows ? <CaughtUpState /> : null}

      {moments.length > 0 ? (
        <div data-testid="feed-list">
          {/*
            Named only while the feed is entirely the reader's own work. Once
            anybody is followed the stream stops being "yours" and the heading
            would be a lie, so it goes away rather than becoming permanent
            furniture on a page that is not an archive.
          */}
          {followsNobody ? (
            <h2
              className="mt-6 text-lg font-black text-pet-ink"
              data-testid="feed-own-moments-heading"
            >
              Your Moments
            </h2>
          ) : null}
          <SocialMomentStream
            analyticsSource="feed"
            endText="You&rsquo;re all caught up."
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreFailed={loadMoreFailed}
            moments={moments}
            now={loadedAt}
            onLikeChange={onLikeChange}
            onLoadMore={loadMore}
            signedIn={signedIn}
          />
        </div>
      ) : null}


      {sparse ? <MeetMorePets /> : null}
    </div>
  );
}

/**
 * What a reader who follows nobody is told.
 *
 * Two shapes, because two situations. With no Moments of their own this is the
 * whole screen and can afford the mascot and a second action; with their own
 * Moments underneath it has to be a band rather than a hero, or the content
 * they came to see is pushed off the bottom of a phone.
 *
 * It never says the feed is empty when it is not, and it never calls the page
 * an archive of your own work — it explains why the page looks the way it does
 * and offers the one thing that changes it.
 */
function FeedOnboarding({ hasOwnMoments }: { hasOwnMoments: boolean }) {
  if (hasOwnMoments) {
    return (
      <section
        className="mt-5 rounded-[1.5rem] border border-pet-border bg-white p-4 sm:p-5"
        data-testid="feed-onboarding"
      >
        <h2 className="text-base font-black text-pet-ink">
          Follow pet families to fill your feed
        </h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-pet-muted">
          Their new Moments will appear here alongside your own.
        </p>
        <div className="mt-3">
          <CTAButton href={socialRoutes.explore} variant="secondary">
            Explore
          </CTAButton>
        </div>
      </section>
    );
  }

  return (
    <div
      className="mt-5 rounded-[1.75rem] border border-pet-border bg-white p-8 text-center"
      data-testid="feed-onboarding"
    >
      <LinkoMascot
        alt="Linko the MyPetLink mascot waving"
        className="mx-auto"
        pose="wave"
        size={96}
      />
      <h2 className="mt-4 text-lg font-black text-pet-ink">
        Welcome to your feed
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        Follow pet families to start seeing their Moments here. Anything you
        share publicly shows up too.
      </p>
      {/*
        One action. Sharing a Moment was the obvious second, but it is not a
        route — it is a menu action that needs a pet to attach the Moment to,
        which is exactly what somebody on this screen may not have yet. A button
        that leads to "add a pet first" is a worse welcome than no button.
      */}
      <div className="mt-5">
        <CTAButton href={socialRoutes.explore}>Explore</CTAButton>
      </div>
    </div>
  );
}

/**
 * Followed households, none of whom has posted lately.
 *
 * Says nothing about following, because this reader already follows people and
 * being told to go and find some would read as the product having forgotten
 * them. Quiet, and short — there is nothing wrong here.
 */
function CaughtUpState() {
  return (
    <div
      className="mt-5 rounded-[1.5rem] border border-pet-border bg-white p-8 text-center"
      data-testid="feed-caught-up"
    >
      <h2 className="text-lg font-black text-pet-ink">
        You&rsquo;re all caught up
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        No new Moments from the families you follow. Check back soon.
      </p>
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
