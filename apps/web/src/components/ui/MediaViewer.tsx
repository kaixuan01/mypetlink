"use client";

import { useEffect, useRef } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { MomentMediaType } from "@/types";

export type MediaViewerItem = {
  id: string;
  type: MomentMediaType;
  url?: string;
  altText?: string;
};

type MediaViewerProps = {
  activeIndex: number;
  caption?: string;
  date?: string;
  items: MediaViewerItem[];
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function MediaViewer({
  activeIndex,
  caption,
  date,
  items,
  onActiveIndexChange,
  onClose,
  open,
  title,
}: MediaViewerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const safeIndex = Math.min(Math.max(activeIndex, 0), items.length - 1);
  const activeItem = items[safeIndex];
  const activeUrl = resolveMediaUrl(activeItem?.url);
  const hasMultiple = items.length > 1;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && items.length > 1) {
        onActiveIndexChange((safeIndex - 1 + items.length) % items.length);
      }
      if (event.key === "ArrowRight" && items.length > 1) {
        onActiveIndexChange((safeIndex + 1) % items.length);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [items.length, onActiveIndexChange, onClose, open, safeIndex]);

  if (!open || !activeItem) return null;

  return (
    <div
      aria-label={`${title} media viewer`}
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-pet-ink/85 p-0 backdrop-blur-md sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-[2rem]">
        <header className="flex items-start justify-between gap-4 border-b border-pet-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-pet-ink sm:text-xl">{title}</h2>
            <p className="mt-1 text-xs font-bold text-pet-muted">
              {[date, items.length > 1 ? `${safeIndex + 1} of ${items.length}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            aria-label="Close media viewer"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pet-cream text-2xl text-pet-ink transition hover:bg-pet-apricot focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="relative grid min-h-0 flex-1 place-items-center bg-[#09142e]">
          {activeUrl && activeItem.type === "video" ? (
            <video
              aria-label={activeItem.altText ?? title}
              className="max-h-[68dvh] w-full object-contain"
              controls
              key={activeItem.id}
              playsInline
              preload="metadata"
              src={activeUrl}
            />
          ) : activeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={activeItem.altText ?? title}
              className="max-h-[68dvh] w-full object-contain"
              src={activeUrl}
            />
          ) : (
            <div className="grid min-h-72 place-items-center px-8 text-center text-sm font-bold text-white/75">
              This media is not available right now.
            </div>
          )}

          {hasMultiple ? (
            <>
              <button
                aria-label="Previous media"
                className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/92 text-2xl font-black text-pet-ink shadow-lg transition hover:bg-white sm:left-5"
                onClick={() => onActiveIndexChange((safeIndex - 1 + items.length) % items.length)}
                type="button"
              >
                <span aria-hidden="true">&#8249;</span>
              </button>
              <button
                aria-label="Next media"
                className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/92 text-2xl font-black text-pet-ink shadow-lg transition hover:bg-white sm:right-5"
                onClick={() => onActiveIndexChange((safeIndex + 1) % items.length)}
                type="button"
              >
                <span aria-hidden="true">&#8250;</span>
              </button>
            </>
          ) : null}
        </div>

        {caption ? (
          <p className="border-t border-pet-border px-5 py-4 text-sm leading-6 text-pet-muted sm:px-6">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
