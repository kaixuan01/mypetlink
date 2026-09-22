"use client";

import { useState } from "react";

import Link from "next/link";
import {
  CreateProfileCTA,
  PRIMARY_CTA_LABEL,
} from "@/components/marketing/CreateProfileCTA";
import { PublicProductMenu } from "@/components/layouts/PublicProductMenu";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { socialEnabled } from "@/lib/features";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";
import { marketingRoutes, socialRoutes } from "@/lib/routes";

/**
 * Public site navigation, shared by the header and the mobile drawer.
 *
 * Grouped rather than flat. The top level had grown to five product pages
 * sitting beside each other with no hierarchy, and Community — now a pillar of
 * the product rather than an inner-portal feature — had nowhere to go that did
 * not make it six. Three of those five are one idea, "what MyPetLink is", so
 * they sit under Product and the top level carries what a visitor actually
 * chooses between: learn about it, look around it, what it costs, where to get
 * one.
 *
 * Community is the entry to Explore and the only Social item here. Search is
 * deliberately absent: it is a tool inside Explore, and a navbar link to an
 * empty search box is a dead end.
 *
 * Where to Buy appears only once the shared public-commerce model reports a
 * supported purchase channel.
 */

export type PublicNavItem = { href: string; label: string };

/**
 * What MyPetLink is, one level down.
 *
 * Every entry is a product page. Safety Profile used to point at the sample
 * anchor because no page of its own existed yet, which meant a product label
 * quietly delivered a demo — the sample is now where that page's closing CTA
 * goes, which is the one place linking to it is honest.
 */
export const productNav: PublicNavItem[] = [
  { href: marketingRoutes.petProfile, label: "Pet Profiles" },
  { href: marketingRoutes.safetyProfile, label: "Safety Profile" },
  { href: marketingRoutes.smartPetTags, label: "Smart Tags" },
  { href: marketingRoutes.howItWorks, label: "How It Works" },
];

/**
 * The top level, beside the Product group.
 *
 * Community appears only when Social is switched on. The flag exists to decide
 * "whether the product puts Social in front of people", and a permanent link on
 * the public header is the most in-front-of-people place there is — a build
 * with Social off would otherwise advertise a Community it also says is not
 * open yet. The routes stay reachable either way; this is only about promotion.
 */
export const primaryPublicNav: PublicNavItem[] = [
  ...(socialEnabled
    ? [{ href: socialRoutes.explore, label: "Community" }]
    : []),
  { href: marketingRoutes.pricing, label: "Pricing" },
  ...(publicCommerceAvailability.showWhereToBuy
    ? [{ href: marketingRoutes.whereToBuy, label: "Where to Buy" }]
    : []),
];

// Re-exported so the many callers that already import it from here keep
// working; it is defined beside the action it names.
export { PRIMARY_CTA_LABEL };

export function DesktopPublicNav({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-7">
      <nav aria-label="Main" className="flex items-center gap-6">
        <PublicProductMenu />
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
  const [productOpen, setProductOpen] = useState(false);

  return (
    <div
      className="mt-4 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] lg:hidden"
      id="public-mobile-nav"
    >
      <nav aria-label="Main menu" className="grid">
        {/*
          Collapsed by default, which makes the drawer shorter than the flat
          list it replaces even though the site gained a destination: four
          product pages become one row until somebody asks for them.
        */}
        <button
          aria-controls="public-mobile-product"
          aria-expanded={productOpen}
          className="flex min-h-12 items-center justify-between gap-2 rounded-xl px-3 text-[0.9375rem] font-bold text-pet-ink transition hover:bg-white hover:text-pet-teal"
          data-testid="mobile-product-toggle"
          onClick={() => setProductOpen((current) => !current)}
          type="button"
        >
          Product
          <Icon
            aria-hidden="true"
            className={`h-4 w-4 text-pet-muted transition ${productOpen ? "rotate-180" : ""}`}
            name="chevron"
          />
        </button>

        {productOpen ? (
          <div className="grid pb-1 pl-3" data-testid="mobile-product-group" id="public-mobile-product">
            {productNav.map((item) => (
              <Link
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-pet-muted transition hover:bg-white hover:text-pet-teal"
                href={item.href}
                key={item.href}
                onClick={onNavigate}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}

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
