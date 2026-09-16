"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CTAButton } from "@/components/ui/CTAButton";
import { ownerLoginPath } from "@/lib/authRedirect";
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
 * While the signed-in check is still settling, neither shell is shown. A third,
 * neutral header holds the same space with nothing but the brand in it: showing
 * a visitor owner navigation for a frame would be a bug, and flashing "Sign in"
 * at somebody who is already signed in is the kind of small wrongness that
 * makes an app feel unfinished. The PAGE itself renders immediately in every
 * case — the content is public, so there is nothing to wait for.
 */
export function SocialLayout({ children }: { children: React.ReactNode }) {
  const signedIn = useSignedIn();

  if (signedIn === true) {
    return <AppLayout>{children}</AppLayout>;
  }

  return (
    <div className="min-h-screen bg-pet-cream">
      {signedIn === false ? <PublicSocialHeader /> : <NeutralSocialHeader />}
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-2 sm:px-6">
        {children}
      </main>
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
        <Link aria-label="MyPetLink home" className="flex items-center" href="/">
          <BrandLogo />
        </Link>
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
        <Link aria-label="MyPetLink home" className="flex items-center" href="/">
          <BrandLogo />
        </Link>

        <div className="flex items-center gap-2">
          <Link
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            href={ownerLoginPath(pathname || "/explore")}
          >
            Sign in
          </Link>
          <CTAButton href="/pets/new">Get started</CTAButton>
        </div>
      </div>
    </header>
  );
}
