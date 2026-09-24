"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDelayedFlag } from "@/lib/useDelayedFlag";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { formatRelativeAge } from "@/lib/momentPublishedTime";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { AccountRowSkeleton } from "@/components/social/SocialSkeletons";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import { momentPath, ownerSocialProfilePath, socialRoutes } from "@/lib/routes";
import { setUnreadActivityCount } from "@/lib/useUnreadActivity";
import {
  getSocialNotifications,
  markActivityRead,
  type SocialNotification,
} from "@/services/socialNotificationService";

type LoadState = "loading" | "ready" | "error";

/**
 * Activity: who followed you, liked a Moment, or commented on one.
 *
 * Reading is per page, not per visit. Opening this screen marks the rows it
 * actually delivered — and each further page marks its own — rather than
 * marking everything unread in the account. Marking away activity from three
 * pages down, which the client was never even sent, is the version of this that
 * loses things: somebody who taps Activity by accident should consume the
 * newest page and nothing else. The badge then shows what genuinely remains.
 *
 * The rows keep their unread treatment for this visit, because a list that
 * blanks itself the instant you arrive is a list you cannot read.
 *
 * Unread is never signalled by colour alone: an unread row carries a dot, a
 * word, and a heavier ground.
 */
/**
 * Marks exactly the rows this client received, and syncs every badge on screen
 * to what is genuinely left. A failure here is silent: a badge is the last
 * thing that should produce an error message.
 */
async function consume(delivered: SocialNotification[]) {
  const unread = delivered.filter((item) => !item.isRead).map((item) => item.id);

  if (unread.length === 0) {
    return;
  }

  const remaining = await markActivityRead(unread).catch(() => null);

  if (remaining !== null) {
    setUnreadActivityCount(remaining);
  }
}

