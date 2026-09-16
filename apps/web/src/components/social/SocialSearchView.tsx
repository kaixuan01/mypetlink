"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommunityBrandFooter } from "@/components/social/CommunityBrandFooter";
import { FollowButton } from "@/components/social/FollowButton";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import { Icon } from "@/components/ui/Icon";
import {
  toAnalyticsCountBucket,
  toAnalyticsQueryLengthBucket,
  trackEvent,
} from "@/lib/analytics";
import { ownerSocialProfilePath, socialRoutes } from "@/lib/routes";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  minimumSearchLength,
  searchSocial,
  type SocialOwnerCard,
  type SocialPetCard as SocialPetCardModel,
} from "@/services/socialDiscoveryService";
import {
  noRelationship,
  type OwnerRelationship,
} from "@/services/socialGraphService";

type Tab = "pets" | "owners";

/**
 * Social search.
 *
 * Two things are searchable and nothing else: a pet's name, and a household's
 * social handle or chosen display name. No account name, no email, no phone, no
 * finder-facing name, and no code of any kind — the tag and safety codes have
 * their own routes with their own gating, and a search box is not one of them.
 *
 * The tabs say "Pets" and "Pet Parents". Not "People": the households here are
 * on MyPetLink because of an animal, and the wording should keep saying so.
 */
