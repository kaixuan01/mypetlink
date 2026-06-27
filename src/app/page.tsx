import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { samplePet } from "@/lib/routes";
import type { Pet } from "@/types";

export const metadata: Metadata = {
  title: "A Safer Profile for Your Pet",
};

const whyItMatters: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "search",
    title: "Pets can get lost",
    description: "A panicked moment is easier when your pet is easy to identify.",
  },
  {
    icon: "phone",
    title: "Finders need quick contact",
    description: "A kind stranger should reach you in one tap, not a social post.",
  },
  {
    icon: "shield",
    title: "Your details stay protected",
    description: "Show a general area and safe notes — never your full address.",
  },
];

const howItWorks = [
  "Create your pet profile",
  "Choose what is public",
  "Share your profile or order a smart tag",
  "Finder scans and contacts you",
];

const pillars: {
  icon: IconName;
  title: string;
  points: string[];
}[] = [
  {
    icon: "shield",
    title: "Safety",
    points: [
      "QR safety profile",
      "WhatsApp / call contact",
      "Emergency note",
      "General area, not full address",
    ],
  },
  {
    icon: "record",
    title: "Care",
    points: [
      "Care records",
      "Reminders",
      "Medication & allergy notes",
      "Vet visit history",
    ],
  },
  {
    icon: "heart",
    title: "Memories",
    points: [
      "Pet moments",
      "Public / private memories",
      "Life timeline",
      "Shareable profile",
    ],
  },
];

const smartTags: {
  name: string;
  tagline: string;
  highlighted?: boolean;
}[] = [
  {
    name: "QR Pet Tag",
    tagline: "Best for everyday use",
  },
  {
    name: "QR + NFC Smart Tag",
    tagline: "Premium tap + scan option",
    highlighted: true,
  },
];

const faqs = [
  {
    question: "Is this a GPS tracker?",
    answer:
      "Not yet. MyPetLink starts with QR safety profiles, care records, and memories. GPS Safety is coming later.",
  },
  {
    question: "Do I need the NFC tag?",
    answer:
      "No. A QR tag is the main product and works with any phone camera. QR + NFC is an optional premium upgrade.",
  },
  {
    question: "Will my full address be public?",
    answer:
      "No. The public profile is designed to show only safe details such as a general area.",
  },
  {
    question: "Can Free users get finder contact?",
    answer:
      "Yes. Basic finder contact — WhatsApp and call owner — is included on the Free plan.",
  },
];

