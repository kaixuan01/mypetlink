"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import { MomentMediaCarousel } from "@/components/moments/MomentMediaCarousel";
import { LikeButton } from "@/components/social/LikeButton";
import { MomentShareButton } from "@/components/social/MomentShareButton";
import { SharedByIdentity } from "@/components/social/SharedByIdentity";
import { MomentSubjects } from "@/components/social/SocialMomentParts";
import { Icon } from "@/components/ui/Icon";
import { ownerSocialProfilePath, socialRoutes } from "@/lib/routes";
import {
  formatMomentPublishedExact,
  formatMomentPublishedLabel,
  momentPublishedDateTime,
} from "@/lib/momentPublishedTime";
import {
  momentNotFoundTitle,
  momentTitleMetaName,
  momentTitleText,
  momentUnavailableTitle,
} from "@/lib/momentDocumentTitle";
import { formatPageTitle } from "@/lib/pageTitles";
import { toViewerMedia } from "@/lib/socialMomentMedia";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useSignedIn } from "@/lib/useSignedIn";
import {
  getPublicMoment,
  PublicProfileUnavailableError,
  type PublicMomentListItem,
} from "@/services/publicSocialService";

type Phase =
  | { state: "loading" }
  | { state: "ready"; moment: PublicMomentListItem }
  /** The Moment is gone, or was never shared. Retrying cannot change that. */
  | { state: "unavailable" }
  /** We could not ask. Says so, and offers to ask again. */
  | { state: "error" };

/**
 * One Moment, on its own page.
 *
 * This is the canonical destination: tapping a card opens it, a like
 * notification opens it, and sharing a Moment shares this address. Before it
 * existed a Moment could be seen but never opened — a card showed one photo of
 * four and a badge saying so, and there was nowhere for the other three to be.
 *
 * It uses the shell every public Community page uses, which resolves the
 * question of whose page this is: a signed-in owner keeps their ordinary
 * Community chrome, and a visitor who followed a shared link gets a brand header
 * and a way in rather than owner navigation they cannot use. Nothing goes
 * full-screen and nothing is hidden, so there is no special back behaviour to
 * learn. The page offers a deterministic link to the sharing household (or
 * Explore while that identity is unavailable); the browser's own Back action
 * still returns to the exact feed or grid somebody came from.
 *
 * The media is the shared carousel every other Moment surface uses, so swipe,
 * arrows, keyboard order, the full-screen lightbox and the rule that only one
 * video plays at a time are the same here as anywhere else.
 */
export function MomentDetailView({ momentId }: { momentId: string }) {
  const signedIn = useSignedIn();
  const [phase, setPhase] = useState<Phase>({ state: "loading" });
  /** Bumped by Retry; the load effect keys off it. */
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setPhase({ state: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;

    getPublicMoment(momentId)
      .then((moment) => {
        if (active) setPhase({ state: "ready", moment });
      })
      .catch((error: unknown) => {
        if (!active) return;

        // The two are not the same and must not read the same. Only a
        // not-found means the Moment is genuinely unavailable; a dropped
        // request means we do not know, and saying "the family may not be
        // sharing it right now" would invent a reason from nothing.
        setPhase(
          error instanceof PublicProfileUnavailableError &&
            error.reason === "not-found"
            ? { state: "unavailable" }
            : { state: "error" }
        );
      });

    return () => {
      active = false;
    };
  }, [momentId, attempt]);

  // What the edge already called this page, if it served it. Read once, on
  // the first render, and only for this Moment's id.
  const [edgeTitle] = useState(() => readEdgeMomentTitle(momentId));

  // The page names itself once it knows what it is showing. While it is still
  // asking, it holds the edge's title for this Moment — the shell's own
  // metadata says "Loading", and Next commits that after hydration — and
  // otherwise asserts nothing rather than a placeholder.
  useDocumentTitle(
    phase.state === "ready"
      ? formatPageTitle(momentTitleText(phase.moment.title))
      : phase.state === "unavailable"
        ? formatPageTitle(momentNotFoundTitle)
        : phase.state === "error"
          ? formatPageTitle(momentUnavailableTitle)
          : edgeTitle
            ? formatPageTitle(edgeTitle)
            : null
  );

  const onLikeChange = useCallback(
    (_id: string, state: { likeCount: number; viewerHasLiked: boolean }) => {
      setPhase((current) =>
        current.state === "ready"
          ? { state: "ready", moment: { ...current.moment, ...state } }
          : current
      );
    },
    []
  );

  return (
    <SocialLayout>
      <div className="mx-auto w-full max-w-2xl pb-4">
        <BackControl
          author={phase.state === "ready" ? phase.moment.author : null}
        />

        {phase.state === "loading" ? <MomentSkeleton /> : null}
        {phase.state === "unavailable" ? <MomentUnavailable /> : null}
        {phase.state === "error" ? <MomentLoadFailed onRetry={retry} /> : null}
        {phase.state === "ready" ? (
          <MomentArticle
            moment={phase.moment}
            onLikeChange={onLikeChange}
            signedIn={signedIn}
          />
        ) : null}
      </div>
    </SocialLayout>
  );
}

function readEdgeMomentTitle(momentId: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const tag = document.head.querySelector<HTMLMetaElement>(
    `meta[name="${momentTitleMetaName}"]`
  );

  return tag?.content === momentId ? tag.dataset.title?.trim() || null : null;
}

/**
 * A truthful, deterministic way back into Community.
 *
 * `history.length` cannot tell a real in-app predecessor from the browser's
 * initial `about:blank` entry. Treating it as one sent a directly opened shared
 * Moment out of MyPetLink. The explicit control therefore names a real route;
 * browser Back remains available for the exact feed or grid context.
 */
