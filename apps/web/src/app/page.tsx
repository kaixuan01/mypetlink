import type { Metadata } from "next";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { PRIMARY_CTA_LABEL } from "@/components/layouts/PublicNav";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { FinderJourney } from "@/components/marketing/FinderJourney";
import { LandingHero } from "@/components/marketing/LandingHero";
import { PetProfilesSection } from "@/components/marketing/PetProfilesSection";
import { SmartTagShowcase } from "@/components/marketing/SmartTagShowcase";
import { WhereToBuyTeaser } from "@/components/marketing/WhereToBuyTeaser";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  freePlanLimits,
  gpsSafety,
  premiumPlan,
  smartTagAddOn,
  smartTagAddOnsStatus,
} from "@/lib/planLimits";
import { marketingRoutes } from "@/lib/routes";
import {
  createMarketingMetadata,
  homepageStructuredData,
} from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.home,
  title: "MyPetLink Malaysia | Smart Pet Profiles, QR & NFC Pet Tags",
  description:
    "Create a free shareable pet profile, keep important pet details together, and help lost pets get home faster with MyPetLink QR and NFC pet tags in Malaysia.",
});

/**
 * The MyPetLink landing page.
 *
 * The page tells one story in order: what you get, what happens when a pet is
 * lost, the tag that makes it wearable, what else the profile does, what it
 * costs, and the questions people ask before signing up.
 *
 * Two conventions hold it together. Exactly one H1 lives in the hero, and
 * every section below is an H2, so the document has a readable outline. And
 * the only two buttons on the page are the same signup action, at the top and
 * at the close; everything else that navigates is a text link, because a page
 * with seven buttons has no primary action at all.
 */

const pillars: { icon: IconName; title: string; points: string[] }[] = [
  {
    icon: "shield",
    title: "Safety",
    points: [
      "Safety Profile for finders",
      "Downloadable QR code",
      "WhatsApp or call contact",
      "Emergency and safety notes",
    ],
  },
  {
    icon: "record",
    title: "Care",
    points: [
      "Basic care records",
      "Medication and allergy notes",
      "Vet visit history",
      "Reminders coming soon",
    ],
  },
  {
    icon: "heart",
    title: "Memories",
    points: [
      "Pet moments",
      "Public or private memories",
      "Life timeline",
      "Shareable profile",
    ],
  },
];

const faqs = [
  {
    question: "Is this a GPS tracker?",
    answer:
      "No. A MyPetLink QR or NFC tag opens your pet's Safety Profile when someone scans or taps it; it does not provide live location tracking. GPS Safety is a separate feature planned for later.",
  },
  {
    question: "What if a finder's phone does not support NFC?",
    answer:
      "They can still scan the QR code with the phone camera. Scanning and tapping open the same owner-approved Safety Profile.",
  },
  {
    question: "Will my full address be public?",
    answer:
      "No. The public profile is designed to show only safe details such as a general area.",
  },
  {
    question: "Can Free users get finder contact?",
    answer:
      "Yes. A pet-level Safety Profile with basic WhatsApp and call owner contact is included on the Free plan.",
  },
  {
    question: "Can I create a pet profile without buying a tag?",
    answer:
      "Yes. Every owner can start with a free Public Share Profile and Safety Profile. The physical QR + NFC Smart Tag is an optional one-time add-on.",
  },
  {
    question: "Is MyPetLink available for pets in Malaysia?",
    answer:
      "Yes. MyPetLink is built for Malaysian pet owners and supports profiles for cats, dogs, and other pets.",
  },
];

