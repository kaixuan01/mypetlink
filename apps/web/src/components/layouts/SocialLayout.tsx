"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PublicBrandLink } from "@/components/brand/PublicBrandLink";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { ownerLoginPath } from "@/lib/authRedirect";
import { socialEnabled } from "@/lib/features";
import { ownerRoutes, socialRoutes } from "@/lib/routes";
import { useSignedIn } from "@/lib/useSignedIn";

/**
 * The shell for social pages that anybody may open.
 *
 * Explore and search are public — somebody who followed a shared link should be
 * able to look around before deciding whether to join — but they are also part
 * of the product a signed-in owner is already using. So the page is the same
 * and the chrome is not: an owner gets the portal shell with the social bar, a
 * visitor gets a brand header and a way in, and no owner route is ever
 * mentioned to somebody who cannot use it.
 *
 * Those two links are Community entry points, so they follow `socialEnabled`
 * like every other one. This header is rendered above a pet's Share Profile —
 * the single most-shared page in the product — and it was offering Explore and
 * Search to every visitor in a build where the landing page, the public nav,
 * the owner sidebar and Owner Settings had all correctly hidden Community, and
 * where /community/profile says the community is not open yet. A Share Profile
 * is not a Community surface; it works, and is shared, with Community off.
 *
 * While the signed-in check is still settling, neither shell is shown. A third,
 * neutral header holds the same space with nothing but the brand in it: showing
 * a visitor owner navigation for a frame would be a bug, and flashing "Sign in"
 * at somebody who is already signed in is the kind of small wrongness that
 * makes an app feel unfinished. The PAGE itself renders immediately in every
 * case — the content is public, so there is nothing to wait for.
 */
export function SocialLayout({
  children,
  bleed = false,
}: {
  children: React.ReactNode;
  /**
   * The page paints its own canvas edge to edge, so the shell supplies chrome
   * and no container. A pet's public profile themes its whole background; boxed
   * inside a padded column that gradient stops at the padding and the page reads
   * as a card sitting on someone else's background.
   */
  bleed?: boolean;
}) {
  const signedIn = useSignedIn();

  if (signedIn === true) {
    return <AppLayout bleed={bleed}>{children}</AppLayout>;
  }

  return (
    <div className={bleed ? "min-h-screen" : "min-h-screen bg-pet-cream"}>
      {signedIn === false ? <PublicSocialHeader /> : <NeutralSocialHeader />}
      {bleed ? (
        children
      ) : (
        <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-2 sm:px-6">
          {children}
        </main>
      )}
    </div>
  );
}

/**
 * The header that commits to nothing.
 *
 * Same height and same brand position as the public one, so the swap when the
 * session resolves moves nothing on the page. It carries no sign-in prompt and
 * no owner route, because at this instant we do not know which would be wrong.
 */
function NeutralSocialHeader() {
  return (
    <header
      className="border-b border-pet-border bg-white/92 backdrop-blur"
      data-testid="social-header-resolving"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <PublicBrandLink compact />
        <span aria-hidden="true" className="h-10 w-28 rounded-full bg-pet-cream" />
      </div>
    </header>
  );
}

/**
 * What a visitor sees above a social page: who this is, a way in, and a way to
 * start. Deliberately not the owner header — there is nothing in the portal a
 * visitor can use, and offering it would be an invitation to a login wall.
 */
function PublicSocialHeader() {
  const pathname = usePathname();

  return (
    <header
      className="border-b border-pet-border bg-white/92 backdrop-blur"
      data-testid="social-header-public"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <PublicBrandLink compact priority />

        <div className="flex items-center gap-1 sm:gap-2">
          {/*
            Somewhere to go. A shared profile that offers only "sign in" is a
            microsite: the visitor either joins or leaves. Explore and Search are
            public, so they cost nothing to offer and they are the two places a
            visitor who liked what they saw would actually want next.

            Both are Community, so both wait for the flag. With Community off a
            visitor still gets the brand, a way in and a way to start — the page
            they came for is unaffected, because a Share Profile has never been
            a Community surface.
          */}
          {socialEnabled ? (
            <>
              <Link
                className="hidden min-h-10 items-center rounded-full px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream min-[380px]:inline-flex"
                data-testid="social-header-explore"
                href={socialRoutes.explore}
              >
                Explore
              </Link>
              <Link
                aria-label="Search MyPetLink"
                className="hidden min-h-10 items-center rounded-full px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream sm:inline-flex"
                data-testid="social-header-search"
                href={socialRoutes.search}
              >
                Search
              </Link>
            </>
          ) : null}
          <Link
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            // The current page, so signing in returns the visitor to what they
            // were reading. The fallback is the owner dashboard rather than
            // Explore: a post-login destination must exist in both flag states.
            href={ownerLoginPath(pathname || ownerRoutes.dashboard)}
          >
            Sign in
          </Link>
          <CreateProfileCTA />
        </div>
      </div>
    </header>
  );
}