export function SocialSearchView() {
  const signedIn = useSignedIn();
  const searchParams = useSearchParams();
  // Seeded once from ?q= so a shared search link opens on its results, then
  // owned by the input. The URL is not rewritten as somebody types: a history
  // entry per keystroke makes the back button useless.
  const [term, setTerm] = useState(() => searchParams.get("q") ?? "");
  const [tab, setTab] = useState<Tab>("pets");
  const [pets, setPets] = useState<SocialPetCardModel[]>([]);
  const [owners, setOwners] = useState<SocialOwnerCard[]>([]);
  const [phase, setPhase] = useState<"searching" | "done" | "error">("done");
  const requestRef = useRef(0);

  const trimmed = term.trim();
  const tooShort = trimmed.length < minimumSearchLength;
  // Derived rather than stored: a box that is too short to search is a state of
  // the input, not a result the component has to remember.
  const state = tooShort ? "idle" : phase;

  useEffect(() => {
    if (trimmed.length < minimumSearchLength) {
      return;
    }

    // Debounced: a search on every keystroke turns a rate limit into a wall for
    // somebody typing normally.
    const request = requestRef.current + 1;
    requestRef.current = request;

    const timer = window.setTimeout(() => {
      // Announced when the request actually goes out, not on every keystroke:
      // a "Searching…" that flickers under somebody's fingers is noise, and it
      // would be read aloud on every character by a screen reader.
      setPhase("searching");

      searchSocial(trimmed)
        .then((results) => {
          if (requestRef.current !== request) return;

          setPets(results.pets);
          setOwners(results.owners);
          setPhase("done");

          // Buckets only. There is no key on this event through which the
          // query itself could travel — not truncated, not hashed.
          trackEvent("social_search_performed", {
            source: "search",
            result_tab: results.pets.length >= results.owners.length
              ? "pets"
              : "pet_parents",
            result_count_bucket: toAnalyticsCountBucket(
              results.pets.length + results.owners.length
            ),
            query_length_bucket: toAnalyticsQueryLengthBucket(trimmed.length),
          });
        })
        .catch(() => {
          if (requestRef.current !== request) return;
          setPhase("error");
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const onPetFollowChange = useCallback(
    (handle: string, isFollowing: boolean) => {
      setPets((current) =>
        current.map((pet) =>
          pet.owner.handle === handle
            ? { ...pet, viewerFollowsOwner: isFollowing }
            : pet
        )
      );
      setOwners((current) =>
        current.map((owner) =>
          owner.handle === handle ? { ...owner, viewerFollows: isFollowing } : owner
        )
      );
    },
    []
  );

  return (
    <div className="mx-auto w-full max-w-3xl pt-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-black text-pet-ink sm:text-3xl">Search</h1>
        <Link
          className="text-sm font-bold text-pet-teal transition hover:text-pet-ink"
          href={socialRoutes.explore}
        >
          Explore pets
        </Link>
      </header>

      <div className="relative mt-4">
        <label className="sr-only" htmlFor="social-search-input">
          Search pets and pet parents
        </label>
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pet-muted"
          name="search"
        />
        <input
          autoComplete="off"
          className="min-h-12 w-full rounded-full border border-pet-border bg-white pl-11 pr-4 text-base font-semibold text-pet-ink outline-none transition focus:border-pet-teal focus:ring-2 focus:ring-pet-teal/30"
          id="social-search-input"
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search pets or pet parents"
          type="search"
          value={term}
        />
      </div>

      <nav aria-label="Result type" className="mt-4 flex gap-2">
        <TabButton
          active={tab === "pets"}
          count={pets.length}
          label="Pets"
          onSelect={() => setTab("pets")}
        />
        <TabButton
          active={tab === "owners"}
          count={owners.length}
          label="Pet Parents"
          onSelect={() => setTab("owners")}
        />
      </nav>

      <div aria-live="polite" className="mt-5">
        {state === "idle" ? (
          <p
            className="text-sm font-semibold text-pet-muted"
            data-testid="search-hint"
          >
            Type at least {minimumSearchLength} letters to search by pet name,
            handle, or family name.
          </p>
        ) : null}

        {state === "searching" ? (
          <p className="text-sm font-semibold text-pet-muted">Searching…</p>
        ) : null}

        {state === "error" ? (
          <p
            className="text-sm font-semibold text-pet-muted"
            data-testid="search-error"
          >
            We couldn&rsquo;t search right now. Please try again in a moment.
          </p>
        ) : null}

        {state === "done" && tab === "pets" ? (
          pets.length > 0 ? (
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              data-testid="search-pets"
            >
              {pets.map((pet) => (
                <li key={pet.publicSlug}>
                  <SocialPetCard
                    analyticsSource="search"
                    onFollowChange={onPetFollowChange}
                    pet={pet}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-sm font-semibold text-pet-muted"
              data-testid="search-pets-empty"
            >
              No pets match &ldquo;{trimmed}&rdquo;.
            </p>
          )
        ) : null}

        {state === "done" && tab === "owners" ? (
          owners.length > 0 ? (
            <ul className="space-y-2" data-testid="search-owners">
              {owners.map((owner) => (
                <li
                  className="flex min-w-0 items-center gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3"
                  key={owner.handle}
                >
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    href={ownerSocialProfilePath(owner.handle)}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
                      {owner.avatarThumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          src={owner.avatarThumbnailUrl}
                        />
                      ) : (
                        <Icon className="h-5 w-5 text-pet-muted" name="users" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-pet-ink">
                        {owner.displayName}
                      </span>
                      <span className="block truncate text-xs font-bold text-pet-muted">
                        @{owner.handle}
                        {owner.generalArea ? ` · ${owner.generalArea}` : ""}
                      </span>
                    </span>
                  </Link>

                  <div className="shrink-0">
                    <FollowButton
                      analyticsSource="search"
                      displayName={owner.displayName}
                      handle={owner.handle}
                      onChange={(next) =>
                        onPetFollowChange(owner.handle, next.isFollowing)
                      }
                      relationship={ownerRelationship(owner)}
                      signedIn={signedIn}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-sm font-semibold text-pet-muted"
              data-testid="search-owners-empty"
            >
              No pet parents match &ldquo;{trimmed}&rdquo;.
            </p>
          )
        ) : null}
      </div>

      <CommunityBrandFooter signedIn={signedIn} />
    </div>
  );
}

function ownerRelationship(owner: SocialOwnerCard): OwnerRelationship {
  return {
    ...noRelationship,
    isSelf: owner.isSelf,
    isFollowing: owner.viewerFollows,
    canFollow: !owner.isSelf,
    allowsFollowers: !owner.isSelf,
  };
}

function TabButton({
  active,
  count,
  label,
  onSelect,
}: {
  active: boolean;
  count: number;
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
      {count > 0 ? (
        <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
      ) : null}
    </button>
  );
}
