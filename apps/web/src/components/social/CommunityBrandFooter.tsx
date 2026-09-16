import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * The brand mark at the foot of a public Community page — for visitors only.
 *
 * A signed-in owner already has MyPetLink in the sidebar and in the phone bar.
 * Repeating it at full size under every Community screen made an app page end
 * the way a landing page ends, which is the wrong signal once somebody is
 * inside the product.
 *
 * Somebody who followed a shared link has none of that chrome, so for them this
 * is the one thing saying where they are, and a quiet way in. It stays small
 * and says so plainly rather than becoming a marketing block.
 */
export function CommunityBrandFooter({
  signedIn,
}: {
  /** Null while the session is still resolving — show nothing yet. */
  signedIn: boolean | null;
}) {
  if (signedIn !== false) {
    return null;
  }

  return (
    <footer className="mt-12 flex justify-center" data-testid="community-brand-footer">
      <Link
        className="flex items-center gap-2 text-xs font-bold text-pet-muted opacity-80 transition hover:opacity-100"
        href="/"
      >
        <BrandLogo className="h-6 w-auto" markOnly />
        Powered by MyPetLink
      </Link>
    </footer>
  );
}
