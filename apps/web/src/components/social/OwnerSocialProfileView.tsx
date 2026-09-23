"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunityBrandFooter } from "@/components/social/CommunityBrandFooter";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { FollowButton } from "@/components/social/FollowButton";
import { OwnerProfileMenu } from "@/components/social/OwnerProfileMenu";
import { PublicMomentGrid } from "@/components/social/PublicMomentGrid";
import { SmartTagProtectedBadge } from "@/components/social/SmartTagProtectedBadge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { trackEvent } from "@/lib/analytics";
import {
  ownerFollowersPath,
  ownerFollowingPath,
  ownerRoutes,
  ownerSocialProfilePath,
  socialRoutes,
} from "@/lib/routes";
import { useMomentPages } from "@/lib/useMomentPages";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  getOwnerRelationship,
  noRelationship,
  type OwnerRelationship,
} from "@/services/socialGraphService";
import {
  getPublicOwnerMoments,
  getPublicOwnerProfile,
  PublicProfileUnavailableError,
  type PublicOwnerProfile,
} from "@/services/publicSocialService";

type OwnerSocialProfileViewProps = {
  handle: string;
  /**
   * Who is reading. "public" is a visitor at /u/{handle}; "own" is the owner
   * looking at themselves from inside Community. One implementation, two sets
   * of actions and two empty states — never two profile pages.
   */
  audience?: "public" | "own";
};

type LoadState = "loading" | "ready" | "unavailable" | "error";

/**
 * An owner's public social profile at `/u/{handle}`.
 *
 * The household is the subject here — this is the one social surface where the
 * owner leads rather than the pet — but the pets are still the visual draw, so
 * they sit high on the page as portraits rather than as a list of names.
 *
 * Everything is fetched on mount. The site is a static export, so the shell is
 * prerendered and the Pages Function has already rewritten the head for link
 * previews; this component fills in the live content.
 */
