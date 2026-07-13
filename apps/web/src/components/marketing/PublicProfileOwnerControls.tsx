"use client";

import { useEffect, useState } from "react";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import { getPublicProfileShareVersion } from "@/lib/publicProfileSocial";
import { ownerRoutes } from "@/lib/routes";
import { isOwnerAuthenticated } from "@/services/authService";
import { getOwnedPetByPublicCode } from "@/services/petService";
import type { Pet, PublicPetProfile } from "@/types";

type OwnerControlProps = {
  profile: PublicPetProfile;
  theme: PetProfileTheme;
};

function useOwnedPublicProfilePet(publicCode: string) {
  const [resolution, setResolution] = useState<{
    publicCode: string;
    pet: Pet | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    if (!isOwnerAuthenticated()) {
      return () => {
        active = false;
      };
    }

    void getOwnedPetByPublicCode(publicCode)
      .then((response) => {
        if (active) {
          setResolution({ publicCode, pet: response.data });
        }
      })
      .catch(() => {
        if (active) {
          setResolution({ publicCode, pet: null });
        }
      });

    return () => {
      active = false;
    };
  }, [publicCode]);

  return resolution?.publicCode === publicCode ? resolution.pet : null;
}

export function PublicProfileOwnerControls({
  profile,
  theme,
}: OwnerControlProps) {
  const ownedPet = useOwnedPublicProfilePet(profile.publicCode);

  // Public share remains available while ownership is checked. The management
  // card is intentionally absent until an owned pet has been verified.
  if (!ownedPet) {
    return (
      <div className="mt-6 flex justify-center">
        <ShareProfileLink
          path={profile.publicProfilePath}
          petName={profile.name}
          shareVersion={getPublicProfileShareVersion(profile)}
          showShareButton
          compact
          theme={theme}
        />
      </div>
    );
  }

  return (
    <section
      aria-label="Owner profile management"
      className="mt-6 flex flex-col items-center gap-3 rounded-[1.5rem] border border-pet-border bg-white/80 p-4 sm:flex-row sm:justify-between"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <span
        className="inline-flex items-center gap-2 text-xs font-black uppercase text-pet-muted"
        style={{ color: theme.colors.mutedText }}
      >
        <Icon name="heart" className="h-4 w-4" />
        Viewing as public
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ShareProfileLink
          path={profile.publicProfilePath}
          petName={profile.name}
          shareVersion={getPublicProfileShareVersion(profile)}
          compact
          theme={theme}
        />
        <CTAButton
          href={ownerRoutes.petEdit(ownedPet.id)}
          variant="secondary"
          icon="settings"
          className="min-h-10"
        >
          Back to Edit
        </CTAButton>
      </div>
    </section>
  );
}

export function PrivateMemorialOwnerAction({
  profile,
}: Pick<OwnerControlProps, "profile">) {
  const ownedPet = useOwnedPublicProfilePet(profile.publicCode);

  if (!ownedPet) {
    return null;
  }

  return (
    <CTAButton
      className="mt-6"
      href={ownerRoutes.petEdit(ownedPet.id)}
      icon="settings"
      variant="secondary"
    >
      Edit Memorial Settings
    </CTAButton>
  );
}
