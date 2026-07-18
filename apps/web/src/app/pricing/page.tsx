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
  phase1Positioning,
  smartTagAddOns,
  smartTagAddOnsStatus,
} from "@/lib/planLimits";
import { marketingRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.pricing,
  title: "MyPetLink Pricing | Free Pet Profiles and Smart Tag Add-ons",
  description:
    "Start with a free MyPetLink pet profile, then compare optional one-time QR and QR + NFC smart tag add-ons in Malaysian Ringgit.",
});

const freePlan = mockPlans.find((plan) => plan.id === "plan_free") ?? mockPlans[0];
const premium = mockPlans.find((plan) => plan.id === "plan_premium") ?? mockPlans[1];

const smartTagFeatures = [
  "One-time purchase",
  "Works with the free pet profile",
  "Opens the pet-level Safety Profile",
  "QR scan and NFC tap open the same Safety Profile",
  "Finder-friendly contact page",
  "An add-on for your free pet profile",
];

const gpsFeatures = [
  "Tracker hardware",
  "Live GPS location",
  "Safe zone alerts",
  "Battery reminders",
];

export default function PricingPage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            eyebrow="Pricing"
            title="Free profile now. Optional smart tags when you want them."
            description={phase1Positioning}
          />
          <div className="grid gap-5 lg:grid-cols-4">
            <PricingCard
              badge="Available now"
              title="Free Profile"
              price={freePlan.price}
              note={freePlan.description}
              features={freePlan.features}
              action={<CreateProfileCTA fullWidth>Start Free Profile</CreateProfileCTA>}
            />

            <PricingCard
              badge={smartTagAddOnsStatus.status}
              title="Smart Tag Add-ons"
              price={`From ${smartTagAddOnsStatus.startingPrice}`}
              note="Optional physical tags that connect to your pet's Safety Profile."
              features={smartTagFeatures}
              action={
                <CTAButton disabled fullWidth variant="secondary">
                  Coming Soon
                </CTAButton>
              }
            >
              <div className="mt-5 grid gap-3">
                {smartTagAddOns.map((tag) => (
                  <div
                    className="rounded-[1rem] bg-pet-cream p-3"
                    key={tag.name}
                  >
                    <p className="text-sm font-black text-pet-ink">
                      {tag.name}
                    </p>
                    <p className="mt-1 text-sm font-bold text-pet-teal">
                      {tag.price} {tag.billingNote}
                    </p>
                  </div>
                ))}
              </div>
            </PricingCard>

            <PricingCard
              badge="Coming Soon"
              title={premium.name}
              price="Coming Soon"
              note={premium.description}
              features={premium.features}
              action={
                <CTAButton disabled fullWidth variant="secondary">
                  Coming Soon
                </CTAButton>
              }
            />

            <PricingCard
              badge={gpsSafety.status}
              title={gpsSafety.name}
              price="Coming Later"
              note={gpsSafety.description}
              features={gpsFeatures}
              action={
                <CTAButton disabled fullWidth variant="secondary">
                  Coming Later
                </CTAButton>
              }
            />
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function PricingCard({
  badge,
  title,
  price,
  note,
  features,
  action,
  children,
}: {
  badge: string;
  title: string;
  price: string;
  note: string;
  features: readonly string[];
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="brand-card flex min-w-0 flex-col rounded-[2rem] p-6">
      <Badge
        tone={
          badge.includes("Coming")
            ? "teal"
            : badge.includes("Optional")
              ? "warm"
              : "mint"
        }
      >
        {badge}
      </Badge>
      <h2 className="mt-4 text-2xl font-black text-pet-ink">{title}</h2>
      <p className="mt-4 text-3xl font-black text-pet-teal">{price}</p>
      <p className="mt-4 text-sm leading-6 text-pet-muted">{note}</p>
      {children}
      <ul className="mt-6 flex-1 space-y-3 text-sm text-pet-muted">
        {features.map((feature) => (
          <li className="flex gap-2" key={feature}>
            <Icon
              name="paw"
              className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral"
            />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-6">{action}</div>
    </article>
  );
}
