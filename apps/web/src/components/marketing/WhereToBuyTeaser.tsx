import { BrandDecoration } from "@/components/brand/BrandDecoration";
import { CTAButton } from "@/components/ui/CTAButton";
import { smartTagOrderingEnabled } from "@/lib/features";
import { marketingRoutes } from "@/lib/routes";

/**
 * A short pointer to the buying guide.
 *
 * It renders nothing while Smart Tag ordering is closed. Sending a visitor to
 * a "where to buy" page when nothing can be bought anywhere is a dead end, and
 * the landing page already says the tag is coming soon in the section above.
 * When ordering opens, this appears on its own — as does the header entry.
 */
export function WhereToBuyTeaser() {
  if (!smartTagOrderingEnabled) {
    return null;
  }

  return (
    <section className="relative overflow-hidden bg-pet-cream">
      <BrandDecoration
        className="absolute right-[10%] top-8 hidden lg:block"
        opacity={0.2}
        shape="paw"
        size={34}
      />
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-5 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-pet-teal sm:text-sm">
            Where to buy
          </p>
          <h2 className="mt-2 text-xl font-black leading-tight text-pet-ink sm:text-2xl">
            Find MyPetLink near you.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-pet-muted">
            Order online, or pick one up from an authorised partner.
          </p>
        </div>
        <CTAButton
          className="w-full sm:w-auto"
          href={marketingRoutes.whereToBuy}
          icon="tag"
          variant="secondary"
        >
          Find a Retail Partner
        </CTAButton>
      </div>
    </section>
  );
}
