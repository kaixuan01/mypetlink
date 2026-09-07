import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { mockPlans } from "@/data/mockPlans";
import {
  gpsSafety,
  smartTagAddOn,
  smartTagAddOnsStatus,
} from "@/lib/planLimits";
import { marketingRoutes, ownerRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.pricing,
  title: "MyPetLink Pricing | Free Profile & Smart Tag",
  description:
    `Create your pet profile for free. Add the QR + NFC Smart Tag for ${smartTagAddOn.price} — a one-time purchase.`,
  socialImage: {
    path: "/pricing-og.png",
    alt: "MyPetLink pricing: free profile and the one-time QR plus NFC smart tag",
  },
});

const freePlan = mockPlans.find((plan) => plan.id === "plan_free") ?? mockPlans[0];
const premium = mockPlans.find((plan) => plan.id === "plan_premium") ?? mockPlans[1];
const smartTagFeatures = [
  "QR scan",
  "NFC tap",
  "Both open the same MyPetLink profile",
  "Finder-friendly contact page",
  "Works with a Free profile",
  "No subscription required",
];

const gpsFeatures = ["Live GPS location", "Safe-zone alerts", "Battery reminders"];

export default function PricingPage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            eyebrow="Pricing"
            title="Start free. Add only what your pet needs."
            description="A MyPetLink profile is free. Premium profile features are coming soon, and the physical Smart Tag is a separate one-time purchase."
          />

          <div className="mt-12 space-y-14 lg:space-y-16">
            <PricingSection
              description="Create your pet profile for free. Upgrade later when you want more care and family features."
              title="MyPetLink Profile"
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <PricingCard
                  badge="Available now"
                  title="Free"
                  price={freePlan.price}
                  note={freePlan.description}
                  features={freePlan.features}
                  action={<CreateProfileCTA fullWidth>Start Free Profile</CreateProfileCTA>}
                />
                <PricingCard
                  badge="Coming Soon"
                  title="Premium"
                  price="Coming Soon"
                  note={premium.description}
                  features={premium.features}
                  action={
                    <CTAButton disabled fullWidth variant="secondary">
                      Coming Soon
                    </CTAButton>
                  }
                />
              </div>
            </PricingSection>

            <PricingSection
              description="Our optional physical tag, connecting directly to your pet's MyPetLink profile."
              title="Smart Tag"
            >
              <SmartTagCard />
            </PricingSection>

            <PricingSection
              description="Future products that are not part of today's profile or Smart Tag offering."
              title="Coming Later"
            >
              <article className="rounded-[1.75rem] border border-pet-border bg-white/65 p-6 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <Badge tone="teal">{gpsSafety.status}</Badge>
                    <h3 className="mt-4 text-2xl font-black text-pet-ink">{gpsSafety.name}</h3>
                    <p className="mt-3 text-sm leading-6 text-pet-muted">
                      Live location and safe-zone features are planned for a future MyPetLink product.
                    </p>
                  </div>
                  <FeatureList className="sm:min-w-56" features={gpsFeatures} />
                </div>
              </article>
            </PricingSection>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

// The Smart Tag is a single product, so it gets a full-width card rather than
// one half of a comparison grid.
function SmartTagCard() {
  return (
    <article className="brand-card flex min-w-0 flex-col gap-6 rounded-[2rem] p-6 sm:p-7 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
      <div className="min-w-0 max-w-2xl">
        <Badge tone="teal">{smartTagAddOnsStatus.status}</Badge>
        <h3 className="mt-4 text-2xl font-black text-pet-ink">{smartTagAddOn.name}</h3>
        <p className="mt-4 text-3xl font-black text-pet-teal">{smartTagAddOn.price}</p>
        <p className="mt-1 text-xs font-black uppercase tracking-wide text-pet-coral">
          One-time purchase
        </p>
        <p className="mt-4 text-sm leading-6 text-pet-muted">
          Two easy ways to open the same profile: scan the QR code or tap with NFC.
        </p>
        <div className="mt-6 max-w-xs">
          <SmartTagAction status={smartTagAddOnsStatus.status} />
        </div>
      </div>
      <FeatureList className="lg:min-w-72" features={smartTagFeatures} />
    </article>
  );
}

function PricingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-black text-pet-ink sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-pet-muted sm:text-base">{description}</p>
      </div>
      {children}
    </section>
  );
}

function PricingCard({
  badge,
  title,
  price,
  billingLabel,
  note,
  features,
  action,
}: {
  badge: string;
  title: string;
  price: string;
  billingLabel?: string;
  note: string;
  features: readonly string[];
  action: ReactNode;
}) {
  return (
    <article className="brand-card flex min-w-0 flex-col rounded-[2rem] p-6 sm:p-7">
      <Badge tone={badge.includes("Coming") ? "teal" : "mint"}>{badge}</Badge>
      <h3 className="mt-4 text-2xl font-black text-pet-ink">{title}</h3>
      <p className="mt-4 text-3xl font-black text-pet-teal">{price}</p>
      {billingLabel ? (
        <p className="mt-1 text-xs font-black uppercase tracking-wide text-pet-coral">
          {billingLabel}
        </p>
      ) : null}
      <p className="mt-4 text-sm leading-6 text-pet-muted">{note}</p>
      <FeatureList className="mt-6 flex-1" features={features} />
      <div className="mt-6">{action}</div>
    </article>
  );
}

function FeatureList({
  features,
  className = "",
}: {
  features: readonly string[];
  className?: string;
}) {
  return (
    <ul className={`${className} space-y-3 text-sm text-pet-muted`}>
      {features.map((feature) => (
        <li className="flex gap-2" key={feature}>
          <Icon name="paw" className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function SmartTagAction({ status }: { status: string }) {
  if (status === "Available now") {
    return (
      <CTAButton fullWidth href={ownerRoutes.tagOrder()}>
        Order a Smart Tag
      </CTAButton>
    );
  }

  return (
    <CTAButton disabled fullWidth variant="secondary">
      {status}
    </CTAButton>
  );
}
