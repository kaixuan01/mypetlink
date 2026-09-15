"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { formatMomentAge } from "@/components/social/SocialMomentParts";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import { ownerSocialProfilePath, socialRoutes } from "@/lib/routes";
import { setUnreadActivityCount } from "@/lib/useUnreadActivity";
import {
  getSocialNotifications,
  markActivityRead,
  type SocialNotification,
} from "@/services/socialNotificationService";

type LoadState = "loading" | "ready" | "error";

/**
 * Activity: who followed you, and who liked a Moment.
 *
 * Opening this screen is what "read" means, so everything unread is marked on
 * arrival — but the rows keep their unread treatment for this visit, because a
 * list that blanks itself the instant you arrive is a list you cannot read.
 *
 * Unread is never signalled by colour alone: an unread row carries a dot, a
 * word, and a heavier ground.
 */
export function SocialNotificationsView() {
  const [state, setState] = useState<LoadState>("loading");
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

        if (page.unreadCount > 0) {
          // Opening this screen is what "read" means. The rows keep their
          // unread treatment for this visit — a list that blanks itself the
          // instant you arrive is a list you cannot read — but every badge on
          // screen drops now.
          const remaining = await markActivityRead().catch(() => null);

          if (remaining !== null) {
            setUnreadActivityCount(remaining);
          }
        }
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
    } catch {
      setNextCursor(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-2xl font-black text-pet-ink">Activity</h1>

      {state === "loading" ? (
        <div aria-busy="true" className="mt-5 space-y-2" data-testid="activity-loading">
          <span className="sr-only">Loading your activity</span>
          <div className="h-16 animate-pulse rounded-[1.25rem] bg-white" />
          <div className="h-16 animate-pulse rounded-[1.25rem] bg-white" />
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
            When pet parents follow you or like a Moment, you&rsquo;ll see it
            here.
          </p>
          <div className="mt-5">
            <CTAButton href={socialRoutes.explore}>Explore pets</CTAButton>
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
  const destination =
    item.type === "MomentLiked" && item.petPublicSlug
      ? `/p/${item.petPublicSlug}`
      : ownerSocialProfilePath(item.actor.handle);

  const subjects = formatMomentSubjects(item.momentSubjectNames);
  const sentence =
    item.type === "NewFollower"
      ? `${item.actor.displayName} started following you.`
      : subjects
        ? `${item.actor.displayName} liked your Moment of ${subjects}.`
        : `${item.actor.displayName} liked your Moment.`;

  // The link's accessible name says where it goes, not just what happened.
  const destinationLabel =
    item.type === "MomentLiked" && item.petName
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
              name={item.type === "MomentLiked" ? "heart" : "users"}
            />
          )}
        </span>

        <span aria-hidden="true" className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 text-pet-ink">
            <span className="font-black">{item.actor.displayName}</span>{" "}
            {item.type === "NewFollower"
              ? "started following you."
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
              {formatMomentAge(item.createdAt, now)}
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
