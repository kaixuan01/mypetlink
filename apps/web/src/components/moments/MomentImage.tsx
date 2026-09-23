"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

type MomentImageProps = {
  alt: string;
  className: string;
  decoding?: "async" | "auto" | "sync";
  fallbackClassName?: string;
  loading?: "eager" | "lazy";
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  url: string;
};

/**
 * A Moment photo with a stable, readable failure state.
 *
 * The surrounding carousel owns the frame and its aspect ratio. This component
 * only replaces the browser's broken-image icon when the selected object cannot
 * be read. Failure is remembered per URL, so moving to another carousel item
 * never inherits the previous item's state.
 */
export function MomentImage({
  alt,
  className,
  decoding,
  fallbackClassName = "h-full w-full",
  loading,
  onClick,
  url,
}: MomentImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <span
        aria-label={`${alt}. Photo unavailable.`}
        className={`grid place-items-center bg-gradient-to-br from-[#17284d] via-[#081329] to-[#14334e] px-6 text-center text-white/80 ${fallbackClassName}`}
        data-testid="moment-carousel-image-unavailable"
        role="img"
      >
        <span>
          <Icon
            aria-hidden="true"
            className="mx-auto h-7 w-7 text-white/55"
            name="paw"
          />
          <span className="mt-2 block text-sm font-bold">
            This photo is not available right now.
          </span>
        </span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      decoding={decoding}
      loading={loading}
      onClick={onClick}
      onError={() => setFailedUrl(url)}
      src={url}
    />
  );
}
