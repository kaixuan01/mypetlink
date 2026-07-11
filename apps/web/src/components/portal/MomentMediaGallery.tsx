"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { MediaViewer } from "@/components/ui/MediaViewer";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import { getCoverMedia, mediaCountLabel, sortedMedia } from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { PetMoment } from "@/types";

type MomentMediaGalleryProps = {
  moment: PetMoment;
  theme?: PetProfileTheme;
};

export function MomentMediaGallery({ moment, theme }: MomentMediaGalleryProps) {
  const media = useMemo(() => sortedMedia(moment.media ?? []), [moment.media]);
  const cover = getCoverMedia(moment);
  const initialIndex = Math.max(0, media.findIndex((item) => item.id === cover?.id));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [viewerOpen, setViewerOpen] = useState(false);
  const activeItem = media[activeIndex] ?? media[0];
  const activeUrl = resolveMediaUrl(activeItem?.url);
  const countLabel = mediaCountLabel(media);

  if (!media.length) {
    return (
      <div
        className="brand-paw-dots grid min-h-56 place-items-center bg-pet-cream px-6 text-center"
        style={theme ? { background: theme.colors.surfaceAlt } : undefined}
      >
        <div>
          <span
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pet-apricot text-pet-coral"
            style={theme ? { background: theme.colors.accentSoft, color: theme.colors.accent } : undefined}
          >
            <Icon className="h-6 w-6" name="heart" />
          </span>
          <p className="mt-3 text-sm font-bold text-pet-muted">Memory note</p>
        </div>
      </div>
    );
  }

  function selectRelative(offset: number) {
    setActiveIndex((current) => (current + offset + media.length) % media.length);
  }

  return (
    <>
      <div className="bg-pet-cream" style={theme ? { background: theme.colors.surfaceAlt } : undefined}>
        <div className="relative aspect-[4/3] min-h-56 overflow-hidden bg-[#101c38] sm:min-h-64">
          {activeUrl && activeItem.type === "video" ? (
            <video
              aria-label={activeItem.altText ?? moment.title}
              className="h-full w-full object-contain"
              controls
              key={activeItem.id}
              playsInline
              preload="metadata"
              src={activeUrl}
            />
          ) : activeUrl ? (
            <button
              aria-label={`Enlarge ${moment.title}`}
              className="h-full w-full"
              onClick={() => setViewerOpen(true)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={activeItem.altText ?? moment.title} className="h-full w-full object-cover" src={activeUrl} />
            </button>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm font-bold text-white/75">
              This {activeItem.type} is not available right now.
            </div>
          )}

          <span className="absolute left-4 top-4 rounded-full bg-pet-ink/85 px-3 py-1 text-xs font-bold text-white">
            {countLabel}
          </span>
          <button
            aria-label="Open media viewer"
            className="absolute right-4 top-4 min-h-10 rounded-full bg-white/92 px-4 text-xs font-black text-pet-ink shadow-md transition hover:bg-white"
            onClick={() => setViewerOpen(true)}
            type="button"
          >
            Enlarge
          </button>

          {media.length > 1 ? (
            <>
              <button
                aria-label="Previous media"
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/92 text-2xl font-black text-pet-ink shadow-lg transition hover:bg-white"
                onClick={() => selectRelative(-1)}
                type="button"
              >
                <span aria-hidden="true">&#8249;</span>
              </button>
              <button
                aria-label="Next media"
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/92 text-2xl font-black text-pet-ink shadow-lg transition hover:bg-white"
                onClick={() => selectRelative(1)}
                type="button"
              >
                <span aria-hidden="true">&#8250;</span>
              </button>
            </>
          ) : null}
        </div>

        {media.length > 1 ? (
          <div aria-label="Moment media" className="flex gap-2 overflow-x-auto p-3">
            {media.map((item, index) => {
              const itemUrl = resolveMediaUrl(item.url);
              const selected = index === activeIndex;

              return (
                <button
                  aria-label={`View ${item.type} ${index + 1} of ${media.length}`}
                  aria-pressed={selected}
                  className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-pet-ink transition ${
                    selected ? "border-pet-coral ring-2 ring-pet-coral/20" : "border-white/80 opacity-75 hover:opacity-100"
                  }`}
                  key={item.id}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                >
                  {itemUrl && item.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-full w-full object-cover" src={itemUrl} />
                  ) : (
                    <span className="grid h-full place-items-center bg-[#152343] text-white">
                      <span className="grid place-items-center gap-1 text-[0.6rem] font-bold uppercase">
                        <Icon className="h-4 w-4" name={item.type === "video" ? "record" : "heart"} />
                        {item.type}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <MediaViewer
        activeIndex={activeIndex}
        caption={moment.caption}
        date={moment.date}
        items={media}
        onActiveIndexChange={setActiveIndex}
        onClose={() => setViewerOpen(false)}
        open={viewerOpen}
        title={moment.title}
      />
    </>
  );
}
