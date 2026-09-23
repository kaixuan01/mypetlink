import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

type PublicBrandLinkProps = {
  /** Tighter sizing for a header that also carries a menu button. */
  compact?: boolean;
  /** Use the existing brand mark until a full navigation row has room. */
  responsiveMark?: boolean;
  priority?: boolean;
};

/**
 * The MyPetLink brand, at public-site scale.
 *
 * `BrandLogo` renders an `Image` at its intrinsic 540x140 unless a caller
 * constrains it, and the public Community header was the one place that did
 * not — so anonymous Explore opened with a wordmark wider than the page
 * heading, reading as a hero rather than as navigation. Every other surface in
 * the app had its own constraint written inline, which is why the two public
 * headers could drift apart without anyone changing either of them.
 *
 * The sizing lives here now, so the landing site and public Community are the
 * same brand at the same scale by construction rather than by coincidence.
 * What they still differ on is what sits beside it — marketing keeps its
 * product menu, Community offers Explore, Search and a way in — because that is
 * a difference in what the two pages are for, not in what MyPetLink looks like.
 */
export function PublicBrandLink({
  compact = false,
  responsiveMark = false,
  priority = false,
}: PublicBrandLinkProps) {
  return (
    <Link
      aria-label="MyPetLink home"
      className="flex min-w-0 items-center"
      href="/"
    >
      {responsiveMark ? (
        <>
          <BrandLogo
            className="h-10 w-10 shrink-0 sm:h-11 sm:w-11 md:hidden"
            markOnly
            priority={priority}
          />
          <BrandLogo
            className="hidden h-12 w-auto max-w-[205px] object-contain object-left md:block lg:h-14 lg:max-w-[235px]"
            priority={priority}
          />
        </>
      ) : (
        <BrandLogo
          className={publicBrandLogoClass(compact)}
          priority={priority}
        />
      )}
    </Link>
  );
}

/**
 * Exported so a header that cannot use the link wrapper — a placeholder that
 * must not be clickable while a session resolves — still gets the same scale.
 */
export function publicBrandLogoClass(compact = false) {
  return `w-auto ${
    compact
      ? "h-10 max-w-[calc(100vw-5.5rem)] object-contain object-left min-[361px]:h-11 sm:h-12 lg:h-14 lg:max-w-[235px]"
      : "h-14 max-w-[235px]"
  }`;
}
