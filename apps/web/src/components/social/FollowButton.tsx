"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { trackEvent, type AnalyticsSocialSource } from "@/lib/analytics";
import { ownerLoginPath } from "@/lib/authRedirect";
import { ownerSocialProfilePath } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import {
  followOwner,
  unfollowOwner,
  type OwnerRelationship,
} from "@/services/socialGraphService";

type FollowButtonProps = {
  handle: string;
  displayName: string;
  relationship: OwnerRelationship;
  /** Called with the server's own answer once the change lands. */
  onChange: (relationship: OwnerRelationship) => void;
  /** Null until the signed-in check has run in the browser. */
  signedIn: boolean | null;
  /**
   * "attribution" is the byline on a pet page, where the button has to say out
   * loud that it follows the household and not the pet.
   */
  surface?: "profile" | "attribution";
  /** Which screen this control is on. Categorical; never which household. */
  analyticsSource?: AnalyticsSocialSource;
  className?: string;
};

/**
 * Follow / unfollow a household.
 *
 * Updates optimistically, because a follow that waits on a round trip feels
 * broken, and rolls back with a visible message if the request fails — the
 * button must never show a state the server did not agree to.
 *
 * Renders nothing when there is nobody to follow: your own profile, a household
 * that has closed follows, or one either side has blocked. A blocked visitor is
 * shown the same absence as a household that simply has no button, which is the
 * point — nothing here tells anyone they were blocked.
 */
export function FollowButton({
  handle,
  displayName,
  relationship,
  onChange,
  signedIn,
  surface = "profile",
  analyticsSource = "direct",
  className = "",
}: FollowButtonProps) {
  const [pending, setPending] = useState(false);
  // The failure is remembered together with the household it belonged to, so a
  // button that moves to another household drops it without an effect — and so
  // a rollback, which changes the relationship in the same commit that sets the
  // message, cannot erase the explanation the moment it appears.
  const [failure, setFailure] = useState<{
    handle: string;
    message: string;
  } | null>(null);

  const submit = useCallback(async () => {
    if (pending) {
      return;
    }

    const previous = relationship;
    const following = previous.isFollowing;

    setPending(true);
    setFailure(null);
    onChange({
      ...previous,
      isFollowing: !following,
      followerCount: Math.max(0, previous.followerCount + (following ? -1 : 1)),
    });

    try {
      const confirmed = following
        ? await unfollowOwner(handle)
        : await followOwner(handle);
      onChange(confirmed);

      // Only after the server agreed: a rolled-back optimistic update is not a
      // follow, and counting it as one would overstate every funnel.
      trackEvent(following ? "pet_unfollowed" : "pet_followed", {
        source: analyticsSource,
      });
    } catch (caught) {
      onChange(previous);
      setFailure({
        handle,
        message: isApiClientError(caught)
          ? caught.message
          : "We couldn't update this. Please try again.",
      });
    } finally {
      setPending(false);
    }
  }, [analyticsSource, handle, onChange, pending, relationship]);

  if (relationship.isSelf) {
    return null;
  }

  const attribution = surface === "attribution";

  // Signed out, and this household accepts followers: offer the way in rather
  // than a control that cannot work. The return path is the profile, so the
  // visitor lands somewhere they recognise after signing in.
  if (signedIn === false) {
    return relationship.allowsFollowers ? (
      <Link
        aria-label={`Sign in to follow ${displayName}`}
        className={`${baseClass} ${followClass} ${className}`}
        data-testid="follow-button-signin"
        href={ownerLoginPath(ownerSocialProfilePath(handle))}
      >
        {attribution ? `Follow @${handle}` : "Follow"}
      </Link>
    ) : null;
  }

  // Nothing to offer: followers are closed, or one side has blocked the other.
  // Already-following stays actionable so a follow can always be undone.
  if (!relationship.canFollow && !relationship.isFollowing) {
    return null;
  }

  const error = failure?.handle === handle ? failure.message : null;
  const following = relationship.isFollowing;
  const label = following
    ? "Following"
    : attribution
      ? `Follow @${handle}`
      : "Follow";

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        aria-label={
          following
            ? `Stop following ${displayName} (@${handle})`
            : `Follow ${displayName} (@${handle})`
        }
        aria-pressed={following}
        className={`${baseClass} ${following ? followingClass : followClass} follow-button`}
        data-following={following ? "true" : "false"}
        data-testid="follow-button"
        disabled={pending || signedIn === null}
        onClick={submit}
        type="button"
      >
        <span className="truncate">{label}</span>
      </button>

      {error ? (
        <span
          className="text-xs font-semibold text-[#a63c2e]"
          data-testid="follow-button-error"
          role="status"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}

const baseClass =
  "inline-flex min-h-10 max-w-[12rem] items-center justify-center rounded-full border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60";
const followClass = "border-pet-teal bg-pet-teal text-white hover:bg-[#1f7fa8]";
const followingClass =
  "border-pet-border bg-white text-pet-ink hover:bg-pet-cream";
