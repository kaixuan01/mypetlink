"use client";

import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import type { PetProfileTheme } from "@/lib/petProfileThemes";

type PublicProfileCreateCTAProps = {
  theme: PetProfileTheme;
};

/**
 * Closing invitation shown to a visitor at the end of a shared pet profile.
 *
 * The pet stays the hero: this sits after the profile content and before the
 * public-information notice, is visually secondary, and offers exactly one
 * action. It is deliberately absent for the pet's own owner, and for memorial
 * and archived profiles.
 */
export function PublicProfileCreateCTA({ theme }: PublicProfileCreateCTAProps) {
  return (
    // Deliberately not a named landmark: the pet's own content owns this page's
    // structure, and the heading below is enough to find and skip this block.
    <section
      className="mt-8 rounded-[1.5rem] border border-pet-border bg-white/80 p-5 text-center"
      data-public-profile-create-cta=""
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <h2
        className="text-base font-black leading-6 text-pet-ink sm:text-lg"
        style={{ color: theme.colors.text }}
      >
        Create a profile for your pet
      </h2>
      <p
        className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-pet-muted"
        style={{ color: theme.colors.mutedText }}
      >
        Keep their profile, moments and care details together with MyPetLink.
      </p>
      <CreateProfileCTA
        analyticsSurface="public_profile"
        className="mt-4"
        variant="secondary"
      >
        Create your pet&apos;s profile
      </CreateProfileCTA>
    </section>
  );
}
