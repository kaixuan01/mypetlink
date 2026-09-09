"use client";

import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { ShareCenter } from "@/components/share/ShareCenter";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import {
  toOwnerPetShareTarget,
  toPublicProfileShareTarget,
} from "@/lib/petShareTarget";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import { getPublicProfileShareVersion } from "@/lib/publicProfileSocial";
import { ownerRoutes } from "@/lib/routes";
import type { Pet, PublicPetProfile } from "@/types";

const visitorShareTriggerClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0]";

type OwnerControlProps = {
  profile: PublicPetProfile;
  theme: PetProfileTheme;
  /**
   * Resolved once by the page (see useOwnedPublicProfilePet) so ownership is
   * requested a single time and shared by every owner-aware section.
   */
  ownedPet: Pet | null;
};

export function PublicProfileOwnerControls({
  profile,
  theme,
  ownedPet,
}: OwnerControlProps) {
  // Public share remains available while ownership is checked. The management
  // card is intentionally absent until an owned pet has been verified.
  if (!ownedPet) {
    return (
      <div className="mt-6 flex justify-center">
        <ShareProfileLink
          path={profile.publicProfilePath}
          shareVersion={getPublicProfileShareVersion(profile)}
          compact
          analyticsSurface="public_profile"
          theme={theme}
          // A visitor gets the same Share experience an owner does, styled to
          // this pet's profile theme. It offers only the profile already on
          // screen — never anything that belongs to the owner.
          shareAction={
            <ShareCenter
              analyticsSurface="public_profile"
              target={toPublicProfileShareTarget(profile)}
              triggerAriaLabel={`Share ${profile.name}`}
              triggerClassName={visitorShareTriggerClass}
              triggerLabel={
                <>
                  <Icon name="heart" className="h-4 w-4" />
                  Share profile
                </>
              }
              triggerStyle={{
                background: theme.colors.buttonBackground,
                borderColor: theme.colors.buttonBackground,
                color: theme.colors.buttonText,
              }}
            />
          }
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
        {/* One share entry point, matching the Owner Portal. */}
        <ShareCenter
          analyticsSurface="public_profile"
          target={toOwnerPetShareTarget(ownedPet)}
          triggerAriaLabel={`Share ${profile.name}`}
        />
        <CTAButton
          href={
            ownedPet.lifecycleStatus === "Memorial"
              ? ownerRoutes.petEdit(ownedPet.id, { tab: "public" })
              : ownerRoutes.petEdit(ownedPet.id)
          }
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
  ownedPet,
}: Pick<OwnerControlProps, "ownedPet">) {
  if (!ownedPet) {
    return null;
  }

  return (
    <CTAButton
      className="mt-6"
      href={ownerRoutes.petEdit(ownedPet.id, { tab: "public" })}
      icon="settings"
      variant="secondary"
    >
      Edit Memorial Settings
    </CTAButton>
  );
}