function BackControl({
  author,
}: {
  author: PublicMomentListItem["author"] | null;
}) {
  const className =
    "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3 text-sm font-extrabold text-pet-ink transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal";

  if (!author) {
    return (
      <Link className={`-ml-3 ${className}`} href={socialRoutes.explore}>
        <Icon aria-hidden="true" className="h-4 w-4" name="search" />
        Explore MyPetLink
      </Link>
    );
  }

  return (
    <Link
      className={`-ml-3 ${className}`}
      href={ownerSocialProfilePath(author.handle)}
    >
      <BackIcon className="h-4 w-4" />
      <span className="min-w-0 truncate">Back to {author.displayName}</span>
    </Link>
  );
}

function MomentArticle({
  moment,
  onLikeChange,
  signedIn,
}: {
  moment: PublicMomentListItem;
  onLikeChange: (
    momentId: string,
    state: { likeCount: number; viewerHasLiked: boolean }
  ) => void;
  signedIn: boolean | null;
}) {
  const media = useMemo(
    () => toViewerMedia(moment.media, moment.title),
    [moment.media, moment.title]
  );
  const published = formatMomentPublishedExact(moment.publishedAt);

  return (
    <article
      className="brand-card mt-3 overflow-hidden rounded-[1.5rem] p-0"
      data-testid="moment-detail"
    >
      {/*
        The pet on top, the household under it. A card byline puts the two on
        one line because a card has a dozen of them and no room; a Moment's own
        page has one, and squeezing a display name and a handle into the same
        constrained line there meant both truncated and neither was readable.
        The hierarchy is also the point: the Moment is about the pet, and the
        household is who shared it.
      */}
      <header className="flex flex-col gap-3 p-4 pb-3">
        <MomentSubjects subjects={moment.subjects} />
        {moment.author ? <SharedByIdentity author={moment.author} /> : null}
      </header>

      {media.length > 0 ? (
        <MomentMediaCarousel
          // One Moment, deliberately opened, filling the screen: a video here
          // starts silently on its own the way a feed does. It still never makes
          // a sound unasked, and moving to another item stops it.
          autoplayVideoWhenVisible
          caption={moment.caption ?? undefined}
          date={published}
          media={media}
          title={moment.title}
        />
      ) : null}

      <div className="flex flex-col gap-3 p-4">
        <div>
          <h1 className="text-lg font-black text-pet-ink" data-testid="moment-title">
            {moment.title}
          </h1>
          {published ? (
            // The Moment's own page has room for the exact time, so it says it
            // rather than making a reader work back from "3h".
            <time
              className="mt-0.5 block text-xs font-bold text-pet-muted"
              dateTime={momentPublishedDateTime(moment.publishedAt)}
              data-testid="moment-published"
              title={formatMomentPublishedLabel(moment.publishedAt)}
            >
              {published}
            </time>
          ) : null}
        </div>

        {moment.caption ? (
          <p className="whitespace-pre-line text-sm font-semibold leading-6 text-pet-ink">
            {moment.caption}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-pet-border pt-3">
          <div className="-ml-2">
            <LikeButton
              analyticsSource="direct"
              likeCount={moment.likeCount}
              momentId={moment.id}
              momentTitle={moment.title}
              onChange={(state) => onLikeChange(moment.id, state)}
              signedIn={signedIn}
              viewerHasLiked={moment.viewerHasLiked}
            />
          </div>

          <MomentShareButton momentId={moment.id} title={moment.title} />
        </div>
      </div>
    </article>
  );
}

function MomentSkeleton() {
  return (
    <div
      aria-busy="true"
      className="brand-card mt-3 overflow-hidden rounded-[1.5rem] p-0"
      data-testid="moment-detail-loading"
    >
      <div className="flex items-center gap-2 p-4">
        <span className="h-8 w-8 rounded-full bg-pet-border/60" />
        <span className="h-3 w-32 rounded-full bg-pet-border/60" />
      </div>
      <div className="aspect-[4/5] w-full bg-pet-border/40 sm:aspect-[4/3]" />
      <div className="flex flex-col gap-2 p-4">
        <span className="h-4 w-2/3 rounded-full bg-pet-border/60" />
        <span className="h-3 w-1/3 rounded-full bg-pet-border/60" />
      </div>
      <span className="sr-only">Loading this Moment</span>
    </div>
  );
}

/**
 * We could not reach the server. No claim about the Moment itself, because we
 * do not have one.
 */
function MomentLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="mt-3 rounded-[1.75rem] border border-pet-border bg-white p-6 text-center"
      data-testid="moment-load-failed"
    >
      <h1 className="text-base font-black text-pet-ink">
        We couldn&rsquo;t load this Moment
      </h1>
      <p className="mt-1 text-sm font-semibold text-pet-muted">
        Check your connection and try again.
      </p>
      <button
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-pet-teal px-5 text-sm font-extrabold text-pet-teal transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

function MomentUnavailable() {
  return (
    <div
      className="mt-3 rounded-[1.75rem] border border-pet-border bg-white p-6 text-center"
      data-testid="moment-unavailable"
    >
      <LinkoMascot
        alt="Linko the MyPetLink mascot waving"
        className="mx-auto"
        pose="wave"
        size={56}
      />
      <h1 className="mt-2 text-base font-black text-pet-ink">
        This Moment isn&rsquo;t available
      </h1>
      <p className="mt-1 text-sm font-semibold text-pet-muted">
        It may have been taken down, or the family may not be sharing it right
        now.
      </p>
      <Link
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-pet-teal bg-pet-teal px-5 text-sm font-extrabold text-white transition hover:bg-[#0f5fd0]"
        href={socialRoutes.explore}
      >
        Explore MyPetLink
      </Link>
    </div>
  );
}

function BackIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
