"use client";

import { useState } from "react";
import { PetAvatar } from "@/components/ui/PetAvatar";

export function SamplePetPhoto({
  name,
  species,
  src,
  size = "lg",
}: {
  name: string;
  species: string;
  src: string | null;
  size?: "lg" | "xl";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usableSrc = src && src !== failedSrc ? src : null;

  if (usableSrc) {
    const sizeClass = size === "xl" ? "h-36 w-36" : "h-24 w-24";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${name}'s profile`}
        className={`${sizeClass} shrink-0 rounded-[2rem] border-4 border-white object-cover shadow-lg shadow-[#0d1b3d]/10`}
        onError={() => setFailedSrc(usableSrc)}
        src={usableSrc}
      />
    );
  }

  return (
    <div aria-label={`${name} profile photo unavailable`} role="img">
      <PetAvatar
        pet={{
          photoInitial: name.slice(0, 1).toUpperCase(),
          photoTone: "sky",
          species: species === "Cat" ? "Cat" : "Dog",
        }}
        size={size}
      />
    </div>
  );
}
