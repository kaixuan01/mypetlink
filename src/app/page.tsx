import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { FeatureTile } from "@/components/marketing/FeatureTile";
import { QRPreviewCard } from "@/components/QRPreviewCard";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { getPets } from "@/services/petService";
import { mockPlans } from "@/data/mockPlans";

export const metadata: Metadata = {
  title: "Safe Pet Profiles, Care Records & Memories",
};

const features: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "qr",
    title: "Safe QR pet profile",
    description:
      "Create a safe profile that helps a finder contact you quickly if your pet is found.",
  },
  {
    icon: "phone",
    title: "Emergency contact actions",
    description:
      "WhatsApp, call, and found-location actions designed for quick mobile use.",
  },
  {
    icon: "heart",
    title: "Beautiful shareable pet profile",
    description:
      "Turn your pet's profile into a warm mini website you can share with family and friends.",
  },
  {
    icon: "heart",
    title: "Pet memories and moments",
    description:
      "Save photos, short videos, milestones, funny moments, and life notes for the pets you love.",
  },
  {
    icon: "record",
    title: "Premium care records and reminders",
    description:
      "Keep vaccines, deworming, grooming, medication, and vet visits together in the owner portal.",
  },
  {
    icon: "tag",
    title: "Smart QR / NFC tags",
    description:
      "Order a QR tag or QR + NFC smart tag after your pet profile is ready.",
  },
  {
    icon: "pin",
    title: "GPS safety coming later",
    description:
      "GPS Safety is coming later for pet owners who want tracker support and extra protection.",
  },
];

const tierHighlights: {
  icon: IconName;
  tier: string;
  title: string;
  description: string;
  badge?: string;
}[] = [
  {
    icon: "qr",
    tier: "Free",
    title: "QR safety profile",
    description:
      "Basic finder contact stays free, including WhatsApp owner and call owner.",
  },
  {
    icon: "heart",
    tier: "Premium",
    title: "Care and memories",
    description:
      "Manage more pets, complete care records, reminders, lost mode, and unlimited moments.",
  },
  {
    icon: "tag",
    tier: "Add-on",
    title: "Smart tags",
    description:
      "MyPetLink QR tags and QR + NFC smart tags are one-time purchases, separate from plans.",
    badge: "Optional",
  },
];

const faqs = [
  {
    question: "Is this a GPS tracker?",
    answer:
      "GPS Safety is coming later. MyPetLink starts with QR safety profiles, care records, memories, and optional smart tags.",
  },
  {
    question: "Does NFC replace QR?",
    answer:
      "No. NFC is a QR + NFC smart tag upgrade. A finder can scan the QR code or tap the NFC tag to open the same safe profile.",
  },
  {
    question: "Will my full address be public?",
    answer:
      "No. The public profile is designed to show only safe information such as a general area.",
  },
  {
    question: "Can I store health records?",
    answer:
      "Yes. You can keep vaccine, deworming, grooming, vet visit, medication, and allergy notes together.",
  },
  {
    question: "Can Free users order a tag?",
    answer:
      "Yes. MyPetLink QR tags and QR + NFC smart tags are optional one-time add-ons after a pet profile is created.",
  },
];

