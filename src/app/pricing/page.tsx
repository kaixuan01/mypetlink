import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { mockPlans } from "@/data/mockPlans";
import { ownerRoutes, samplePet } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Pricing",
};

const tagAddOns = [
  {
    name: "MyPetLink QR Pet Tag",
    price: "RM19.90",
    href: ownerRoutes.petTagOrder(samplePet.id, { type: "qr" }),
    description: "Easy to scan and opens your pet's QR Safety Page.",
    features: [
      "One-time purchase",
      "Opens the pet-level QR Safety Page",
      "Can be ordered on Free or Premium",
      "Replacement tags available anytime",
    ],
  },
  {
    name: "MyPetLink QR + NFC Smart Tag",
    price: "RM39.90",
    href: ownerRoutes.petTagOrder(samplePet.id, { type: "nfc" }),
    description: "Scan the QR or tap the NFC tag to open the pet's QR Safety Page.",
    features: [
      "One-time purchase",
      "QR scan and NFC tap on one tag",
      "Opens the same QR Safety Page",
      "Great for collars, carriers, and replacements",
    ],
    highlighted: true,
  },
];

export default function PricingPage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            eyebrow="Pricing"
            title="Start free, add more care when you need it"
            description="Free keeps basic safety contact available. Premium adds multi-pet care, reminders, lost mode, scan history, documents, family access, and richer memories."
          />
          <div className="mb-6 rounded-[1.5rem] border border-pet-border bg-white/80 p-5 text-sm font-semibold leading-6 text-pet-muted">
            Basic finder contact stays free. Physical QR and QR + NFC tags are
            optional one-time add-ons and can be ordered after a pet profile is
            created.
          </div>
          <div className="mb-6">
            <h2 className="text-2xl font-black text-pet-ink">
              Free Plan and Premium Plan
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {mockPlans.map((plan) => (
              <article
                className={`brand-card flex rounded-[2rem] p-6 ${
                  plan.highlighted
                    ? "ring-2 ring-pet-coral"
                    : ""
                } flex-col`}
                key={plan.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={plan.comingSoon ? "soft" : "warm"}>
                    {plan.tier}
                  </Badge>
                  {plan.badge ? (
                    <Badge tone={plan.comingSoon ? "teal" : "mint"}>
                      {plan.badge}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="mt-3 text-2xl font-black text-pet-ink">
                  {plan.name}
                </h2>
                <p className="mt-4 text-3xl font-black text-pet-teal">
                  {plan.price}
                </p>
                <p className="mt-1 text-sm font-bold text-pet-muted">
                  {plan.billingNote}
                </p>
                <p className="mt-4 text-sm leading-6 text-pet-muted">
                  {plan.description}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-pet-muted">
                  {plan.features.map((feature) => (
                    <li className="flex gap-2" key={feature}>
                      <Icon
                        name="paw"
                        className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CTAButton
                  href="/login"
                  fullWidth
                  className="mt-6"
                  variant={plan.id === "plan_free" ? "primary" : "coral"}
                >
                  {plan.id === "plan_free"
                    ? "Start Free Profile"
                    : "Preview Premium"}
                </CTAButton>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <PageHeader
            eyebrow="Smart Tag Add-ons"
            title="Physical tags are one-time purchases"
            description="You can buy a MyPetLink QR Pet Tag or MyPetLink QR + NFC Smart Tag on Free or Premium after creating a pet profile."
          />
          <div className="grid gap-5 md:grid-cols-2">
            {tagAddOns.map((tag) => (
              <article
                className={`brand-soft-card flex flex-col rounded-[2rem] p-6 ${
                  tag.highlighted
                    ? "ring-2 ring-pet-teal"
                    : ""
                }`}
                key={tag.name}
              >
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={tag.highlighted ? "mint" : "warm"}>
                    One-time add-on
                  </Badge>
                  <Icon name="tag" className="h-6 w-6 text-pet-teal" />
                </div>
                <h2 className="mt-4 text-2xl font-black text-pet-ink">
                  {tag.name}
                </h2>
                <p className="mt-3 text-3xl font-black text-pet-teal">
                  {tag.price}
                </p>
                <p className="mt-4 text-sm leading-6 text-pet-muted">
                  {tag.description}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-pet-muted">
                  {tag.features.map((feature) => (
                    <li className="flex gap-2" key={feature}>
                      <Icon
                        name="paw"
                        className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <CTAButton href={tag.href} fullWidth className="mt-6">
                  Preview Tag Options
                </CTAButton>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="brand-blue-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <article className="brand-card rounded-[2rem] p-6">
            <Badge tone="teal">Coming Later</Badge>
            <h2 className="mt-4 text-3xl font-black text-pet-ink">
              GPS Safety - Coming Later
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-pet-muted">
              GPS Safety is coming later for pet owners who want extra
              protection with tracker support, lost mode, last known location,
              safe zone alerts, and battery reminders.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-5">
              {[
                "Tracker support",
                "Lost mode",
                "Last known location",
                "Safe zone alerts",
                "Battery reminders",
              ].map((feature) => (
                <div
                  className="rounded-[1.25rem] bg-[#e8f3ff] p-4 text-sm font-bold text-pet-ink"
                  key={feature}
                >
                  {feature}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
