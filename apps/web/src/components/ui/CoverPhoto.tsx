"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  calculateCoverCropMetrics,
  PET_COVER_ASPECT_RATIO,
  type CoverCropMetrics,
} from "@/lib/coverCrop";

export const DEFAULT_COVER_POSITION = 50;

type CoverPhotoProps = {
  alt: string;
  src?: string;
  positionX?: number | null;
  positionY?: number | null;
  className?: string;
  fallbackStyle?: CSSProperties;
  onCropMetricsChange?: (metrics: CoverCropMetrics | null) => void;
};

export function getCoverPosition(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_COVER_POSITION;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function getCoverObjectPosition(
  positionX?: number | null,
  positionY?: number | null
) {
  return `${getCoverPosition(positionX)}% ${getCoverPosition(positionY)}%`;
}

/** Shared public-profile cover with one aspect ratio and crop implementation. */
export function CoverPhoto({
  alt,
  src,
  positionX,
  positionY,
  className = "",
  fallbackStyle,
  onCropMetricsChange,
}: CoverPhotoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const metricsCallbackRef = useRef(onCropMetricsChange);

  useEffect(() => {
    metricsCallbackRef.current = onCropMetricsChange;
  }, [onCropMetricsChange]);

  const measureCrop = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) {
      metricsCallbackRef.current?.(null);
      return;
    }

    const bounds = container.getBoundingClientRect();
    const metrics = calculateCoverCropMetrics({
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      containerWidth: bounds.width,
      containerHeight: bounds.height,
    });
    metricsCallbackRef.current?.(metrics);
  }, []);

  useEffect(() => {
    metricsCallbackRef.current?.(null);
    if (!src) {
      return;
    }

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measureCrop);
      observer.observe(container);
    }
    window.addEventListener("resize", measureCrop);
    measureCrop();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureCrop);
    };
  }, [measureCrop, src]);

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      ref={containerRef}
      style={{
        aspectRatio: PET_COVER_ASPECT_RATIO,
        ...(src ? {} : fallbackStyle),
      }}
    >
      {src ? (
        // Public media and local data-URL previews are intentionally unoptimized.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => metricsCallbackRef.current?.(null)}
          onLoad={measureCrop}
          ref={imageRef}
          src={src}
          style={{ objectPosition: getCoverObjectPosition(positionX, positionY) }}
        />
      ) : null}
    </div>
  );
}
