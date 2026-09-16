"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { OwnerSocialProfileView } from "@/components/social/OwnerSocialProfileView";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import {
  getOwnerSocialProfile,
  type OwnerSocialProfile,
} from "@/services/ownerSocialService";

type Phase = "loading" | "setup" | "inactive" | "ready" | "error";

/**
 * The owner's own Community profile.
 *
 * "My profile" used to send the owner to `/u/{handle}` — the public page, which
 * renders in a bare shell with no sidebar and no bottom bar. Opening your own
 * profile therefore looked like leaving the product to view yourself from
 * outside, and pressing Edit brought the Community chrome back, which made the
 * whole sequence feel like three different apps.
 *
 * This route stays inside Community. What it shows depends on how far the owner
 * has got, and the two incomplete cases are the ones that used to be handled
 * worst: somebody with no handle was pushed into Owner Settings in the other
 * half of the app, and somebody whose profile was switched off was shown a page
 * that implied it was live.
 *
 * The profile itself is not re-implemented. Once there is a handle, the same
 * component the public route uses renders it, told that the reader is its
 * owner.
 */
export function CommunityMyProfileView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [profile, setProfile] = useState<OwnerSocialProfile | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await getOwnerSocialProfile();
        if (!active) return;

        const loaded = response.data;
        setProfile(loaded);

        const handle = loaded.handle.trim();
        setPhase(!handle ? "setup" : loaded.isSocialEnabled ? "ready" : "inactive");
      } catch (error) {
        if (!active) return;
        setPhase(isApiClientError(error) ? "error" : "error");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (phase === "loading") {
    return (
      <div
        aria-busy="true"
        className="mx-auto w-full max-w-4xl py-10"
        data-testid="my-profile-loading"
      >
        <span className="sr-only">Loading your profile</span>
        <div className="h-24 w-24 animate-pulse rounded-full bg-pet-apricot" />
        <div className="mt-4 h-6 w-48 animate-pulse rounded-full bg-pet-apricot" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded-full bg-pet-border" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto w-full max-w-lg py-16 text-center">
        <h1 className="text-xl font-black text-pet-ink">
          We couldn&rsquo;t load your profile
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-pet-muted">
          Please try again in a moment.
        </p>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div
        className="mx-auto w-full max-w-lg py-12 text-center"
        data-testid="my-profile-setup"
      >
        <LinkoMascot
          alt="Linko the MyPetLink mascot waving"
          className="mx-auto"
          pose="wave"
          size={96}
        />
        <h1 className="mt-4 text-2xl font-black text-pet-ink">
          Set up your Community profile
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-pet-muted">
          Choose how other pet owners see you, and which of your pets you share.
        </p>
        <div className="mt-6">
          <CTAButton href={ownerRoutes.socialProfileEdit}>Set up profile</CTAButton>
        </div>
      </div>
    );
  }

  if (phase === "inactive") {
    return (
      <div
        className="mx-auto w-full max-w-lg py-12 text-center"
        data-testid="my-profile-inactive"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-pet-border bg-pet-cream">
          <Icon aria-hidden="true" className="h-7 w-7 text-pet-muted" name="shield" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-pet-ink">
          Your Community profile is currently off
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-pet-muted">
          Nobody can find <span className="font-black">@{profile?.handle}</span> while
          it is off. Your pets, their Safety Profiles and your Smart Tags are
          unaffected.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <CTAButton href={ownerRoutes.socialProfileEdit}>
            Turn on my profile
          </CTAButton>
          <Link
            className="inline-flex min-h-12 items-center rounded-full border border-pet-border bg-white px-5 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            href={ownerRoutes.socialProfileEdit}
          >
            Edit profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <OwnerSocialProfileView
      audience="own"
      handle={(profile?.handle ?? "").toLowerCase()}
    />
  );
}
