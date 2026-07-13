"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMediaDuration } from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";

type MomentVideoPlayerProps = {
  alt: string;
  className?: string;
  compact?: boolean;
  durationSeconds?: number;
  mode?: "preview" | "viewer";
  posterUrl?: string;
  url?: string;
};

type ActivePlayback = {
  id: symbol;
  pause: () => void;
};

let activePlayback: ActivePlayback | null = null;
const pauseFeedbackDurationMs = 500;

export function pauseActiveMomentVideo() {
  const current = activePlayback;
  activePlayback = null;
  current?.pause();
}

export function MomentVideoPlayer({
  alt,
  className = "",
  compact = false,
  durationSeconds,
  mode = "preview",
  posterUrl,
  url,
}: MomentVideoPlayerProps) {
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [measuredDuration, setMeasuredDuration] = useState<number>();
  const [paused, setPaused] = useState(true);
  const [pauseFeedbackVisible, setPauseFeedbackVisible] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const instanceIdRef = useRef(Symbol("moment-video"));
  const pauseFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = resolveMediaUrl(url);
  const resolvedPoster = resolveMediaUrl(posterUrl);
  const duration = formatMediaDuration(durationSeconds ?? measuredDuration);
  const viewerMode = mode === "viewer";

  const clearActivePlayback = useCallback(() => {
    if (activePlayback?.id === instanceIdRef.current) {
      activePlayback = null;
    }
  }, []);

  const clearPauseFeedbackTimer = useCallback(() => {
    if (pauseFeedbackTimeoutRef.current) {
      clearTimeout(pauseFeedbackTimeoutRef.current);
      pauseFeedbackTimeoutRef.current = null;
    }
  }, []);

  const hidePauseFeedback = useCallback(() => {
    clearPauseFeedbackTimer();
    setPauseFeedbackVisible(false);
  }, [clearPauseFeedbackTimer]);

  const showPauseFeedback = useCallback(() => {
    clearPauseFeedbackTimer();
    setPauseFeedbackVisible(true);
    pauseFeedbackTimeoutRef.current = setTimeout(() => {
      pauseFeedbackTimeoutRef.current = null;
      setPauseFeedbackVisible(false);
    }, pauseFeedbackDurationMs);
  }, [clearPauseFeedbackTimer]);

  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    setPaused(true);
    hidePauseFeedback();
    clearActivePlayback();
  }, [clearActivePlayback, hidePauseFeedback]);

  async function playVideo() {
    const video = videoRef.current;
    if (!video) return;

    if (ended) {
      video.currentTime = 0;
      setEnded(false);
    }

    if (activePlayback?.id !== instanceIdRef.current) {
      pauseActiveMomentVideo();
    }
    activePlayback = {
      id: instanceIdRef.current,
      pause: pauseVideo,
    };

    try {
      const playResult = video.play();
      setPaused(false);
      showPauseFeedback();
      if (playResult) await playResult;
    } catch {
      setPaused(true);
      hidePauseFeedback();
      clearActivePlayback();
    }
  }

  function togglePlayback() {
    if (paused || ended) {
      void playVideo();
    } else {
      pauseVideo();
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) pauseVideo();
      },
      { threshold: 0.15 }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [pauseVideo]);

  useEffect(
    () => () => {
      videoRef.current?.pause();
      clearPauseFeedbackTimer();
      clearActivePlayback();
    },
    [clearActivePlayback, clearPauseFeedbackTimer]
  );

  if (!videoUrl || unavailable) {
    return (
      <div
        aria-label={`${alt} video unavailable`}
        className={`grid h-full w-full place-items-center bg-gradient-to-br from-[#17284d] via-[#081329] to-[#14334e] px-6 text-center text-sm font-bold text-white/75 ${className}`}
        role="img"
      >
        This video is not available right now.
      </div>
    );
  }

  const playbackLabel = ended
    ? `Replay ${alt}`
    : paused
      ? `Play ${alt}`
      : `Pause ${alt}`;
  const showPlayIcon = paused || ended;
  const centerOverlayVisible = showPlayIcon || pauseFeedbackVisible;

  return (
    <div
      className={`group/video relative h-full w-full overflow-hidden bg-gradient-to-br from-[#15284f] via-[#081329] to-[#14334e] ${className}`}
      onClick={(event) => event.stopPropagation()}
      ref={rootRef}
    >
      <video
        aria-label={alt}
        className="h-full w-full cursor-pointer object-contain"
        controls={viewerMode}
        key={videoUrl}
        muted={!viewerMode}
        onCanPlay={() => setLoading(false)}
        onClick={(event) => event.stopPropagation()}
        onEnded={() => {
          setEnded(true);
          setPaused(true);
          hidePauseFeedback();
          clearActivePlayback();
        }}
        onError={() => setUnavailable(true)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setMeasuredDuration(video.duration);
          setLoading(false);

          if (!resolvedPoster && video.duration > 0) {
            try {
              video.currentTime = Math.min(0.01, video.duration);
            } catch {
              // Some browsers do not allow seeking until more data is ready.
            }
          }
        }}
        onPause={() => {
          setPaused(true);
          hidePauseFeedback();
          clearActivePlayback();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPlay={() => {
          setEnded(false);
          setPaused(false);
          showPauseFeedback();
        }}
        onWaiting={() => setLoading(true)}
        playsInline
        poster={resolvedPoster || undefined}
        preload="metadata"
        ref={videoRef}
        src={videoUrl}
      />

      <button
        aria-label={playbackLabel}
        aria-pressed={!showPlayIcon}
        className={`absolute inset-x-0 top-0 z-10 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white ${
          viewerMode ? "bottom-12" : "bottom-0"
        }`}
        data-video-surface="true"
        onClick={(event) => {
          event.stopPropagation();
          togglePlayback();
        }}
        type="button"
      />

      {loading ? (
        <span
          aria-live="polite"
          className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white/85 backdrop-blur-sm"
        >
          Loading video…
        </span>
      ) : null}

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/65 text-white shadow-2xl backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          compact ? "h-12 w-12" : viewerMode ? "h-20 w-20" : "h-16 w-16"
        } ${
          centerOverlayVisible
            ? "scale-100 opacity-100"
            : "scale-90 opacity-0"
        }`}
        data-state={
          showPlayIcon ? "play" : pauseFeedbackVisible ? "pause" : "hidden"
        }
        data-testid="moment-video-center-overlay"
      >
        {showPlayIcon ? (
          <svg
            aria-hidden="true"
            className={`${compact ? "h-5 w-5" : viewerMode ? "h-9 w-9" : "h-7 w-7"} ml-1 fill-current`}
            viewBox="0 0 24 24"
          >
            <path d="M8 5.4v13.2L18.5 12 8 5.4Z" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className={compact ? "h-5 w-5 fill-current" : viewerMode ? "h-9 w-9 fill-current" : "h-7 w-7 fill-current"}
            viewBox="0 0 24 24"
          >
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        )}
      </span>

      {!viewerMode && duration ? (
        <span
          className={`pointer-events-none absolute rounded-md bg-black/70 font-black tabular-nums text-white ${
            compact
              ? "bottom-2 right-2 px-1.5 py-0.5 text-[0.6rem]"
              : "bottom-3 right-3 px-2 py-1 text-[0.7rem]"
          }`}
        >
          {duration}
        </span>
      ) : null}
    </div>
  );
}
