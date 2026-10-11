import { BrandDecoration } from "@/components/brand/BrandDecoration";
import { CTAButton } from "@/components/ui/CTAButton";
import { smartTagAddOn } from "@/lib/planLimits";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";
import { marketingRoutes } from "@/lib/routes";

type CommerceAvailability = Pick<
  typeof publicCommerceAvailability,
  "onlineOrderingAvailable" | "hasPublicRetailPartners" | "showWhereToBuy"
>;

/**
 * A short pointer to the buying guide.
 *
 * It renders only while at least one supported public purchase channel exists.
 * The shared availability decision keeps this teaser, navigation, page robots,
 * and sitemap in step without coupling future retail partners to online
 * ordering.
 *
 * What it promises follows the channels that actually exist. It used to say
 * "pick one up from an authorised partner" and offer "Find a Retail Partner"
 * whenever online ordering was open, while the partner list was empty — the
 * page it linked to then had no partner to show. Partner wording now appears
 * only when there is a public partner to find.
 */
export function WhereToBuyTeaser({
  availability = publicCommerceAvailability,
}: {
  availability?: CommerceAvailability;
}) {
  if (!availability.showWhereToBuy) {
    return null;
  }

  const copy = teaserCopy(availability);

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
            {copy.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-pet-muted">
            {copy.description}
          </p>
        </div>
        <CTAButton
          className="w-full sm:w-auto"
          href={marketingRoutes.whereToBuy}
          icon="tag"
          variant="secondary"
        >
          {copy.action}
        </CTAButton>
      </div>
    </section>
  );
}

function teaserCopy({
  onlineOrderingAvailable,
  hasPublicRetailPartners,
}: CommerceAvailability) {
  if (hasPublicRetailPartners) {
    return {
      title: "Find MyPetLink near you.",
      description: onlineOrderingAvailable
        ? "Order online, or pick one up from an authorised partner."
        : "Pick one up from an authorised partner near you.",
      action: "Find a Retail Partner",
    };
  }

  return {
    title: "Order your Smart Tag online.",
    description: `Buy the ${smartTagAddOn.name} directly from MyPetLink for ${smartTagAddOn.price}, ${smartTagAddOn.billingNote}.`,
    action: "See How to Buy",
  };
}