export function OwnerSocialProfileView({
  handle,
  audience = "public",
}: OwnerSocialProfileViewProps) {
  // The owner's own view is reached through /community/profile, which already
  // knows whose profile it is. Everything below renders the same data; only the
  // actions and the empty states differ.
  const isOwnProfile = audience === "own";
  const [state, setState] = useState<LoadState>("loading");
  /** Bumped by Retry; the load effect keys off it. */
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState("loading");
    setAttempt((current) => current + 1);
  }, []);
  const [profile, setProfile] = useState<PublicOwnerProfile | null>(null);
  const [relationship, setRelationship] =
    useState<OwnerRelationship>(noRelationship);
  const signedIn = useSignedIn();

  // Moments page through the shared listing hook, the same one the pet profile,
  // the feed and Explore use. The profile itself is loaded separately below:
  // a household's identity must still render when its Moments do not.
  const loadMoments = useCallback(
    (cursor?: string) => getPublicOwnerMoments(handle, cursor),
    [handle]
  );
  const {
    moments,
    hasMore,
    loadingMore,
    loadMore,
    onLikeChange,
  } = useMomentPages(loadMoments);

  useEffect(() => {
    // The pet page keeps its own public_profile_viewed; this covers the
    // household side of the funnel without counting the same view twice.
    trackEvent("social_profile_viewed", {
      source: "direct",
      profile_type: "owner",
    });
  }, [handle]);

  useEffect(() => {
    let active = true;

    async function load() {
      setState("loading");

      try {
        const loadedProfile = await getPublicOwnerProfile(handle);

        if (!active) return;

        setProfile(loadedProfile);
        setState("ready");
      } catch (error) {
        if (!active) return;

        setState(
          error instanceof PublicProfileUnavailableError &&
            error.reason === "not-found"
            ? "unavailable"
            : "error"
        );
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [handle, attempt]);

  // Kept separate from the profile load on purpose. The relationship is the
  // only part of this page that depends on who is looking, and a profile that
  // renders must not be held back — or lost — because that one read failed.
  // Re-runs once the signed-in check settles, so an owner arriving with a
  // session sees their real state rather than a visitor's.
  useEffect(() => {
    let active = true;

    getOwnerRelationship(handle)
      .then((loaded) => {
        if (active) setRelationship(loaded);
      })
      .catch(() => {
        if (active) setRelationship(noRelationship);
      });

    return () => {
      active = false;
    };
  }, [handle, signedIn]);

  if (state === "loading") {
    return (
      <div
        aria-busy="true"
        className="mx-auto w-full max-w-4xl py-10"
        data-testid="owner-profile-loading"
      >
        <span className="sr-only">Loading profile</span>
        <div className="h-24 w-24 animate-pulse rounded-full bg-pet-apricot" />
        <div className="mt-4 h-6 w-48 animate-pulse rounded-full bg-pet-apricot" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded-full bg-pet-border" />
      </div>
    );
  }

  if (state !== "ready" || !profile) {
    return (
      <div className="mx-auto w-full max-w-lg py-16 text-center">
        <LinkoMascot alt="Linko the MyPetLink mascot waving" className="mx-auto" pose="wave" size={96} />
        <h1 className="mt-4 text-2xl font-black text-pet-ink">
          {state === "unavailable"
            ? "This profile isn't available"
            : "We couldn't load this profile"}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-pet-muted">
          {state === "unavailable"
            ? "The link may have changed, or the profile may not be shared right now."
            : "Please try again in a moment."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {/*
            Retry only where retrying can help. A not-found will not change
            because somebody pressed a button, so that case keeps the single
            way out it already had.
          */}
          {state === "error" ? (
            <CTAButton onClick={retry} type="button" variant="secondary">
              Try again
            </CTAButton>
          ) : null}
          <CTAButton href={socialRoutes.explore}>Explore Community</CTAButton>
        </div>
      </div>
    );
  }

  return (
    // max-w-4xl (896px) rather than 3xl (768). At 1280–1600 the narrower
    // column left the profile marooned in the middle of the content area once
    // the sidebar carried only one mode. No right rail: space is not a reason
    // to put something in it.
    <div className="mx-auto w-full max-w-4xl pt-6">
      <header className="brand-card rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream sm:h-24 sm:w-24">
          {profile.avatarThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${profile.displayName} profile picture`}
              className="h-full w-full object-cover"
              src={profile.avatarThumbnailUrl}
            />
          ) : (
            <Icon name="users" className="h-8 w-8 text-pet-muted" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-pet-ink sm:text-3xl">
            {profile.displayName}
          </h1>
          <p className="mt-0.5 text-sm font-bold text-pet-muted">
            @{profile.handle}
          </p>

          {/*
            Bio and area sit with the name rather than below the counts. The
            identity should be settled before Pets and Moments begin, and
            splitting it across the page was what made the old header read as a
            row of loose parts.
          */}
          {profile.bio ? (
            <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-pet-ink">
              {profile.bio}
            </p>
          ) : null}

          {profile.generalArea ? (
            <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-pet-muted">
              <Icon name="pin" className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{profile.generalArea}</span>
            </p>
          ) : null}

          <nav
            aria-label="Followers and following"
            className="mt-3 flex flex-wrap items-center gap-x-5"
            data-testid="owner-profile-counts"
          >
            {/*
              `py-1` on each link, not a taller row: these measured 20px, under
              the 24px minimum target size, and padding lifts the hit area
              without moving the text. The same remedy `SocialPetCard` already
              applies to its handle link.
            */}
            <Link
              className="py-1 text-sm font-semibold text-pet-muted transition hover:text-pet-ink"
              href={ownerFollowersPath(profile.handle)}
            >
              <span className="font-black tabular-nums text-pet-ink">
                {relationship.followerCount}
              </span>{" "}
              {relationship.followerCount === 1 ? "follower" : "followers"}
            </Link>
            <Link
              className="py-1 text-sm font-semibold text-pet-muted transition hover:text-pet-ink"
              href={ownerFollowingPath(profile.handle)}
            >
              <span className="font-black tabular-nums text-pet-ink">
                {relationship.followingCount}
              </span>{" "}
              following
            </Link>
          </nav>
        </div>

        </div>

        {/*
          Editing your own profile is a primary action, not something to find in
          an overflow menu. A visitor gets Follow in the same place; the menu
          keeps only what is genuinely secondary, like blocking.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isOwnProfile ? (
            <>
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-pet-ink px-5 text-sm font-bold text-white transition hover:opacity-90"
                data-testid="edit-community-profile"
                href={ownerRoutes.socialProfileEdit}
              >
                <Icon aria-hidden="true" className="h-4 w-4" name="settings" />
                Edit profile
              </Link>
              <ShareProfileLink
                analyticsSurface="owner_portal"
                compact
                label="Share profile"
                path={ownerSocialProfilePath(profile.handle)}
              />
            </>
          ) : (
            <>
              <FollowButton
                displayName={profile.displayName}
                handle={profile.handle}
                onChange={setRelationship}
                relationship={relationship}
                signedIn={signedIn}
              />
              <OwnerProfileMenu
                displayName={profile.displayName}
                handle={profile.handle}
                onChange={setRelationship}
                relationship={relationship}
                signedIn={signedIn}
              />
            </>
          )}
        </div>
      </header>


      {profile.pets.length > 0 ? (
        <section className="mt-8" aria-labelledby="owner-pets-heading">
          <h2
            className="text-lg font-black text-pet-ink"
            id="owner-pets-heading"
          >
            Pets
          </h2>
          <ul
            aria-labelledby="owner-pets-heading"
            className="mt-3 grid gap-3 sm:grid-cols-2"
            data-testid="owner-pets-list"
          >
            {profile.pets.map((pet) => (
              <li key={pet.publicSlug}>
                <Link
                  className="brand-card flex min-w-0 items-center gap-3 rounded-[1.5rem] p-3 transition hover:bg-pet-cream"
                  href={`/p/${pet.publicSlug}`}
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-apricot">
                    {pet.photoThumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        src={pet.photoThumbnailUrl}
                      />
                    ) : (
                      <span className="text-lg font-black text-pet-ink">
                        {pet.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-base font-black text-pet-ink">
                        {pet.name}
                      </span>
                      {pet.lostModeEnabled ? (
                        <span className="shrink-0 rounded-full bg-pet-coral px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
                          Missing
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-pet-muted">
                      {[pet.breed, pet.customSpecies || pet.species]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {pet.hasSmartTagProtection ? (
                      <SmartTagProtectedBadge className="mt-1.5" />
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="owner-moments-heading">
        <h2
          className="text-lg font-black text-pet-ink"
          id="owner-moments-heading"
        >
          Moments
        </h2>

        <PublicMomentGrid
          emptyAction={
            isOwnProfile ? (
              <CTAButton href={socialRoutes.feed}>Share a Moment</CTAButton>
            ) : undefined
          }
          emptyMessage={
            isOwnProfile
              ? "No Moments yet. Share your first pet Moment with the community."
              : `${profile.displayName} hasn't shared a Moment yet.`
          }
          hasMore={hasMore}
          loadingMore={loadingMore}
          moments={moments}
          onLikeChange={onLikeChange}
          onLoadMore={loadMore}
          signedIn={signedIn}
        />
      </section>

      <CommunityBrandFooter signedIn={signedIn} />
    </div>
  );
}
