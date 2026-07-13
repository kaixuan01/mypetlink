import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { smartTagAddOns, smartTagAddOnsStatus } from "@/lib/planLimits";
import { marketingRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.smartPetTags,
  title: "QR and NFC Smart Pet Tags in Malaysia | MyPetLink",
  description:
    "Compare the MyPetLink QR Pet Tag and QR + NFC Smart Tag, understand how scanning works, and see the real one-time prices and availability.",
});

export default function SmartPetTagsPage() {
  return (
    <PublicLayout>
      <section className="brand-blue-section px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Smart pet tags"
            title="QR scanning or QR + NFC tapping—the same safer destination"
            description="Both MyPetLink tags open your pet&apos;s QR Safety Page. They are optional one-time add-ons, not subscriptions or GPS trackers."
          />
          <div className="grid gap-5 md:grid-cols-2">
            {smartTagAddOns.map((tag) => (
              <article className="brand-card rounded-[2rem] p-6 sm:p-8" key={tag.type}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tag.type === "nfc" ? "teal" : "warm"}>
                    {smartTagAddOnsStatus.status}
                  </Badge>
                  <span className="text-xs font-black uppercase text-pet-muted">
                    {tag.billingNote}
                  </span>
                </div>
                <span className="mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
                  <Icon className="h-6 w-6" name={tag.type === "nfc" ? "tag" : "qr"} />
                </span>
                <h2 className="mt-5 text-2xl font-black text-pet-ink">{tag.name}</h2>
                <p className="mt-2 text-3xl font-black text-pet-coral">{tag.price}</p>
                <p className="mt-3 text-sm leading-6 text-pet-muted">{tag.description}</p>
                <ul className="mt-5 space-y-2 text-sm font-semibold text-pet-ink">
                  <li>• {tag.type === "nfc" ? "Scan the QR code or tap with an NFC-capable phone" : "Scan with a standard phone camera"}</li>
                  <li>• Opens the same owner-approved QR Safety Page</li>
                  <li>• Available in Lightweight and Standard tag variants</li>
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-black text-pet-ink">Which tag should I choose?</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] bg-pet-cream p-5">
              <h3 className="font-black text-pet-ink">Choose QR for simplicity</h3>
              <p className="mt-2 text-sm leading-6 text-pet-muted">A QR code is familiar, visible, and works with modern phone cameras without a special app.</p>
            </div>
            <div className="rounded-[1.5rem] bg-pet-cream p-5">
              <h3 className="font-black text-pet-ink">Choose QR + NFC for another way to open</h3>
              <p className="mt-2 text-sm leading-6 text-pet-muted">NFC adds tap support while retaining the QR code, so a finder has two ways to reach the same page.</p>
            </div>
          </div>
          <p className="mt-5 rounded-[1.25rem] border border-pet-border p-4 text-sm leading-6 text-pet-muted">
            These tags do not broadcast a pet&apos;s location and are not GPS trackers. GPS Safety is planned separately for a later phase.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <CTAButton href={marketingRoutes.pricing}>View Pricing</CTAButton>
            <CTAButton href={marketingRoutes.howItWorks} variant="secondary">How MyPetLink Works</CTAButton>
            <CTAButton href={marketingRoutes.petProfile} variant="outline">Start With a Free Profile</CTAButton>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