export default function Home() {
  return (
    <PublicLayout>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homepageStructuredData).replace(/</g, "\\u003c"),
        }}
        type="application/ld+json"
      />

      {/* 1. Hero — the page's only H1, and its only trust strip. */}
      <LandingHero />

      {/* 2. The finder journey — replaces the old "why it matters" and
             "how it works", which both explained a process. */}
      <FinderJourney />

      {/* 3. The two pages a pet gets, and what a finder may see. */}
      <PetProfilesSection />

      {/* 4. The physical tag that makes the Safety Profile wearable. */}
      <SmartTagShowcase />

      {/* 5. What the profile does beyond safety. */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <PageHeader
            as="h2"
            eyebrow="What you get"
            title="Safety, care, and memories."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map((pillar) => (
              <article
                className="brand-card rounded-[1.5rem] p-5 sm:p-6"
                key={pillar.title}
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ff] text-pet-teal">
                  <Icon aria-hidden="true" className="h-5 w-5" name={pillar.icon} />
                </span>
                <h3 className="mt-4 text-lg font-black text-pet-ink">
                  {pillar.title}
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-pet-muted">
                  {pillar.points.map((point) => (
                    <li className="flex gap-2" key={point}>
                      <Icon
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral"
                        name="paw"
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

      {/* 6. Pricing — what is actually available, then the roadmap in one line. */}
      <section className="bg-pet-cream">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          {/*
            The headline must not read as an invitation to buy: the tag is not
            on sale yet, so its status comes straight from configuration rather
            than from a hand-written promise.
          */}
          <PageHeader
            as="h2"
            eyebrow="Pricing"
            title={`Start free today. Smart Tags are ${smartTagAddOnsStatus.status.toLowerCase()}.`}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <article className="brand-card rounded-[1.5rem] p-5 sm:p-6">
              <Badge tone="mint">Available now</Badge>
              <h3 className="mt-3 text-xl font-black text-pet-ink">
                Free Profile
              </h3>
              <p className="mt-1 text-2xl font-black text-pet-ink">RM0</p>
              <p className="mt-3 text-sm leading-6 text-pet-muted">
                Up to {freePlanLimits.maxPets} pet profiles, each with{" "}
                {freePlanLimits.maxMemoriesPerPet} pet memories, a Safety
                Profile, and a downloadable QR code.
              </p>
            </article>

            <article className="brand-card rounded-[1.5rem] p-5 sm:p-6">
              <Badge tone="teal">{smartTagAddOnsStatus.status}</Badge>
              <h3 className="mt-3 text-xl font-black text-pet-ink">
                {smartTagAddOn.shortName
                  .replace(/^./, (letter) => letter.toUpperCase())}
              </h3>
              <p className="mt-1 text-2xl font-black text-pet-ink">
                {smartTagAddOn.price}
                <span className="ml-2 text-sm font-bold text-pet-muted">
                  {smartTagAddOn.billingNote}
                </span>
              </p>
              <p className="mt-3 text-sm leading-6 text-pet-muted">
                {smartTagAddOn.description}
              </p>
            </article>
          </div>

          {/*
            Premium and GPS are real plans, but neither can be bought. One
            muted line keeps them honest without giving them the weight of a
            purchasable option.
          */}
          <p className="mt-5 text-sm font-semibold leading-6 text-pet-muted">
            {premiumPlan.name} ({premiumPlan.status.toLowerCase()}) and{" "}
            {gpsSafety.name} ({gpsSafety.status.toLowerCase()}) are planned for
            later releases.{" "}
            <a
              className="font-extrabold text-pet-teal underline-offset-4 hover:underline"
              href={marketingRoutes.pricing}
            >
              See full pricing
            </a>
          </p>
        </div>
      </section>

      {/* 7. Where to buy — renders only once a tag can actually be bought. */}
      <WhereToBuyTeaser />

      {/* 8. FAQ — hairlines instead of six card borders. */}
      <section className="bg-white" id="faq">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <PageHeader as="h2" eyebrow="FAQ" title="Quick answers." />
          {/* Questions stay at a readable measure, but on the same left gutter
              every other section starts from. */}
          <div className="max-w-3xl border-t border-pet-border">
            {faqs.map((faq) => (
              <details
                className="group border-b border-pet-border py-4"
                key={faq.question}
              >
                <summary className="flex cursor-pointer items-start justify-between gap-4 text-base font-black text-pet-ink">
                  {faq.question}
                  <Icon
                    aria-hidden="true"
                    className="mt-1 h-4 w-4 shrink-0 text-pet-teal transition-transform group-open:rotate-180"
                    name="chevron"
                  />
                </summary>
                <p className="mt-3 text-sm leading-6 text-pet-muted">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9. The close — the same action as the hero, worded identically. */}
      <section className="bg-pet-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-14">
          <div className="flex items-center gap-4">
            <LinkoMascot
              alt=""
              className="hidden shrink-0 sm:block"
              pose="celebrate"
              size={110}
            />
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase text-pet-sky">
                MyPetLink
              </p>
              <h2 className="mt-1.5 text-2xl font-black leading-tight sm:text-3xl">
                A safer way home for your pet.
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#c3d1ee]">
                Free for up to {freePlanLimits.maxPets} pets. No card needed.
              </p>
            </div>
          </div>
          <CreateProfileCTA className="w-full sm:w-auto" variant="light">
            {PRIMARY_CTA_LABEL}
          </CreateProfileCTA>
        </div>
      </section>
    </PublicLayout>
  );
}
