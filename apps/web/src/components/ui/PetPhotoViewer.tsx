"use client";

import { useState } from "react";
import { MediaViewer } from "@/components/ui/MediaViewer";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { Pet, PublicPetProfile } from "@/types";

type PetPhotoViewerProps = {
  pet: Pick<Pet | PublicPetProfile, "name" | "photoInitial" | "photoTone" | "species"> & {
    photoUrl?: string;
  };
  size?: "lg" | "xl";
};

export function PetPhotoViewer({ pet, size = "xl" }: PetPhotoViewerProps) {
  const [open, setOpen] = useState(false);
  const photoUrl = resolveMediaUrl(pet.photoUrl);

  if (!photoUrl) return <PetAvatar pet={pet} size={size} />;

  return (
    <>
      <button
        aria-label={`Enlarge ${pet.name}'s photo`}
        className="rounded-[2rem] transition hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pet-teal"
        onClick={() => setOpen(true)}
        type="button"
      >
        <PetAvatar pet={pet} size={size} />
      </button>
      <MediaViewer
        activeIndex={0}
        items={[{ id: `${pet.name}-profile-photo`, type: "image", url: photoUrl, altText: `${pet.name}'s profile photo` }]}
        onActiveIndexChange={() => undefined}
        onClose={() => setOpen(false)}
        open={open}
        title={`${pet.name}'s photo`}
      />
    </>
  );
}
