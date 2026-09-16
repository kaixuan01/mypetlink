"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { PublicMomentGrid } from "@/components/social/PublicMomentGrid";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { trackEvent } from "@/lib/analytics";
import { socialRoutes } from "@/lib/routes";
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
  const [species, setSpecies] = useState("all");
  const [options, setOptions] = useState<SocialSpeciesOption[]>([]);
  const [pets, setPets] = useState<SocialPetCardModel[]>([]);
  const [petsLoaded, setPetsLoaded] = useState(false);

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
        setPets(loaded);
        setPetsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setPets([]);
        setPetsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [species]);

  const loadMoments = useCallback(
    (cursor?: string) => getExploreMoments(species, cursor),
    [species]
  );
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
    setPets((current) =>
      current.map((pet) =>
        pet.owner.handle === handle
          ? { ...pet, viewerFollowsOwner: isFollowing }
          : pet
      )
    );
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-black text-pet-ink sm:text-3xl">
          Explore pets
        </h1>
        <Link
          className="text-sm font-bold text-pet-teal transition hover:text-pet-ink"
          href={socialRoutes.search}
        >
          Search
        </Link>
      </header>

      {options.length > 0 ? (
        <nav
          aria-label="Filter by pet type"
          className="mt-4 flex flex-wrap gap-2"
          data-testid="explore-species"
        >
          <SpeciesChip
            active={species === "all"}
            label="All"
            onSelect={() => setSpecies("all")}
          />
          {options.map((option) => (
            <SpeciesChip
              active={species === option.species}
              key={option.species}
              label={option.label}
              onSelect={() => setSpecies(option.species)}
            />
          ))}
        </nav>
      ) : null}

      <section aria-labelledby="suggested-pets" className="mt-6">
        <h2 className="text-lg font-black text-pet-ink" id="suggested-pets">
          Suggested pets
        </h2>
        <p className="mt-1 text-sm font-semibold text-pet-muted">
          Following a pet follows the family who shares them.
        </p>

        {pets.length > 0 ? (
          <ul
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
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
        ) : petsLoaded ? (
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
            <p className="mt-3 text-sm font-bold text-pet-muted">
              No pets to show here yet. Try another pet type.
            </p>
          </div>
        ) : (
          <div aria-busy="true" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="h-64 animate-pulse rounded-[1.5rem] bg-white" />
            <div className="h-64 animate-pulse rounded-[1.5rem] bg-white" />
            <div className="hidden h-64 animate-pulse rounded-[1.5rem] bg-white sm:block" />
          </div>
        )}
      </section>

      <section aria-labelledby="latest-moments" className="mt-10">
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
          <div aria-busy="true" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="h-56 animate-pulse rounded-[1.25rem] bg-white" />
            <div className="h-56 animate-pulse rounded-[1.25rem] bg-white" />
            <div className="hidden h-56 animate-pulse rounded-[1.25rem] bg-white sm:block" />
          </div>
        ) : (
          <PublicMomentGrid
            analyticsSource="explore"
            emptyMessage="New Moments from MyPetLink families will appear here."
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreFailed={loadMoreFailed}
            moments={moments}
            onLikeChange={onLikeChange}
            onLoadMore={loadMore}
            showAuthor
            signedIn={signedIn}
          />
        )}
      </section>

      <footer className="mt-12 flex justify-center">
        <Link className="opacity-70 transition hover:opacity-100" href="/">
          <BrandLogo />
        </Link>
      </footer>
    </div>
  );
}

function SpeciesChip({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-bold transition ${
        active
          ? "border-pet-ink bg-pet-ink text-white"
          : "border-pet-border bg-white text-pet-ink hover:bg-pet-cream"
      }`}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  );
}
