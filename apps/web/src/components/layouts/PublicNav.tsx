"use client";

import Link from "next/link";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { CTAButton } from "@/components/ui/CTAButton";
import { smartTagOrderingEnabled } from "@/lib/features";
import { marketingRoutes } from "@/lib/routes";

/**
 * Public site navigation, shared by the header and the mobile drawer.
 *
 * The list is deliberately short. Home is gone because the logo already goes
 * there, and Sample Profile is gone because it belongs beside the profile it
 * demonstrates rather than beside four product pages — it now lives as a
 * contextual action on the landing page and in the drawer's secondary tier.
 *
 * Where to Buy appears only once a tag can actually be bought. Linking to a
 * buying guide while ordering is closed would send visitors to a dead end, so
 * the entry follows the same flag the ordering flow uses.
 */

export type PublicNavItem = { href: string; label: string };

export const primaryPublicNav: PublicNavItem[] = [
  { href: marketingRoutes.howItWorks, label: "How It Works" },
  { href: marketingRoutes.petProfile, label: "Pet Profiles" },
  { href: marketingRoutes.smartPetTags, label: "Smart Tags" },
  { href: marketingRoutes.pricing, label: "Pricing" },
  ...(smartTagOrderingEnabled
    ? [{ href: marketingRoutes.whereToBuy, label: "Where to Buy" }]
    : []),
];

/** One label for one action, everywhere on the public site. */
export const PRIMARY_CTA_LABEL = "Get Started";

export function DesktopPublicNav({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-7">
      <nav aria-label="Main" className="flex items-center gap-6">
        {primaryPublicNav.map((item) => (
          <Link
            className="text-sm font-bold text-pet-muted transition hover:text-pet-teal"
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {loggedIn ? (
        <CTAButton href="/dashboard" icon="home" variant="primary">
          Open Dashboard
        </CTAButton>
      ) : (
        <div className="flex items-center gap-3">
          <Link
            className="text-sm font-bold text-pet-ink transition hover:text-pet-teal"
            href="/login"
          >
            Log in
          </Link>
          <CreateProfileCTA icon="paw" variant="primary">
            {PRIMARY_CTA_LABEL}
          </CreateProfileCTA>
        </div>
      )}
    </div>
  );
}

/**
 * The drawer separates three tiers so it reads as a short menu rather than a
 * long list of equals: where to go, quieter secondary actions, then the one
 * thing we want a visitor to do.
 */
export function MobilePublicNav({
  loggedIn,
  onNavigate,
}: {
  loggedIn: boolean;
  onNavigate: () => void;
}) {
  return (
    <div
      className="mt-4 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] lg:hidden"
      id="public-mobile-nav"
    >
      <nav aria-label="Main menu" className="grid">
        {primaryPublicNav.map((item) => (
          <Link
            className="flex min-h-12 items-center rounded-xl px-3 text-[0.9375rem] font-bold text-pet-ink transition hover:bg-white hover:text-pet-teal"
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-3 grid border-t border-pet-border pt-3">
        <Link
          className="flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-pet-muted transition hover:bg-white hover:text-pet-teal"
          href={marketingRoutes.samplePublicProfile}
          onClick={onNavigate}
        >
          View Sample Profile
        </Link>
        {loggedIn ? null : (
          <Link
            className="flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-pet-muted transition hover:bg-white hover:text-pet-teal"
            href="/login"
            onClick={onNavigate}
          >
            Log in
          </Link>
        )}
      </div>

      <div className="mt-3 border-t border-pet-border pt-4">
        {loggedIn ? (
          <CTAButton fullWidth href="/dashboard" icon="home" variant="primary">
            Open Dashboard
          </CTAButton>
        ) : (
          <CreateProfileCTA fullWidth icon="paw" variant="primary">
            {PRIMARY_CTA_LABEL}
          </CreateProfileCTA>
        )}
      </div>
    </div>
  );
}