export function SocialNotificationsView() {
  const [state, setState] = useState<LoadState>("loading");
  const showSkeleton = useDelayedFlag(state === "loading");
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    getSocialNotifications()
      .then(async (page) => {
        if (!active) return;

        setItems(page.items);
        setNextCursor(page.nextCursor);
        setLoadedAt(Date.now());
        setState("ready");

        await consume(page.items);
      })
      .catch(() => {
        if (active) setState("error");
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await getSocialNotifications(nextCursor);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      await consume(page.items);
    } catch {
      setNextCursor(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-2xl font-black text-pet-ink">Activity</h1>

      {/*
        The skeleton waits ~180ms before appearing. Activity usually answers in
        a few tens of milliseconds, and a placeholder that shows for two frames
        and then gives way to "Nothing new yet" reads as a flash rather than as
        loading. Nothing is delayed except the decision to draw it — the screen
        holds neutral space meanwhile, and the announcement stays live for
        anybody who is not watching for it.
      */}
      {state === "loading" ? (
        <div aria-busy="true" className="mt-5 space-y-2" data-testid="activity-loading">
          <span className="sr-only">Loading your activity</span>
          {showSkeleton ? (
            <>
              <AccountRowSkeleton />
              <AccountRowSkeleton />
            </>
          ) : (
            <div className="h-16" />
          )}
        </div>
      ) : null}

      {state === "error" ? (
        <div
          className="mt-5 rounded-[1.5rem] border border-pet-border bg-white p-8 text-center"
          data-testid="activity-error"
        >
          <p className="text-sm font-bold text-pet-ink">
            We couldn&rsquo;t load your activity.
          </p>
          <div className="mt-4">
            <CTAButton
              onClick={() => {
                setState("loading");
                setReloadToken((token) => token + 1);
              }}
              type="button"
              variant="secondary"
            >
              Try again
            </CTAButton>
          </div>
        </div>
      ) : null}

      {state === "ready" && items.length === 0 ? (
        <div
          className="mt-5 rounded-[1.75rem] border border-pet-border bg-white p-8 text-center"
          data-testid="activity-empty"
        >
          <LinkoMascot
            alt="Linko the MyPetLink mascot waving"
            className="mx-auto"
            pose="wave"
            size={96}
          />
          <h2 className="mt-4 text-lg font-black text-pet-ink">Nothing new yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
            When pet parents follow you, like a Moment, or comment on one,
            you&rsquo;ll see it here.
          </p>
          <div className="mt-5">
            <CTAButton href={socialRoutes.explore}>Explore</CTAButton>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-5 space-y-2" data-testid="activity-list">
          {items.map((item) => (
            <ActivityRow item={item} key={item.id} now={loadedAt} />
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <div className="mt-6 flex justify-center">
          <CTAButton
            disabled={loadingMore}
            onClick={loadMore}
            type="button"
            variant="secondary"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </CTAButton>
        </div>
      ) : null}
    </div>
  );
}

function ActivityRow({
  item,
  now,
}: {
  item: SocialNotification;
  now?: number;
}) {
  // A like now opens the exact Moment, which is what the sentence above it
  // describes. The pet's profile remains the fallback for a row recorded before
  // Moments had a page of their own; neither destination is a promise that the
  // content is still there, because both re-check on arrival.
  const destination =
    item.type === "MomentCommented" && item.momentId
      ? `${momentPath(item.momentId)}${item.commentId ? `#comment-${item.commentId}` : "#comments"}`
      : item.type === "MomentLiked" && item.momentId
        ? momentPath(item.momentId)
      : item.type === "MomentLiked" && item.petPublicSlug
        ? `/p/${item.petPublicSlug}`
        : ownerSocialProfilePath(item.actor.handle);

  const subjects = formatMomentSubjects(item.momentSubjectNames);
  const sentence =
    item.type === "NewFollower"
      ? `${item.actor.displayName} started following you.`
      : item.type === "MomentCommented"
        ? `${item.actor.displayName} commented on your Moment.`
        : subjects
        ? `${item.actor.displayName} liked your Moment of ${subjects}.`
        : `${item.actor.displayName} liked your Moment.`;

  // The link's accessible name says where it goes, not just what happened.
  const destinationLabel =
    item.type === "MomentCommented" && item.momentId
      ? "View this comment"
      : item.type === "MomentLiked" && item.momentId
      ? "View this Moment"
      : item.type === "MomentLiked" && item.petName
        ? `View ${item.petName}'s profile`
        : `View ${item.actor.displayName}'s profile`;

  return (
    <li>
      <Link
        aria-label={`${item.isRead ? "" : "Unread. "}${sentence} ${destinationLabel}.`}
        className={`flex min-w-0 items-center gap-3 rounded-[1.25rem] border p-3 transition ${
          item.isRead
            ? "border-pet-border bg-white hover:bg-pet-cream"
            : "border-pet-teal bg-[#f2faff] hover:bg-[#e8f3ff]"
        }`}
        data-read={item.isRead ? "true" : "false"}
        data-testid="activity-row"
        href={destination}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
          {item.actor.avatarThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              src={item.actor.avatarThumbnailUrl}
            />
          ) : (
            <Icon
              aria-hidden="true"
              className="h-5 w-5 text-pet-muted"
              name={
                item.type === "MomentLiked"
                  ? "heart"
                  : item.type === "MomentCommented"
                    ? "comment"
                    : "users"
              }
            />
          )}
        </span>

        <span aria-hidden="true" className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 text-pet-ink">
            <span className="font-black">{item.actor.displayName}</span>{" "}
            {item.type === "NewFollower"
              ? "started following you."
              : item.type === "MomentCommented"
                ? "commented on your Moment."
                : subjects
                ? `liked your Moment of ${subjects}.`
                : "liked your Moment."}
          </span>
          <span className="mt-0.5 block truncate text-xs font-bold text-pet-muted">
            @{item.actor.handle}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {now !== undefined ? (
            <time
              className="text-xs font-semibold text-pet-muted"
              dateTime={item.createdAt}
            >
              {formatRelativeAge(item.createdAt, now)}
            </time>
          ) : null}

          {/* Never colour alone: a dot, a word, and a heavier ground. */}
          {item.isRead ? null : (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-pet-teal"
              data-testid="activity-unread-marker"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-pet-teal"
              />
              New
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
