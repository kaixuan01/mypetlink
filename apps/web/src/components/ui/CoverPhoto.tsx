import type { CSSProperties } from "react";

export const DEFAULT_COVER_POSITION = 50;

type CoverPhotoProps = {
  alt: string;
  src?: string;
  positionX?: number | null;
  positionY?: number | null;
  className?: string;
  fallbackStyle?: CSSProperties;
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

/**
 * Shared full-width pet cover. Its 160px mobile / 208px desktop height keeps
 * the banner substantial while object-fit: cover prevents stretching or gaps.
 */
export function CoverPhoto({
  alt,
  src,
  positionX,
  positionY,
  className = "",
  fallbackStyle,
}: CoverPhotoProps) {
  return (
    <div
      className={`relative h-40 w-full overflow-hidden sm:h-52 ${className}`}
      style={src ? undefined : fallbackStyle}
    >
      {src ? (
        // Public media and local data-URL previews are intentionally unoptimized.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          style={{ objectPosition: getCoverObjectPosition(positionX, positionY) }}
        />
      ) : null}
    </div>
  );
}