export default async function Home() {
  const pets = await getPets();
  const samplePet = pets.data[0];

  return (
    <PublicLayout>
      <section className="brand-peach-section overflow-hidden">
        <div className="soft-grid mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <Badge tone="warm">Made for Malaysian pet families</Badge>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[1.02] text-pet-ink sm:text-6xl lg:text-7xl">
              Create a safe and beautiful profile for your pet.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-pet-muted">
              MyPetLink helps you protect your pet with a QR safety profile,
              manage care records, and save the little memories that make them
              special.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CTAButton href="/login" icon="paw" variant="coral">
                Create Pet Profile
              </CTAButton>
              <CTAButton href="/p/milo" icon="heart" variant="primary">
                View Sample Pet Profile
              </CTAButton>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <StatCard
                icon="qr"
                label="Free QR profile"
                note="Basic finder contact stays available."
                value="Free"
              />
              <StatCard
                icon="heart"
                label="Pet memories"
                note="Photos, moments, and milestones."
                tone="mint"
                value="Moments"
              />
              <StatCard
                icon="tag"
                label="Optional smart tags"
                note="MyPetLink QR and QR + NFC options."
                tone="teal"
                value="Tags"
              />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="pointer-events-none absolute -left-3 top-8 hidden rotate-[-5deg] rounded-3xl border border-pet-border bg-white px-4 py-3 text-sm font-extrabold text-pet-ink shadow-xl shadow-[#0d1b3d]/10 sm:flex sm:items-center sm:gap-2">
              <Icon name="heart" className="h-4 w-4 text-pet-coral" />
              New memory saved
            </div>
            <div className="pointer-events-none absolute -right-2 bottom-20 hidden rotate-[4deg] rounded-3xl border border-pet-border bg-white px-4 py-3 text-sm font-extrabold text-pet-ink shadow-xl shadow-[#0d1b3d]/10 sm:flex sm:items-center sm:gap-2">
              <Icon name="tag" className="h-4 w-4 text-pet-teal" />
              Smart tag ready
            </div>
            <div className="pointer-events-none absolute right-8 top-0 hidden rounded-3xl bg-pet-ink px-4 py-3 text-sm font-extrabold text-white shadow-xl shadow-[#0d1b3d]/15 md:flex md:items-center md:gap-2">
              <Icon name="shield" className="h-4 w-4 text-pet-sky" />
              QR Active
            </div>
            <QRPreviewCard pet={samplePet} />
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="How MyPetLink helps"
            title="Safety when it matters, memories every day."
            description="Start with a free QR profile. Add care records, memories, reminders, and smart tags when you need more."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {tierHighlights.map((tier) => (
              <article
                className="brand-soft-card rounded-[1.75rem] p-6"
                key={tier.title}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                    <Icon name={tier.icon} className="h-5 w-5" />
                  </span>
                  {tier.badge ? <Badge tone="teal">{tier.badge}</Badge> : null}
                </div>
                <p className="mt-5 text-sm font-bold uppercase text-pet-teal">
                  {tier.tier}
                </p>
                <h2 className="mt-2 text-2xl font-black text-pet-ink">
                  {tier.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-pet-muted">
                  {tier.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="brand-peach-section">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="The problem"
            title="When a pet is missing, every minute feels heavy."
            description="A phone-first QR profile gives a kind stranger the right information and the right action buttons without exposing private details."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              [
                "Lost pets are stressful",
                "Owners need a quick way for finders to contact them without relying on social posts alone.",
              ],
              [
                "Finders need clarity",
                "A safe QR page tells them the pet's name, general area, and handling notes immediately.",
              ],
              [
                "Records get scattered",
                "Care notes can live with the pet profile so owners can manage routine care calmly.",
              ],
            ].map(([title, description]) => (
              <article
                className="brand-card rounded-[1.75rem] p-6"
                key={title}
              >
                <h3 className="text-xl font-black text-pet-ink">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-pet-muted">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="brand-blue-section">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="How it works"
            title="A profile-first journey made simple"
            description="Create your pet profile first, then share it with loved ones or order a physical tag when you are ready."
          />
          <div className="grid gap-4 md:grid-cols-4">
            {[
              "Create the pet profile",
              "Add care and emergency details",
              "Save memories and milestones",
              "Order a MyPetLink QR or QR + NFC tag",
            ].map((step, index) => (
              <article
                className="brand-card rounded-[1.75rem] p-6"
                key={step}
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-lg font-black text-pet-teal">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-lg font-black text-pet-ink">{step}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-pet-cream">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Features"
            title="Warm enough to share. Practical enough for care."
            description="Everything is designed around real pet owner tasks: safer public profiles, faster contact, calmer records, and sweet everyday memories."
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureTile key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="brand-peach-section">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
          <div>
            <PageHeader
              eyebrow="Sample QR profile"
              title="The finder page stays calm and focused."
              description="It does not look like a dashboard. It gives the finder safe public details and immediate contact actions."
            />
            <CTAButton href="/sample" icon="qr">
              Open Sample
            </CTAButton>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute -right-2 -top-4 hidden rounded-full bg-white px-4 py-2 text-xs font-extrabold text-pet-coral shadow-lg sm:block">
              Finder-safe view
            </div>
            <QRPreviewCard pet={samplePet} compact />
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Pricing preview"
            title="Free, Premium, and optional smart tags."
            description="Free covers basic safety contact. Premium expands care and memories. Physical tags are one-time add-ons."
            action={
              <CTAButton href="/pricing" variant="secondary">
                View Pricing
              </CTAButton>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            {mockPlans.map((plan) => (
              <article
                className={`brand-card rounded-[1.75rem] p-6 ${
                  plan.highlighted
                    ? "ring-2 ring-pet-coral"
                    : ""
                }`}
                key={plan.id}
              >
                {plan.highlighted ? <Badge tone="warm">Popular</Badge> : null}
                {plan.comingSoon ? (
                  <Badge tone="teal">Coming later</Badge>
                ) : null}
                <h3 className="mt-3 text-2xl font-black text-pet-ink">
                  {plan.name}
                </h3>
                <p className="mt-2 text-xl font-black text-pet-coral">
                  {plan.price}
                </p>
                <p className="mt-1 text-sm font-semibold text-pet-muted">
                  {plan.billingNote}
                </p>
                <ul className="mt-5 space-y-3 text-sm text-pet-muted">
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
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="brand-blue-section">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="FAQ"
            title="Clear answers for pet owners"
          />
          <div className="grid gap-3">
            {faqs.map((faq) => (
              <details
                className="brand-card rounded-[1.25rem] p-5"
                key={faq.question}
              >
                <summary className="cursor-pointer text-base font-black text-pet-ink">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-6 text-pet-muted">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-pet-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-pet-sky">
              MyPetLink
            </p>
            <h2 className="mt-2 text-3xl font-black">
              Make your pet easier to identify and easier to care for.
            </h2>
          </div>
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-pet-ink transition hover:bg-pet-apricot"
            href="/login"
          >
            Create Pet Profile
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
