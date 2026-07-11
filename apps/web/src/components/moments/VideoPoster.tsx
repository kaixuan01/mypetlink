"use client";

import { useState, type Ref } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatMediaDuration } from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";

type VideoPosterProps = {
  alt: string;
  className?: string;
  compact?: boolean;
  durationSeconds?: number;
  posterUrl?: string;
  url?: string;
  videoRef?: Ref<HTMLVideoElement>;
};

export function VideoPoster({
  alt,
  className = "",
  compact = false,
  durationSeconds,
  posterUrl,
  url,
  videoRef,
}: VideoPosterProps) {
  const [measuredDuration, setMeasuredDuration] = useState<number>();
  const [unavailable, setUnavailable] = useState(false);
  const videoUrl = resolveMediaUrl(url);
  const resolvedPoster = resolveMediaUrl(posterUrl);
  const duration = formatMediaDuration(durationSeconds ?? measuredDuration);

  if (!videoUrl || unavailable) {
    return (
      <div
        aria-label={`${alt} video preview unavailable`}
        className={`grid h-full w-full place-items-center bg-gradient-to-br from-[#17284d] to-[#081329] text-white/80 ${className}`}
        role="img"
      >
        <span className={`grid place-items-center rounded-full bg-white/10 ${compact ? "h-9 w-9" : "h-14 w-14"}`}>
          <Icon className={compact ? "h-4 w-4" : "h-6 w-6"} name="record" />
        </span>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-[#15284f] via-[#081329] to-[#14334e] ${className}`}>
      <video
        aria-label={alt}
        className="pointer-events-none h-full w-full object-contain"
        muted
        onError={() => setUnavailable(true)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setMeasuredDuration(video.duration);

          if (!resolvedPoster && video.duration > 0) {
            try {
              video.currentTime = Math.min(0.01, video.duration);
            } catch {
              // Some browsers do not allow seeking until more data is ready.
            }
          }
        }}
        playsInline
        poster={resolvedPoster || undefined}
        preload="metadata"
        ref={videoRef}
        src={videoUrl}
        tabIndex={-1}
      />
      <span
        className="pointer-events-none absolute inset-0 grid place-items-center bg-black/5"
        aria-label="Play video"
        role="img"
      >
        <span className={`grid place-items-center rounded-full bg-black/60 text-white shadow-xl backdrop-blur-sm ${compact ? "h-9 w-9" : "h-14 w-14"}`}>
          <svg aria-hidden="true" className={`ml-0.5 fill-current ${compact ? "h-4 w-4" : "h-6 w-6"}`} viewBox="0 0 24 24">
            <path d="M8 5.4v13.2L18.5 12 8 5.4Z" />
          </svg>
        </span>
      </span>
      {duration ? (
        <span className={`pointer-events-none absolute rounded-md bg-black/70 font-black tabular-nums text-white ${compact ? "bottom-1 right-1 px-1 py-0.5 text-[0.55rem]" : "bottom-3 right-3 px-2 py-1 text-[0.7rem]"}`}>
          {duration}
        </span>
      ) : null}
    </div>
  );
}
