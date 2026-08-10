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
  smartTagAddOns,
  smartTagAddOnsStatus,
} from "@/lib/planLimits";
import { marketingRoutes, ownerRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.pricing,
  title: "MyPetLink Pricing | Free Pet Profiles and Smart Tags",
  description:
    "Compare the free MyPetLink profile, upcoming Premium features, and optional one-time QR and QR + NFC smart tags in Malaysian Ringgit.",
});

const freePlan = mockPlans.find((plan) => plan.id === "plan_free") ?? mockPlans[0];
const premium = mockPlans.find((plan) => plan.id === "plan_premium") ?? mockPlans[1];
const qrTag = smartTagAddOns.find((tag) => tag.type === "qr") ?? smartTagAddOns[0];
const nfcTag = smartTagAddOns.find((tag) => tag.type === "nfc") ?? smartTagAddOns[1];

const qrTagFeatures = [
  "QR scan",
  "Opens the pet's MyPetLink profile",
  "Finder-friendly contact page",
  "Works with a Free profile",
  "No subscription required",
];

const nfcTagFeatures = [
  "QR scan",
  "NFC tap",
  "Opens the same MyPetLink profile",
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
            description="A MyPetLink profile is free. Premium profile features are coming soon, and physical Smart Tags are separate one-time purchases."
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
              description="Optional physical tags that connect directly to your pet's MyPetLink profile."
              title="Smart Tags"
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <PricingCard
                  badge={smartTagAddOnsStatus.status}
                  title={qrTag.name}
                  price={qrTag.price}
                  billingLabel="One-time purchase"
                  note="Simple QR access for anyone with a smartphone camera."
                  features={qrTagFeatures}
                  action={<SmartTagAction status={smartTagAddOnsStatus.status} />}
                />
                <PricingCard
                  badge={smartTagAddOnsStatus.status}
                  title={nfcTag.name}
                  price={nfcTag.price}
                  billingLabel="One-time purchase"
                  note="Two easy ways to open the same profile: scan the QR code or tap with NFC."
                  features={nfcTagFeatures}
                  action={<SmartTagAction status={smartTagAddOnsStatus.status} />}
                />
              </div>
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
