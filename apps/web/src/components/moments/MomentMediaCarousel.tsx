"use client";

import { useMemo, useRef, useState } from "react";
import { MediaCounter } from "@/components/moments/MediaCounter";
import { MomentImage } from "@/components/moments/MomentImage";
import {
  MomentMediaViewer,
  pauseMediaElements,
} from "@/components/moments/MomentMediaViewer";
import { MomentVideoPlayer } from "@/components/moments/MomentVideoPlayer";
import { sortedMedia } from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import type { MomentMedia } from "@/types";

/**
 * Takes the media and the words around it, rather than a whole Moment.
 *
 * A Moment reaches this component from two directions now — an owner's own
 * record of it, and the public social card the community sees — and those are
 * different shapes for good reasons. Asking for the four things a carousel
 * actually uses lets both pass through one implementation, instead of one of
 * them growing a second carousel that swipes slightly differently.
 */
type MomentMediaCarouselProps = {
  media: MomentMedia[];
  title: string;
  /**
   * Let a video start silently once it is mostly on screen, the way a social
   * feed does. Off by default, because the owner-facing surfaces this component
   * was built for are lists of records, not a feed.
   */
  autoplayVideoWhenVisible?: boolean;
  caption?: string;
  date?: string;
  presentation?: "moment" | "timeline";
  theme?: PetProfileTheme;
};

type PointerOrigin = {
  x: number;
  y: number;
};

