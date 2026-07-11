"use client";

import { useEffect, useRef } from "react";
import { MediaCounter } from "@/components/moments/MediaCounter";
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

export function pauseMediaElements(root: ParentNode | null) {
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
  const ordered = sortedMedia(items);
  const safeIndex = Math.min(Math.max(activeIndex, 0), ordered.length - 1);
  const activeItem = ordered[safeIndex];
  const activeUrl = resolveMediaUrl(activeItem?.url);
  const hasMultiple = ordered.length > 1;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pointerOriginRef = useRef<PointerOrigin | null>(null);

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
      if (event.key === "Escape") {
        pauseMediaElements(dialogRef.current);
        onClose();
        return;
      }

      if (!hasMultiple) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        pauseMediaElements(dialogRef.current);
        const offset = event.key === "ArrowLeft" ? -1 : 1;
        onActiveIndexChange(
          (safeIndex + offset + ordered.length) % ordered.length
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasMultiple, onActiveIndexChange, onClose, open, ordered.length, safeIndex]);

  if (!open || !activeItem) return null;

  const activeCaption = activeItem.caption?.trim() || caption?.trim();

  return (
    <div
      aria-label={`${title} media viewer`}
      aria-modal="true"
      className="fixed inset-0 z-[80] flex bg-[#050a16]/96 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeViewer();
      }}
      ref={dialogRef}
      role="dialog"
    >
      <div className="relative flex min-h-0 w-full flex-col">
        <div className="pointer-events-none absolute left-3 right-16 top-3 z-20 flex min-w-0 items-start gap-2 sm:left-5 sm:top-5">
          <div className="min-w-0 rounded-2xl bg-black/60 px-3 py-2 text-white shadow-lg backdrop-blur-sm">
            <h2 className="truncate text-sm font-black sm:text-base">{title}</h2>
            {date ? (
              <p className="mt-0.5 text-xs font-semibold text-white/70">{date}</p>
            ) : null}
          </div>
          <MediaCounter current={safeIndex + 1} total={ordered.length} />
        </div>

        <button
          aria-label="Close media viewer"
          className="absolute right-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5 sm:top-5"
          onClick={closeViewer}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">&times;</span>
        </button>

        <div
          aria-label="Media slide"
          className="relative grid min-h-0 flex-1 place-items-center overflow-hidden px-0 pb-1 pt-16 sm:px-16 sm:pb-3 sm:pt-20"
          onPointerDown={(event) => {
            pointerOriginRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            const origin = pointerOriginRef.current;
            pointerOriginRef.current = null;
            if (!origin || !hasMultiple) return;

            const deltaX = event.clientX - origin.x;
            const deltaY = event.clientY - origin.y;
            if (Math.abs(deltaX) >= 44 && Math.abs(deltaX) > Math.abs(deltaY)) {
              selectRelative(deltaX < 0 ? 1 : -1);
            }
          }}
          role="group"
          style={{ touchAction: "pan-y" }}
        >
          {activeUrl && activeItem.type === "video" ? (
            <video
              aria-label={activeItem.altText ?? title}
              className="max-h-full max-w-full object-contain"
              controls
              key={activeItem.id}
              playsInline
              poster={resolveMediaUrl(activeItem.posterUrl) || undefined}
              preload="metadata"
              src={activeUrl}
            />
          ) : activeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={activeItem.altText ?? title}
              className="max-h-full max-w-full object-contain"
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
                className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-3xl font-light text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:grid"
                onClick={() => selectRelative(-1)}
                type="button"
              >
                <span aria-hidden="true">&#8249;</span>
              </button>
              <button
                aria-label="Next media"
                className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-3xl font-light text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:grid"
                onClick={() => selectRelative(1)}
                type="button"
              >
                <span aria-hidden="true">&#8250;</span>
              </button>
            </>
          ) : null}
        </div>

        {activeCaption ? (
          <p className="shrink-0 border-t border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white/80 sm:px-6">
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
