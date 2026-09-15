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
 * The public shell renders while the signed-in check settles. It is the safe
 * default: showing a visitor owner navigation for one frame would be a bug,
 * whereas an owner seeing the plain header for one frame is not.
 */
export function SocialLayout({ children }: { children: React.ReactNode }) {
  const signedIn = useSignedIn();

  if (signedIn === true) {
    return <AppLayout mobileNav="social">{children}</AppLayout>;
  }

  return (
    <div className="min-h-screen bg-pet-cream">
      <PublicSocialHeader />
      <main className="mx-auto w-full max-w-7xl px-0 pb-16 pt-2 sm:px-6">
        {children}
      </main>
    </div>
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
    <header className="border-b border-pet-border bg-white/92 backdrop-blur">
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
