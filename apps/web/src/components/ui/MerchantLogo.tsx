"use client";

import { useState } from "react";

export function MerchantLogo({ name, src }: { name: string; src?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-pet-border bg-pet-cream sm:h-[72px] sm:w-[72px]">
    {src && failedUrl !== src ? (
      // Public raster logo; explicit dimensions reserve space before it loads.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={`${name} logo`} width={72} height={72}
        className="h-full w-full object-contain p-1.5" loading="lazy" decoding="async"
        onError={() => setFailedUrl(src)} />
    ) : <span role="img" aria-label={`${name} logo placeholder`} className="text-xl font-bold text-pet-teal sm:text-2xl">
      {Array.from(name.trim())[0]?.toLocaleUpperCase() || "M"}
    </span>}
  </div>;
}