export default function Home() {
  const pet = samplePet;

  return (
    <PublicLayout>
      {/* 1. Hero */}
      <section className="brand-peach-section overflow-hidden">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <Badge tone="warm">Made for Malaysian pet families</Badge>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[1.04] text-pet-ink sm:text-6xl">
              A safer profile for your pet.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-pet-muted">
              Create a public pet profile, save important care details, and let
              finders contact you quickly through a QR smart tag.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CTAButton href="/login" icon="paw" variant="coral">
                Create Free Pet Profile
              </CTAButton>
              <CTAButton
                href={pet.publicProfilePath}
                icon="heart"
                variant="secondary"
              >
                View Sample Profile
              </CTAButton>
            </div>
            <p className="mt-6 text-sm font-bold text-pet-muted">
              Free forever to start &middot; Basic finder contact included
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="pointer-events-none absolute right-6 top-2 z-10 hidden rounded-full bg-pet-ink px-4 py-2 text-xs font-extrabold text-white shadow-xl shadow-[#0d1b3d]/15 sm:flex sm:items-center sm:gap-2">
              <Icon name="shield" className="h-4 w-4 text-pet-sky" />
              QR Active
            </div>
            <LandingPetProfilePreview pet={pet} />
          </div>
        </div>
      </section>

      {/* 2. Why it matters */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Why it matters"
            title="Peace of mind when it counts."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {whyItMatters.map((item) => (
              <article
                className="brand-soft-card rounded-[1.75rem] p-6"
                key={item.title}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-black text-pet-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How it works */}
      <section id="how-it-works" className="brand-blue-section scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="How it works"
            title="Four simple steps."
          />
          <div className="grid gap-4 md:grid-cols-4">
            {howItWorks.map((step, index) => (
              <article className="brand-card rounded-[1.75rem] p-6" key={step}>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-lg font-black text-pet-teal">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-base font-black text-pet-ink">
                  {step}
                </h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Public Share Profile vs QR Safety Profile */}
      <section className="bg-pet-cream">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Two profiles, two jobs"
            title="Share with loved ones. Get found by strangers."
            description="MyPetLink keeps the friendly page you share separate from the emergency page a finder sees."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <article className="brand-card rounded-[1.75rem] p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fdeada] text-pet-coral">
                  <Icon name="heart" className="h-5 w-5" />
                </span>
                <h3 className="text-xl font-black text-pet-ink">
                  Public Share Profile
                </h3>
              </div>
              <code className="mt-4 inline-block rounded-full bg-pet-cream px-3 py-1 text-xs font-bold text-pet-muted">
                /p/{"{petSlug}-{publicCode}"}
              </code>
              <p className="mt-4 text-sm leading-6 text-pet-muted">
                A friendly, shareable page for friends, family, social media, and
                pet communities. Shows About, Moments, and Timeline.
              </p>
            </article>

            <article className="brand-card rounded-[1.75rem] p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name="qr" className="h-5 w-5" />
                </span>
                <h3 className="text-xl font-black text-pet-ink">
                  QR Safety Profile
                </h3>
              </div>
              <code className="mt-4 inline-block rounded-full bg-pet-cream px-3 py-1 text-xs font-bold text-pet-muted">
                /t/{"{tagCode}"}
              </code>
              <p className="mt-4 text-sm leading-6 text-pet-muted">
                The finder-first page opened from a physical tag scan. Contact
                owner, WhatsApp, call, and send found location.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 5. Core features — three pillars */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="What you get"
            title="Safety, care, and memories."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map((pillar) => (
              <article
                className="brand-card rounded-[1.75rem] p-6"
                key={pillar.title}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name={pillar.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-xl font-black text-pet-ink">
                  {pillar.title}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-pet-muted">
                  {pillar.points.map((point) => (
                    <li className="flex gap-2" key={point}>
                      <Icon
                        name="paw"
                        className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Smart Tag add-on */}
      <section id="smart-tags" className="brand-peach-section scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Smart tag add-on"
            title="Start with QR. Upgrade to QR + NFC."
            description="Smart tags are optional one-time purchases. The QR tag is all most pets need; NFC is a premium tap-to-open extra."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {smartTags.map((tag) => (
              <article
                className={`brand-card flex items-center gap-4 rounded-[1.75rem] p-6 ${
                  tag.highlighted ? "ring-2 ring-pet-teal" : ""
                }`}
                key={tag.name}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name="tag" className="h-6 w-6" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-pet-ink">
                      {tag.name}
                    </h3>
                    {tag.highlighted ? <Badge tone="mint">Premium</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-pet-muted">
                    {tag.tagline}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Pricing preview */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Pricing"
            title="Simple plans, optional tags."
            action={
              <CTAButton href="/pricing" variant="secondary">
                View Pricing
              </CTAButton>
            }
          />
          <div className="grid gap-4 md:grid-cols-3">
            <PricingPreviewCard
              title="Free Plan"
              price="RM0"
              note="Free forever, with basic finder contact."
            />
            <PricingPreviewCard
              title="Premium Plan"
              price="RM19.90 / mo"
              note="Multi-pet care, reminders, records, and richer memories."
              highlighted
            />
            <PricingPreviewCard
              title="Smart Tag Add-ons"
              price="from RM19.90"
              note="One-time QR or QR + NFC tags. Works with any plan."
            />
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="brand-blue-section">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <PageHeader eyebrow="FAQ" title="Quick answers." />
          <div className="grid gap-3">
            {faqs.map((faq) => (
              <details className="brand-card rounded-[1.25rem] p-5" key={faq.question}>
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

      {/* 9. Final CTA */}
      <section className="bg-pet-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-pet-sky">MyPetLink</p>
            <h2 className="mt-2 text-3xl font-black">
              A safer way home for your pet.
            </h2>
          </div>
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-pet-ink transition hover:bg-pet-apricot"
            href="/login"
          >
            Create Free Pet Profile
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

function PricingPreviewCard({
  title,
  price,
  note,
  highlighted,
}: {
  title: string;
  price: string;
  note: string;
  highlighted?: boolean;
}) {
  return (
    <article
      className={`brand-card rounded-[1.75rem] p-6 ${
        highlighted ? "ring-2 ring-pet-coral" : ""
      }`}
    >
      {highlighted ? <Badge tone="warm">Popular</Badge> : null}
      <h3 className="mt-3 text-xl font-black text-pet-ink">{title}</h3>
      <p className="mt-2 text-2xl font-black text-pet-coral">{price}</p>
      <p className="mt-3 text-sm leading-6 text-pet-muted">{note}</p>
    </article>
  );
}

function LandingPetProfilePreview({ pet }: { pet: Pet }) {
  return (
    <article className="brand-card overflow-hidden rounded-[2rem]">
      <div className="brand-paw-dots min-h-32 bg-[#e8f3ff] p-6">
        <Badge tone="mint">Shareable pet profile</Badge>
      </div>
      <div className="px-6 pb-6">
        <div className="-mt-12 flex items-end gap-4">
          <PetAvatar pet={pet} size="xl" />
          <div className="rounded-[1.5rem] bg-white/95 p-4 shadow-sm">
            <h2 className="text-2xl font-black text-pet-ink">{pet.name}</h2>
            <p className="mt-1 text-sm font-bold text-pet-muted">
              {pet.species} - {pet.breed} - {pet.ageLabel}
            </p>
          </div>
        </div>
        <p className="mt-5 line-clamp-3 text-sm leading-6 text-pet-muted">
          {pet.bio}
        </p>
        <div className="mt-5 grid gap-3 rounded-[1.5rem] bg-pet-cream p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase text-pet-muted">
              Scan to contact owner
            </p>
            <p className="mt-1 text-sm font-black text-pet-ink">
              WhatsApp &middot; Call &middot; Found location
            </p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pet-teal shadow-sm">
            <Icon name="qr" className="h-6 w-6" />
          </span>
        </div>
      </div>
    </article>
  );
}
