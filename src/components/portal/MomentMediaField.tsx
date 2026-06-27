"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { readImageAsDataUrl } from "@/lib/imageUpload";
import { createMediaId, sortedMedia } from "@/lib/momentMedia";
import { MAX_MOMENT_MEDIA, type MomentMedia } from "@/types";

type MomentMediaFieldProps = {
  items: MomentMedia[];
  coverMediaId?: string;
  onChange: (items: MomentMedia[], coverMediaId?: string) => void;
  max?: number;
};

export function MomentMediaField({
  items,
  coverMediaId,
  onChange,
  max = MAX_MOMENT_MEDIA,
}: MomentMediaFieldProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = sortedMedia(items);
  const activeCover =
    ordered.find((item) => item.id === coverMediaId)?.id ?? ordered[0]?.id;
  const isFull = ordered.length >= max;

  function reindex(next: MomentMedia[]): MomentMedia[] {
    return next.map((item, index) => ({ ...item, sortOrder: index }));
  }

  function commit(next: MomentMedia[], cover?: string) {
    const reindexed = reindex(next);
    const nextCover =
      cover && reindexed.some((item) => item.id === cover)
        ? cover
        : reindexed[0]?.id;
    onChange(reindexed, nextCover);
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
          sortOrder: 0,
        });
      }

      commit([...ordered, ...added], activeCover ?? added[0]?.id);
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
      url: "",
      altText: file.name,
      sortOrder: 0,
    };

    commit([...ordered, next], activeCover);

    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  }

  function handleRemove(id: string) {
    commit(
      ordered.filter((item) => item.id !== id),
      activeCover === id ? undefined : activeCover
    );
  }

  function handleSetCover(id: string) {
    onChange(ordered, id);
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
          {ordered.map((item) => {
            const isCover = item.id === activeCover;

            return (
              <div
                className="group relative aspect-square overflow-hidden rounded-2xl border border-pet-border bg-pet-cream"
                key={item.id}
              >
                {item.type === "image" && item.url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={item.altText ?? "Moment media"}
                      className="h-full w-full object-cover"
                      src={item.url}
                    />
                  </>
                ) : (
                  <div className="grid h-full w-full place-items-center bg-pet-apricot/50 text-pet-coral">
                    <div className="grid place-items-center gap-1 px-2 text-center">
                      <Icon name="record" className="h-6 w-6" />
                      <span className="text-[0.65rem] font-bold uppercase tracking-wide">
                        {item.type === "video" ? "Video" : "Photo"}
                      </span>
                    </div>
                  </div>
                )}

                {isCover ? (
                  <span className="absolute left-2 top-2 rounded-full bg-pet-ink/85 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
                    Cover
                  </span>
                ) : null}

                <button
                  aria-label="Remove media"
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-pet-ink shadow-sm transition hover:bg-white"
                  onClick={() => handleRemove(item.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    &times;
                  </span>
                </button>

                {!isCover ? (
                  <button
                    className="absolute inset-x-2 bottom-2 rounded-full bg-white/90 px-2 py-1 text-[0.65rem] font-bold text-pet-ink opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => handleSetCover(item.id)}
                    type="button"
                  >
                    Set as cover
                  </button>
                ) : null}
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
