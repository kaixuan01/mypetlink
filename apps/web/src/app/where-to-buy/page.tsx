import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { PRIMARY_CTA_LABEL } from "@/components/layouts/PublicNav";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { smartTagAddOn, smartTagAddOnsStatus } from "@/lib/planLimits";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";
import { marketingRoutes, ownerRoutes } from "@/lib/routes";
import { createMarketingMetadata, directAccessRobots } from "@/lib/seo";

const marketingMetadata = createMarketingMetadata({
  path: marketingRoutes.whereToBuy,
  title: "Where to Buy | MyPetLink Smart Tags Malaysia",
  description:
    "How to get a MyPetLink QR + NFC Smart Tag in Malaysia, and where the tag is available.",
});

export const metadata: Metadata = publicCommerceAvailability.showWhereToBuy
  ? marketingMetadata
  : { ...marketingMetadata, robots: directAccessRobots };

/**
 * Where to Buy.
 *
 * Two channels are planned: buying online from MyPetLink, and picking one up
 * from an authorised retail partner. Only the first is a real channel today,
 * and it is not open yet — so this page states availability honestly instead
 * of listing places that do not exist.
 *
 * The retail section renders only when the shared public-commerce model has
 * partners to show. There is no supported partner projection yet, so it stays
 * empty by construction; a future projection can supply that collection
 * without changing this page's visibility rule.
 */

const onlineBenefits: { icon: IconName; label: string }[] = [
  { icon: "shield", label: "Linked to your pet's Safety Profile before it ships" },
  { icon: "qr", label: "Scan and tap both open the same page" },
  { icon: "record", label: "One-time payment, no subscription" },
];

export default function WhereToBuyPage() {
  const { onlineOrderingAvailable, publicRetailPartners } =
    publicCommerceAvailability;

  return (
    <PublicLayout>
      <section className="bg-pet-cream">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <PageHeader
            eyebrow="Where to buy"
            title="Getting a MyPetLink Smart Tag."
            description={`The ${smartTagAddOn.shortName} is an optional ${smartTagAddOn.billingNote} add-on for your pet's collar.`}
          />

          <div className="grid items-start gap-4 md:grid-cols-2">
            <article className="brand-card rounded-[1.5rem] p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f3ff] text-pet-teal">
                  <Icon aria-hidden="true" className="h-5 w-5" name="tag" />
                </span>
                <h2 className="text-lg font-black text-pet-ink">
                  Buy online from MyPetLink
                </h2>
                {onlineOrderingAvailable ? null : (
                  <Badge tone="teal">{smartTagAddOnsStatus.status}</Badge>
                )}
              </div>

              <p className="mt-1 text-2xl font-black text-pet-ink">
                {smartTagAddOn.price}
                <span className="ml-2 text-sm font-bold text-pet-muted">
                  {smartTagAddOn.billingNote}
                </span>
              </p>

              <ul className="mt-4 grid gap-2 text-sm text-pet-muted">
                {onlineBenefits.map((benefit) => (
                  <li className="flex gap-2" key={benefit.label}>
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-pet-teal"
                      name={benefit.icon}
                    />
                    {benefit.label}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {onlineOrderingAvailable ? (
                  <CTAButton href={ownerRoutes.tagOrder()} icon="tag" variant="primary">
                    Get a Smart Tag
                  </CTAButton>
                ) : (
                  <p className="text-sm font-semibold leading-6 text-pet-muted">
                    Ordering is not open yet. Your pet&apos;s free profile and
                    Safety Profile already work without a physical tag.
                  </p>
                )}
              </div>
            </article>

            <article className="brand-card rounded-[1.5rem] p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fdeada] text-pet-coral">
                  <Icon aria-hidden="true" className="h-5 w-5" name="pets" />
                </span>
                <h2 className="text-lg font-black text-pet-ink">
                  Authorised retail partners
                </h2>
              </div>

              {publicRetailPartners.length > 0 ? (
                <ul className="mt-4 grid gap-3">
                  {publicRetailPartners.map((partner) => (
                    <li
                      className="border-b border-pet-border pb-3 last:border-b-0 last:pb-0"
                      key={`${partner.name}-${partner.area}`}
                    >
                      <p className="text-sm font-black text-pet-ink">
                        {partner.name}
                        {partner.branch ? ` · ${partner.branch}` : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-pet-muted">
                        {partner.area}, {partner.state}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-pet-muted">
                  We are not in pet shops yet. When authorised partners carry
                  MyPetLink Smart Tags, you will be able to find them here by
                  state and area.
                </p>
              )}
            </article>
          </div>

          <div className="mt-10 border-t border-pet-border pt-8">
            <h2 className="text-lg font-black text-pet-ink">
              You do not need a tag to start
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
              Create your pet&apos;s profile for free today. A Safety Profile
              and a downloadable QR code are included, and a physical tag can be
              added later.
            </p>
            <div className="mt-5">
              <CreateProfileCTA icon="paw" variant="primary">
                {PRIMARY_CTA_LABEL}
              </CreateProfileCTA>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
