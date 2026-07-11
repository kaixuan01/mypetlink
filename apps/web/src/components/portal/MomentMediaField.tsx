"use client";

import { useRef, useState } from "react";
import { VideoPoster } from "@/components/moments/VideoPoster";
import { Icon } from "@/components/ui/Icon";
import { readImageAsDataUrl } from "@/lib/imageUpload";
import {
  createMediaId,
  makeCoverMedia,
  moveMedia,
  reindexMedia,
  sortedMedia,
} from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { MAX_MOMENT_MEDIA, type MomentMedia } from "@/types";

type MomentMediaFieldProps = {
  items: MomentMedia[];
  coverMediaId?: string;
  onChange: (items: MomentMedia[], coverMediaId?: string) => void;
  max?: number;
};

export function MomentMediaField({
  items,
  onChange,
  max = MAX_MOMENT_MEDIA,
}: MomentMediaFieldProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = sortedMedia(items);
  const activeCover = ordered[0]?.id;
  const isFull = ordered.length >= max;

  function commit(next: MomentMedia[]) {
    const reindexed = reindexMedia(next);
    onChange(reindexed, reindexed[0]?.id);
  }

  async function handleAddPhotos(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    setError(null);
    setIsReading(true);

    try {
      const room = Math.max(0, max - ordered.length);
      const files = Array.from(fileList).slice(0, room);
      const added: MomentMedia[] = [];

      for (const file of files) {
        const url = await readImageAsDataUrl(file);
        added.push({
          id: createMediaId(),
          type: "image",
          url,
          sourceFile: file,
          sortOrder: 0,
        });
      }

      commit([...ordered, ...added]);
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "Could not add that photo. Please try another file."
      );
    } finally {
      setIsReading(false);

      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
    }
  }

  function handleAddVideo(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    setError(null);
    const file = fileList[0];
    const next: MomentMedia = {
      id: createMediaId(),
      type: "video",
      url: URL.createObjectURL(file),
      altText: file.name,
      sourceFile: file,
      sortOrder: 0,
    };

    commit([...ordered, next]);

    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  }

  function handleRemove(id: string) {
    const removed = ordered.find((item) => item.id === id);
    if (removed?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(removed.url);
    }
    commit(ordered.filter((item) => item.id !== id));
  }

  function handleSetCover(id: string) {
    const next = makeCoverMedia(ordered, id);
    onChange(next, next[0]?.id);
  }

  function handleMove(id: string, offset: -1 | 1) {
    const next = moveMedia(ordered, id, offset);
    onChange(next, next[0]?.id);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-pet-ink">Media</span>
        <span className="text-xs font-semibold text-pet-muted">
          {ordered.length}/{max} media added
        </span>
      </div>
      <p className="text-xs leading-5 text-pet-muted">
        Add photos or videos that tell this memory. The first item will be used
        as the cover.
      </p>

      {ordered.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ordered.map((item, index) => {
            const isCover = item.id === activeCover;
            const mediaUrl = resolveMediaUrl(item.url);

            return (
              <div
                className="group overflow-hidden rounded-2xl border border-pet-border bg-white"
                key={item.id}
              >
                <div className="relative aspect-square overflow-hidden bg-pet-cream">
                  {item.type === "image" && mediaUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={item.altText ?? "Moment media"}
                        className="h-full w-full object-cover"
                        src={mediaUrl}
                      />
                    </>
                  ) : item.type === "video" ? (
                    <VideoPoster
                      alt={item.altText ?? "Moment video"}
                      durationSeconds={item.durationSeconds}
                      posterUrl={item.posterUrl}
                      url={item.url}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-pet-apricot/50 text-pet-coral">
                      <Icon name="heart" className="h-6 w-6" />
                    </div>
                  )}

                  {isCover ? (
                    <span className="absolute left-2 top-2 rounded-full bg-pet-ink/85 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
                      Cover
                    </span>
                  ) : null}

                  <button
                    aria-label={`Remove ${item.type} ${index + 1}`}
                    className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-xl text-pet-ink shadow-sm transition hover:bg-white"
                    onClick={() => handleRemove(item.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className="leading-none">&times;</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1 border-t border-pet-border p-1.5">
                  <button
                    aria-label={`Move ${item.type} ${index + 1} earlier`}
                    className="min-h-11 rounded-xl text-lg font-black text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => handleMove(item.id, -1)}
                    type="button"
                  >
                    <span aria-hidden="true">&#8592;</span>
                  </button>
                  <button
                    aria-label={`Move ${item.type} ${index + 1} later`}
                    className="min-h-11 rounded-xl text-lg font-black text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={index === ordered.length - 1}
                    onClick={() => handleMove(item.id, 1)}
                    type="button"
                  >
                    <span aria-hidden="true">&#8594;</span>
                  </button>
                  {!isCover ? (
                    <button
                      className="col-span-2 min-h-11 rounded-xl bg-pet-cream px-2 text-xs font-bold text-pet-ink transition hover:bg-pet-apricot"
                      onClick={() => handleSetCover(item.id)}
                      type="button"
                    >
                      Make first &amp; set as cover
                    </button>
                  ) : (
                    <span className="col-span-2 grid min-h-11 place-items-center text-xs font-bold text-pet-muted">
                      First in carousel
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isFull || isReading}
          onClick={() => photoInputRef.current?.click()}
          type="button"
        >
          <Icon name="plus" className="h-4 w-4" />
          {isReading ? "Adding photo..." : "Add photo"}
        </button>
        <button
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isFull || isReading}
          onClick={() => videoInputRef.current?.click()}
          type="button"
        >
          <Icon name="record" className="h-4 w-4" />
          Add video
        </button>
      </div>

      {isFull ? (
        <p className="text-xs font-semibold text-pet-muted">
          You&apos;ve reached the {max} media limit for this memory.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-bold text-[#a63c2e]">{error}</p>
      ) : null}

      <input
        accept="image/*"
        className="hidden"
        multiple
        onChange={(event) => handleAddPhotos(event.target.files)}
        ref={photoInputRef}
        type="file"
      />
      <input
        accept="video/*"
        className="hidden"
        onChange={(event) => handleAddVideo(event.target.files)}
        ref={videoInputRef}
        type="file"
      />
    </div>
  );
}
