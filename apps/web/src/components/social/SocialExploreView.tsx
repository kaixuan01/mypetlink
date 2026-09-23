"use client";

import { useCallback, useEffect, useState } from "react";
import { CommunityBrandFooter } from "@/components/social/CommunityBrandFooter";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { SocialMomentStream } from "@/components/social/SocialMomentStream";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import { SocialSearchDialog } from "@/components/social/SocialSearchDialog";
import {
  MomentStreamSkeleton,
  PetCardSkeleton,
} from "@/components/social/SocialSkeletons";
import {
  allSpeciesValue,
  SpeciesFilterSelect,
} from "@/components/social/SpeciesFilterSelect";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { trackEvent } from "@/lib/analytics";
import { useMomentPages } from "@/lib/useMomentPages";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  getExploreMoments,
  getSocialSpecies,
  getSuggestedPets,
  type SocialPetCard as SocialPetCardModel,
  type SocialSpeciesOption,
} from "@/services/socialDiscoveryService";

/**
 * Explore — where somebody meets a pet they were not already following.
 *
 * Pet-first the whole way down: a shelf of pets, then the newest Moments. The
 * Follow control on every card names the household, because that is what it
 * acts on.
 *
 * Nothing here is personalised, so nothing here says "For you". The heading is
 * "Suggested pets" and the ordering is the same for everybody except for the
 * pets it leaves out.
 */
