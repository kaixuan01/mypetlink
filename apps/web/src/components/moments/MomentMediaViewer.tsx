"use client";

import { useEffect, useMemo, useRef } from "react";
import { MediaCounter } from "@/components/moments/MediaCounter";
import {
  MomentVideoPlayer,
  pauseActiveMomentVideo,
} from "@/components/moments/MomentVideoPlayer";
import { sortedMedia } from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { MomentMedia } from "@/types";

type MomentMediaViewerProps = {
  activeIndex: number;
  caption?: string;
  date?: string;
  items: MomentMedia[];
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  open: boolean;
  title: string;
};

type PointerOrigin = {
  x: number;
  y: number;
};

const focusableSelector = [
  "button:not([disabled])",
  "video[controls]",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function pauseMediaElements(root: ParentNode | null) {
  pauseActiveMomentVideo();
  root?.querySelectorAll("video").forEach((video) => video.pause());
}

export function MomentMediaViewer({
  activeIndex,
  caption,
  date,
  items,
  onActiveIndexChange,
  onClose,
  open,
  title,
}: MomentMediaViewerProps) {
  const ordered = useMemo(() => sortedMedia(items), [items]);
  const safeIndex = Math.min(Math.max(activeIndex, 0), ordered.length - 1);
  const activeItem = ordered[safeIndex];
  const activeUrl = resolveMediaUrl(activeItem?.url);
  const hasMultiple = ordered.length > 1;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pointerOriginRef = useRef<PointerOrigin | null>(null);
  const suppressClicksUntilRef = useRef(0);

  function selectIndex(index: number) {
    const count = ordered.length;
    if (!count) return;
    pauseMediaElements(dialogRef.current);
    onActiveIndexChange((index + count) % count);
  }

  function selectRelative(offset: number) {
    selectIndex(safeIndex + offset);
  }

  function closeViewer() {
    pauseMediaElements(dialogRef.current);
    onClose();
  }

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const bodyStyle = {
      left: document.body.style.left,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      right: document.body.style.right,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const dialog = dialogRef.current;

    return () => {
      pauseMediaElements(dialog);
      document.body.style.left = bodyStyle.left;
      document.body.style.overflow = bodyStyle.overflow;
      document.body.style.position = bodyStyle.position;
      document.body.style.right = bodyStyle.right;
      document.body.style.top = bodyStyle.top;
      document.body.style.width = bodyStyle.width;
      window.scrollTo(scrollX, scrollY);
      previouslyFocused?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
        );
        if (!focusable.length) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!dialogRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
        return;
      }

      if (!hasMultiple) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const offset = event.key === "ArrowLeft" ? -1 : 1;
        selectRelative(offset);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!open || !activeItem) return null;

  const activeCaption = activeItem.caption?.trim() || caption?.trim();

  return (
    <div
      aria-label={`${title} media viewer`}
      aria-modal="true"
      className="fixed inset-0 z-[80] flex bg-[#030711]/95 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeViewer();
      }}
      ref={dialogRef}
      role="dialog"
    >
      <div className="pointer-events-none relative flex min-h-0 w-full flex-col">
        <div
          className="pointer-events-none absolute left-3 right-16 z-20 flex min-w-0 items-start gap-2 sm:left-5"
          style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="min-w-0 rounded-2xl bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur-sm">
            <h2 className="truncate text-sm font-black sm:text-base">{title}</h2>
            {date ? (
              <p className="mt-0.5 text-xs font-semibold text-white/70">{date}</p>
            ) : null}
          </div>
          <MediaCounter className="mt-1" current={safeIndex + 1} total={ordered.length} />
        </div>

        <button
          aria-label="Close media viewer"
          className="pointer-events-auto absolute right-3 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:right-5"
          data-viewer-control="true"
          onClick={(event) => {
            event.stopPropagation();
            closeViewer();
          }}
          ref={closeButtonRef}
          style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
          type="button"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div
          aria-label="Media slide"
          className="pointer-events-auto relative grid min-h-0 flex-1 place-items-center overflow-hidden px-0 pt-16 sm:px-16 sm:pt-20"
          onClickCapture={(event) => {
            if (Date.now() < suppressClicksUntilRef.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClicksUntilRef.current = 0;
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
          onPointerDown={(event) => {
            const target = event.target as Element;
            if (target.closest('button:not([data-video-surface="true"])')) {
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
              suppressClicksUntilRef.current = Date.now() + 250;
              selectRelative(deltaX < 0 ? 1 : -1);
            }
          }}
          role="group"
          style={{
            paddingBottom: hasMultiple
              ? "max(3rem, calc(env(safe-area-inset-bottom) + 2.5rem))"
              : "max(0.75rem, env(safe-area-inset-bottom))",
            touchAction: "pan-y",
          }}
        >
          {activeUrl && activeItem.type === "video" ? (
            <div
              className="h-full w-full max-h-[82dvh] max-w-[95vw] overflow-hidden rounded-lg bg-[#081329] shadow-2xl sm:max-w-[calc(100vw-9rem)]"
              onClick={(event) => event.stopPropagation()}
            >
              <MomentVideoPlayer
                alt={activeItem.altText ?? `${title} video`}
                durationSeconds={activeItem.durationSeconds}
                key={activeItem.id}
                mode="viewer"
                posterUrl={activeItem.posterUrl}
                url={activeItem.url}
              />
            </div>
          ) : activeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={activeItem.altText ?? title}
              className="max-h-[82dvh] max-w-[95vw] rounded-sm object-contain shadow-2xl sm:max-w-[calc(100vw-9rem)]"
              onClick={(event) => event.stopPropagation()}
              src={activeUrl}
            />
          ) : (
            <div className="grid min-h-72 place-items-center px-8 text-center text-sm font-bold text-white/70">
              This media is not available right now.
            </div>
          )}

          {hasMultiple ? (
            <>
              <button
                aria-label="Previous media"
                className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:grid"
                data-viewer-control="true"
                onClick={(event) => {
                  event.stopPropagation();
                  selectRelative(-1);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                <ChevronIcon className="h-7 w-7" direction="left" />
              </button>
              <button
                aria-label="Next media"
                className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:grid"
                data-viewer-control="true"
                onClick={(event) => {
                  event.stopPropagation();
                  selectRelative(1);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                <ChevronIcon className="h-7 w-7" direction="right" />
              </button>

              <div
                aria-label="Choose viewer media"
                className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center"
                role="group"
              >
                {ordered.map((item, index) => (
                  <button
                    aria-label={`View ${item.type} ${index + 1} of ${ordered.length}`}
                    aria-pressed={index === safeIndex}
                    className="grid h-11 w-11 place-items-center focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-white"
                    data-viewer-control="true"
                    key={item.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectIndex(index);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <span
                      className={`rounded-full transition-all motion-reduce:transition-none ${
                        index === safeIndex
                          ? "h-2.5 w-2.5 bg-white"
                          : "h-2 w-2 bg-white/50"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {activeCaption ? (
          <p
            className="pointer-events-auto shrink-0 border-t border-white/10 bg-black/35 px-4 pt-3 text-sm leading-6 text-white/85 sm:px-6"
            onClick={(event) => event.stopPropagation()}
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {activeCaption}
          </p>
        ) : null}

        <p aria-live="polite" className="sr-only">
          Showing {activeItem.type} {safeIndex + 1} of {ordered.length}
        </p>
      </div>
    </div>
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <path d="m6 6 12 12M18 6 6 18" />
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