export function MomentMediaCarousel({
  media: items,
  title,
  autoplayVideoWhenVisible = false,
  caption,
  date,
  presentation = "moment",
  theme,
}: MomentMediaCarouselProps) {
  const timelinePresentation = presentation === "timeline";
  const media = useMemo(() => sortedMedia(items ?? []), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hasSwiped, setHasSwiped] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const pointerOriginRef = useRef<PointerOrigin | null>(null);
  const suppressClicksUntilRef = useRef(0);
  const safeIndex = Math.min(Math.max(activeIndex, 0), media.length - 1);
  const activeItem = media[safeIndex] ?? media[0];
  const activeUrl = resolveMediaUrl(activeItem?.url);
  const hasMultiple = media.length > 1;

  function selectIndex(index: number, fromSwipe = false) {
    if (!media.length) return;
    pauseMediaElements(carouselRef.current);
    setActiveIndex((index + media.length) % media.length);
    if (fromSwipe) {
      setHasSwiped(true);
      suppressClicksUntilRef.current = Date.now() + 250;
    }
  }

  function selectRelative(offset: number, fromSwipe = false) {
    selectIndex(safeIndex + offset, fromSwipe);
  }

  function openViewer(index: number) {
    pauseMediaElements(carouselRef.current);
    setViewerIndex(index);
    setViewerOpen(true);
  }

  function stopControlPointer(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
    pointerOriginRef.current = null;
  }

  if (!media.length) {
    return (
      <div
        className={`brand-paw-dots grid place-items-center bg-pet-cream px-6 text-center ${
          timelinePresentation ? "min-h-40" : "min-h-56"
        }`}
        style={theme ? { background: theme.colors.surfaceAlt } : undefined}
      >
        <div>
          <span
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pet-apricot text-2xl text-pet-coral"
            style={
              theme
                ? {
                    background: theme.colors.accentSoft,
                    color: theme.colors.accent,
                  }
                : undefined
            }
          >
            <span aria-hidden="true">♡</span>
          </span>
          <p className="mt-3 text-sm font-bold text-pet-muted">Moment note</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        aria-label={`${title} media carousel`}
        className={`relative mx-auto w-full overflow-hidden bg-[#081329] ${
          timelinePresentation
            ? "aspect-[4/3] max-h-[28rem] sm:aspect-[16/10]"
            : "aspect-[4/5] max-h-[46rem] sm:aspect-[4/3]"
        }`}
        onClickCapture={(event) => {
          if (Date.now() < suppressClicksUntilRef.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClicksUntilRef.current = 0;
          }
        }}
        onKeyDown={(event) => {
          if (!hasMultiple) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            selectRelative(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            selectRelative(1);
          }
        }}
        onPointerDown={(event) => {
          const target = event.target as Element;
          if (target.closest('[data-carousel-control="true"]')) {
            pointerOriginRef.current = null;
            return;
          }
          pointerOriginRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const origin = pointerOriginRef.current;
          pointerOriginRef.current = null;
          if (!origin || !hasMultiple) return;

          const deltaX = event.clientX - origin.x;
          const deltaY = event.clientY - origin.y;
          if (Math.abs(deltaX) >= 44 && Math.abs(deltaX) > Math.abs(deltaY)) {
            selectRelative(deltaX < 0 ? 1 : -1, true);
          }
        }}
        ref={carouselRef}
        role="region"
        style={{ maxWidth: "100%", touchAction: "pan-y" }}
        tabIndex={0}
      >
        {activeItem.type === "image" && activeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl motion-reduce:scale-100"
            decoding="async"
            loading="lazy"
            src={activeUrl}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/20" />

        {activeUrl && activeItem.type === "video" ? (
          <div className="absolute inset-0">
            <MomentVideoPlayer
              alt={activeItem.altText ?? `${title} video`}
              autoplayWhenVisible={autoplayVideoWhenVisible}
              compact={timelinePresentation}
              durationSeconds={activeItem.durationSeconds}
              posterUrl={activeItem.posterUrl}
              url={activeItem.url}
            />
          </div>
        ) : activeUrl ? (
          <button
            aria-label={`Open ${title} photo ${safeIndex + 1} of ${media.length}`}
            className="group/media absolute inset-0 h-full w-full cursor-zoom-in"
            onClick={(event) => {
              event.stopPropagation();
              openViewer(safeIndex);
            }}
            type="button"
          >
            {/*
              Lazy, because this carousel is now what a stream of Moments is
              made of. Explore used to draw tiles, whose images were lazy; the
              full card reached the same page eagerly and turned a page of
              fifteen Moments into fifteen immediate image requests.
            */}
            <MomentImage
              alt={activeItem.altText ?? `${title} photo`}
              className="h-full w-full object-contain transition duration-300 group-hover/media:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover/media:scale-100"
              decoding="async"
              loading="lazy"
              url={activeUrl}
            />
            <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover/media:bg-black/15 group-hover/media:opacity-100 group-focus-visible/media:bg-black/15 group-focus-visible/media:opacity-100 motion-reduce:transition-none">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-black/60 text-white shadow-xl backdrop-blur-sm">
                <ExpandIcon className="h-6 w-6" />
              </span>
            </span>
          </button>
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-bold text-white/75">
            This {activeItem.type} is not available right now.
          </div>
        )}

        <div className="absolute right-3 top-3 z-20 flex items-start gap-2">
          <MediaCounter className="mt-2" current={safeIndex + 1} total={media.length} />
          <button
            aria-label={`Expand ${activeItem.type} ${safeIndex + 1} of ${media.length}`}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
            data-carousel-control="true"
            onClick={(event) => {
              event.stopPropagation();
              openViewer(safeIndex);
            }}
            onPointerDown={stopControlPointer}
            type="button"
          >
            <ExpandIcon className="h-5 w-5" />
          </button>
        </div>

        {hasMultiple && !hasSwiped ? (
          <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-black/60 px-3 py-1.5 text-[0.68rem] font-black text-white/90 backdrop-blur-sm sm:hidden">
            Swipe for more
          </span>
        ) : null}

        {hasMultiple ? (
          <>
            <button
              aria-label="Previous media"
              className="absolute left-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:grid"
              data-carousel-control="true"
              onClick={(event) => {
                event.stopPropagation();
                selectRelative(-1);
              }}
              onPointerDown={stopControlPointer}
              type="button"
            >
              <ChevronIcon className="h-6 w-6" direction="left" />
            </button>
            <button
              aria-label="Next media"
              className="absolute right-3 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:grid"
              data-carousel-control="true"
              onClick={(event) => {
                event.stopPropagation();
                selectRelative(1);
              }}
              onPointerDown={stopControlPointer}
              type="button"
            >
              <ChevronIcon className="h-6 w-6" direction="right" />
            </button>

            <div
              aria-label="Choose media"
              className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center"
              role="group"
            >
              {media.map((item, index) => (
                <button
                  aria-label={`Show ${item.type} ${index + 1} of ${media.length}`}
                  aria-pressed={index === safeIndex}
                  className="grid h-11 w-11 place-items-center focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-white"
                  data-carousel-control="true"
                  key={item.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectIndex(index);
                  }}
                  onPointerDown={stopControlPointer}
                  type="button"
                >
                  <span
                    className={`block rounded-full transition-all motion-reduce:transition-none ${
                      index === safeIndex
                        ? "h-2.5 w-2.5 bg-white shadow-sm"
                        : "h-2 w-2 bg-white/55"
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        ) : null}

        <p aria-live="polite" className="sr-only">
          Showing {activeItem.type} {safeIndex + 1} of {media.length}
        </p>
      </div>

      <MomentMediaViewer
        activeIndex={viewerIndex}
        caption={caption}
        date={date}
        items={media}
        onActiveIndexChange={setViewerIndex}
        onClose={() => setViewerOpen(false)}
        open={viewerOpen}
        title={title}
      />
    </>
  );
}

function ExpandIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

function ChevronIcon({
  className = "",
  direction,
}: {
  className?: string;
  direction: "left" | "right";
}) {
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
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