export function SocialExploreView() {
  const signedIn = useSignedIn();
  const [species, setSpecies] = useState(allSpeciesValue);
  // Overlay state, not a route. Explore keeps its scroll position and its
  // loaded Moments underneath, and closing search is not a navigation for the
  // back button to have an opinion about.
  const [searchOpen, setSearchOpen] = useState(false);
  const [options, setOptions] = useState<SocialSpeciesOption[]>([]);
  /**
   * Three outcomes, not two. A failed request used to set an empty list and
   * mark it loaded, so the section said "No pets to show here yet. Try another
   * pet type." - telling a visitor there are no pets, and sending them to
   * change a filter that was never the problem.
   *
   * Keyed by the filter and the retry count together, and reset during render
   * rather than from inside the effect: changing the species must clear a
   * previous error immediately, and a previous species' pets must never show
   * under a new heading while the next request is in flight.
   */
  const [petsAttempt, setPetsAttempt] = useState(0);
  const petsKey = `${species}:${petsAttempt}`;
  const [petsRequest, setPetsRequest] = useState<{
    key: string;
    state: "loading" | "ready" | "error";
    pets: SocialPetCardModel[];
  }>(() => ({ key: petsKey, state: "loading", pets: [] }));

  if (petsRequest.key !== petsKey) {
    setPetsRequest({ key: petsKey, state: "loading", pets: [] });
  }

  const pets = petsRequest.state === "ready" ? petsRequest.pets : [];
  const petsState = petsRequest.state;

  useEffect(() => {
    trackEvent("social_explore_viewed", { source: "explore" });
  }, []);

  useEffect(() => {
    let active = true;

    getSocialSpecies()
      .then((loaded) => {
        if (active) setOptions(loaded);
      })
      .catch(() => {
        // Without the filter Explore still works; it just shows everything.
        if (active) setOptions([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getSuggestedPets(species)
      .then((loaded) => {
        if (!active) return;
        setPetsRequest({ key: petsKey, state: "ready", pets: loaded });
      })
      .catch(() => {
        if (!active) return;
        setPetsRequest({ key: petsKey, state: "error", pets: [] });
      });

    return () => {
      active = false;
    };
  }, [species, petsKey]);

  const loadMoments = useCallback(
    (cursor?: string) => getExploreMoments(species, cursor),
    [species]
  );
  // Captured once, so every card on the page agrees about what "3h" means and
  // none of them re-times itself on a re-render.
  const [loadedAt] = useState(() => Date.now());
  const {
    state,
    moments,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadMore,
    onLikeChange,
    reload,
  } = useMomentPages(loadMoments);

  const onFollowChange = useCallback((handle: string, isFollowing: boolean) => {
    setPetsRequest((current) => ({
      ...current,
      pets: current.pets.map((pet) =>
        pet.owner.handle === handle
          ? { ...pet, viewerFollowsOwner: isFollowing }
          : pet
      ),
    }));
  }, []);

  return (
    /*
      Explore is a browsing page, so it gets a browsing page's width. It used to
      cap itself at max-w-3xl — 768px — which is a reading measure, and inside
      the ~1230px the shell actually offers that left 460px of nothing down both
      sides while the suggestion cards squeezed into 248px columns. The wide
      container is the page; the narrow column below is only for the Moments,
      which are the one thing here that is genuinely read rather than scanned.
    */
    <div className="mx-auto w-full max-w-5xl pt-6">
      {/*
        Title and controls on one line from `sm` up, so the three things that
        steer this page read as one toolbar instead of three left-aligned rows
        with a filter drifting underneath. On a phone the filter drops to its
        own row, because a species name and a Search button will not share 358px
        without one of them truncating.
      */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-pet-ink sm:text-3xl">
          Community
        </h1>

        <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto">
          <SpeciesFilterSelect
            onChange={setSpecies}
            options={options}
            value={species}
          />
        {/*
          A button, not a link to /search: from Explore this opens search over
          the page somebody is already reading. The route still exists for a
          deep link, and renders the same component.
        */}
        <button
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
          data-testid="explore-search-trigger"
          onClick={() => setSearchOpen(true)}
          type="button"
        >
          <Icon aria-hidden="true" className="h-4 w-4" name="search" />
          Search
        </button>
        </div>
      </header>

      {/*
        A container, so the suggestions count columns against the room they have
        rather than against the window. The two shells do not offer the same
        canvas: at a 1024px window an anonymous visitor has about 960px here,
        while a signed-in owner has about 670 once the 288px sidebar is taken
        out. Keyed to the viewport, the same "lg" rule would put three columns
        into both — 312px each in one and 216px each in the other, which is
        narrow enough to flip the cards back into the tall tiles this whole pass
        is removing.
      */}
      <section
        aria-labelledby="suggested-pets"
        className="@container mt-6"
        data-testid="suggested-pets-section"
      >
        <h2 className="text-lg font-black text-pet-ink" id="suggested-pets">
          Suggested pets
        </h2>
        {/*
          Says what happens and why somebody would want it. The previous wording
          was accurate and read like a disclaimer. What it must not do is imply
          the graph follows the pet: the actor is the household, always.
        */}
        <p className="mt-1 text-sm font-semibold text-pet-muted">
          Follow a pet&rsquo;s family to see their Moments in your feed.
        </p>

        {petsState === "error" ? (
          <div
            className="mt-4 rounded-[1.75rem] border border-pet-border bg-white p-6 text-center"
            data-testid="explore-pets-error"
          >
            <p className="text-sm font-bold text-pet-ink">
              We couldn&rsquo;t load suggestions.
            </p>
            <div className="mt-4">
              <CTAButton
                onClick={() => setPetsAttempt((current) => current + 1)}
                type="button"
                variant="secondary"
              >
                Try again
              </CTAButton>
            </div>
          </div>
        ) : pets.length > 0 ? (
          /*
            Columns follow how many suggestions there actually are, capped at
            three. A lone suggestion laid into a three-column grid is a 333px
            card with 690px of nothing beside it, which reads as a page that
            failed to load rather than a page with one thing to show; given the
            row to itself it is simply a card, and the measure stops it growing
            into a banner.
          */
          <ul
            className={`mt-4 grid gap-3 ${
              pets.length === 1
                ? "max-w-xl grid-cols-1"
                : "grid-cols-1 @2xl:grid-cols-2 @4xl:grid-cols-3"
            }`}
            data-testid="explore-pets"
          >
            {pets.map((pet) => (
              <li key={pet.publicSlug}>
                <SocialPetCard
                  analyticsSource="explore"
                  onFollowChange={onFollowChange}
                  pet={pet}
                />
              </li>
            ))}
          </ul>
        ) : petsState === "ready" ? (
          <div
            className="mt-4 rounded-[1.75rem] border border-pet-border bg-white p-8 text-center"
            data-testid="explore-pets-empty"
          >
            <LinkoMascot
              alt="Linko the MyPetLink mascot waving"
              className="mx-auto"
              pose="wave"
              size={80}
            />
            {/*
              The page knows the filter and nothing else. It cannot see why the
              list came back empty - a household may be undiscoverable, or the
              viewer may already follow every one that is - and telling somebody
              with no filter applied to "try another pet type" sends them to
              change a control that was never involved. Naming the real reason
              is also not an option: it would report how many households exist
              and which of them this viewer already follows.

              So: mention the filter only when there is one.
            */}
            <p className="mt-3 text-sm font-bold text-pet-muted">
              {species === allSpeciesValue
                ? "No suggestions right now."
                : "No pets to show for this pet type. Try another one."}
            </p>
          </div>
        ) : (
          // The card's own shape, in the same column count, so arrival fills
          // the row rather than resizing it.
          <div
            aria-busy="true"
            className="mt-4 grid grid-cols-1 gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3"
            data-testid="explore-pets-loading"
          >
            <PetCardSkeleton />
            <div className="hidden @2xl:block">
              <PetCardSkeleton />
            </div>
            <div className="hidden @4xl:block">
              <PetCardSkeleton />
            </div>
          </div>
        )}
      </section>

      {/*
        The Moment column is narrower than the page that holds it, and matches
        the home feed exactly: a Moment is the same object here, so it is the
        same size here. Suggested pets keeps the full width above, because three
        pet cards side by side is a different job from reading one Moment.
      */}
      <section
        aria-labelledby="latest-moments"
        className="mx-auto mt-10 w-full max-w-xl"
      >
        <h2 className="text-lg font-black text-pet-ink" id="latest-moments">
          Latest Moments
        </h2>

        {state === "error" ? (
          <div
            className="mt-4 rounded-[1.5rem] border border-pet-border bg-white p-8 text-center"
            data-testid="explore-moments-error"
          >
            <p className="text-sm font-bold text-pet-ink">
              We couldn&rsquo;t load these Moments.
            </p>
            <div className="mt-4">
              <CTAButton onClick={reload} type="button" variant="secondary">
                Try again
              </CTAButton>
            </div>
          </div>
        ) : state === "loading" ? (
          // Two 448px white rectangles used to sit here on a cream page, which
          // is most of a phone screen of apparently blank document.
          <MomentStreamSkeleton className="mt-5" />
        ) : (
          moments.length === 0 ? (
            <div
              className="mt-4 rounded-[1.75rem] border border-pet-border bg-white p-6 text-center"
              data-testid="moments-empty"
            >
              <LinkoMascot
                alt="Linko the MyPetLink mascot waving"
                className="mx-auto"
                pose="wave"
                size={56}
              />
              <p className="mt-2 text-sm font-bold text-pet-ink">
                New Moments from MyPetLink families will appear here.
              </p>
            </div>
          ) : (
            // The same card the home feed draws. Explore differs in which
            // Moments it selects, not in what a Moment is.
            <SocialMomentStream
              analyticsSource="explore"
              hasMore={hasMore}
              loadingMore={loadingMore}
              loadMoreFailed={loadMoreFailed}
              moments={moments}
              now={loadedAt}
              onLikeChange={onLikeChange}
              onLoadMore={loadMore}
              signedIn={signedIn}
            />
          )
        )}
      </section>

      <SocialSearchDialog
        onClose={() => setSearchOpen(false)}
        open={searchOpen}
      />

      <CommunityBrandFooter signedIn={signedIn} />
    </div>
  );
}
