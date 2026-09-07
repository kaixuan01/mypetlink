import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { smartTagAddOn, smartTagAddOnsStatus } from "@/lib/planLimits";
import { marketingRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.smartPetTags,
  title: "QR + NFC Smart Pet Tag in Malaysia | MyPetLink",
  description:
    "The MyPetLink QR + NFC Smart Tag lets a finder scan or tap to open your pet's Safety Profile. See how it works, the one-time price, and availability.",
});

const included = [
  "Opens the owner-approved Safety Profile",
  "Available in Lightweight and Standard tag variants",
  "A one-time purchase, never a subscription",
  "Re-linkable to your pet if details change",
];

export default function SmartPetTagsPage() {
  return (
    <PublicLayout>
      <section className="brand-blue-section px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Smart pet tag"
            title="One tag. Two ways to open the same Safety Profile."
            description="The MyPetLink QR + NFC Smart Tag is our only physical tag. It is an optional one-time add-on, not a subscription or a GPS tracker."
          />

          <article className="brand-card rounded-[2rem] p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="teal">{smartTagAddOnsStatus.status}</Badge>
              <span className="text-xs font-black uppercase text-pet-muted">
                {smartTagAddOn.billingNote}
              </span>
            </div>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
                  <Icon className="h-6 w-6" name="tag" />
                </span>
                <h2 className="mt-5 text-2xl font-black text-pet-ink sm:text-3xl">
                  {smartTagAddOn.name}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-pet-muted">
                  {smartTagAddOn.description}
                </p>
              </div>
              <p className="text-3xl font-black text-pet-coral sm:shrink-0 sm:text-right">
                {smartTagAddOn.price}
              </p>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <AccessCard
                description="Point any modern phone camera at the QR code on the tag."
                icon="qr"
                title="Scan the QR code"
              />
              <AccessCard
                description="Hold an NFC-capable phone against the tag—no app needed."
                icon="tag"
                title="Tap using NFC"
              />
            </div>
            <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm font-bold leading-6 text-pet-ink">
              Both methods open the same owner-approved Safety Profile.
            </p>

            <ul className="mt-6 grid gap-2 text-sm font-semibold text-pet-ink sm:grid-cols-2">
              {included.map((item) => (
                <li className="flex items-start gap-2" key={item}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-pet-teal" name="paw" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-black text-pet-ink">
            What the tag does, and what it does not do
          </h2>
          <p className="mt-3 text-sm leading-6 text-pet-muted">
            A finder reaches your Safety Profile in whichever way suits their
            phone, and sees only the contact details you chose to share.
          </p>
          <p className="mt-5 rounded-[1.25rem] border border-pet-border p-4 text-sm leading-6 text-pet-muted">
            This tag does not broadcast a pet&apos;s location and is not a GPS
            tracker. GPS Safety is planned separately for a later phase.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <CTAButton href={marketingRoutes.pricing}>View Pricing</CTAButton>
            <CTAButton href={marketingRoutes.howItWorks} variant="secondary">
              How MyPetLink Works
            </CTAButton>
            <CTAButton href={marketingRoutes.petProfile} variant="outline">
              Start With a Free Profile
            </CTAButton>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function AccessCard({
  description,
  icon,
  title,
}: {
  description: string;
  icon: "qr" | "tag";
  title: string;
}) {
  return (
    <div className="rounded-[1.5rem] bg-pet-cream p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-pet-teal">
        <Icon className="h-5 w-5" name={icon} />
      </span>
      <h3 className="mt-3 font-black text-pet-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-pet-muted">{description}</p>
    </div>
  );
}
