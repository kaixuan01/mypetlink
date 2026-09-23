"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunityBrandFooter } from "@/components/social/CommunityBrandFooter";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { SocialAccountList } from "@/components/social/SocialAccountList";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { AccountRowSkeleton } from "@/components/social/SocialSkeletons";
import {
  ownerFollowersPath,
  ownerFollowingPath,
  ownerSocialProfilePath,
  socialRoutes,
} from "@/lib/routes";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  getPublicOwnerProfile,
  PublicProfileUnavailableError,
  type PublicOwnerProfile,
} from "@/services/publicSocialService";
import {
  getOwnerFollowers,
  getOwnerFollowing,
  getOwnerRelationship,
  noRelationship,
  type OwnerRelationship,
  type SocialAccountSummary,
} from "@/services/socialGraphService";

export type ConnectionRelation = "followers" | "following";

type OwnerConnectionsViewProps = {
  handle: string;
  relation: ConnectionRelation;
};

type LoadState = "loading" | "ready" | "unavailable" | "error";

/**
 * Who follows a household, and who it follows.
 *
 * Reached from the counts on the profile. Both lists live on their own page
 * rather than in a modal so they can be linked, shared and paged through with
 * the browser's own back button — and so a long list never traps a phone user
 * inside a scrolling overlay.
 *
 * Blocking is enforced entirely by the API: a household that has blocked the
 * viewer answers as if it does not exist, which lands here as the same
 * "not available" screen a profile that was never shared produces.
 */
export function OwnerConnectionsView({
  handle,
  relation,
}: OwnerConnectionsViewProps) {
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
  const [accounts, setAccounts] = useState<SocialAccountSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const signedIn = useSignedIn();

  useEffect(() => {
    let active = true;

    async function load() {
      setState("loading");
      setAccounts([]);
      setNextCursor(null);

      try {
        const [loadedProfile, firstPage] = await Promise.all([
          getPublicOwnerProfile(handle),
          fetchPage(relation, handle),
        ]);

        if (!active) return;

        setProfile(loadedProfile);
        setAccounts(firstPage.items);
        setNextCursor(firstPage.nextCursor);
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
  }, [handle, relation, attempt]);

  // Counts are a separate, non-blocking read: a list that loads but whose
  // counts do not should still show the list.
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

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await fetchPage(relation, handle, nextCursor);
      setAccounts((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      // Keep what is already on screen; a failed page must not empty the list.
      setNextCursor(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [handle, loadingMore, nextCursor, relation]);

  const onFollowChange = useCallback((changed: string, isFollowing: boolean) => {
    setAccounts((current) =>
      current.map((account) =>
        account.handle === changed ? { ...account, isFollowing } : account
      )
    );
  }, []);

  if (state === "loading") {
    return (
      <div
        aria-busy="true"
        className="mx-auto w-full max-w-2xl py-10"
        data-testid="owner-connections-loading"
      >
        <span className="sr-only">Loading</span>
        <div className="h-6 w-40 animate-pulse rounded-full bg-pet-apricot" />
        <div className="mt-6 space-y-2">
          <AccountRowSkeleton />
          <AccountRowSkeleton />
        </div>
      </div>
    );
  }

  if (state !== "ready" || !profile) {
    return (
      <div className="mx-auto w-full max-w-lg py-16 text-center">
        <LinkoMascot
          alt="Linko the MyPetLink mascot waving"
          className="mx-auto"
          pose="wave"
          size={96}
        />
        <h1 className="mt-4 text-2xl font-black text-pet-ink">
          {state === "unavailable"
            ? "This profile isn't available"
            : "We couldn't load this list"}
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

  const followers = relation === "followers";

  return (
    <div className="mx-auto w-full max-w-2xl pt-6">
      <Link
        aria-label={`Back to ${profile.displayName}'s profile`}
        className="-ml-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-pet-muted transition hover:bg-white hover:text-pet-ink"
        href={ownerSocialProfilePath(profile.handle)}
      >
        <Icon aria-hidden="true" className="h-4 w-4 rotate-180" name="chevron" />
        {profile.displayName}
      </Link>

      <h1 className="mt-2 text-2xl font-black text-pet-ink">
        {followers ? "Followers" : "Following"}
      </h1>
      <p className="mt-0.5 text-sm font-bold text-pet-muted">
        @{profile.handle}
      </p>

      <nav
        aria-label="Followers and following"
        className="mt-5 flex gap-2"
        data-testid="owner-connections-tabs"
      >
        <Link
          aria-current={followers ? "page" : undefined}
          className={tabClass(followers)}
          href={ownerFollowersPath(profile.handle)}
        >
          Followers
          <span className="ml-1.5 tabular-nums opacity-70">
            {relationship.followerCount}
          </span>
        </Link>
        <Link
          aria-current={followers ? undefined : "page"}
          className={tabClass(!followers)}
          href={ownerFollowingPath(profile.handle)}
        >
          Following
          <span className="ml-1.5 tabular-nums opacity-70">
            {relationship.followingCount}
          </span>
        </Link>
      </nav>

      <SocialAccountList
        accounts={accounts}
        emptyMessage={
          followers
            ? `Nobody is following ${profile.displayName} yet.`
            : `${profile.displayName} isn't following anyone yet.`
        }
        hasMore={Boolean(nextCursor)}
        loadingMore={loadingMore}
        onFollowChange={onFollowChange}
        onLoadMore={loadMore}
        signedIn={signedIn}
      />

      <CommunityBrandFooter signedIn={signedIn} />
    </div>
  );
}

function fetchPage(
  relation: ConnectionRelation,
  handle: string,
  cursor?: string
) {
  return relation === "followers"
    ? getOwnerFollowers(handle, cursor)
    : getOwnerFollowing(handle, cursor);
}

function tabClass(active: boolean) {
  return `inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-bold transition ${
    active
      ? "border-pet-ink bg-pet-ink text-white"
      : "border-pet-border bg-white text-pet-ink hover:bg-pet-cream"
  }`;
}
