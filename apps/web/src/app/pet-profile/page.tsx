import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { marketingRoutes, publicRoutes, samplePet } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.petProfile,
  title: "Free Shareable Pet Profiles in Malaysia | MyPetLink",
  description:
    "Create a free shareable profile for a cat, dog, or other pet, with owner-approved details, memories, care records, and a separate QR Safety Page.",
});

const benefits: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "heart",
    title: "A profile worth sharing",
    description:
      "Introduce your pet with a photo, bio, personality, favourite things, public memories, and life milestones.",
  },
  {
    icon: "record",
    title: "Care details stay organized",
    description:
      "Keep useful care records together and choose whether selected badges or details belong on the public profile.",
  },
  {
    icon: "shield",
    title: "Privacy choices stay with the owner",
    description:
      "The friendly Share Profile is separate from the contact-focused QR Safety Page, with controls for what visitors can see.",
  },
];

export default function PetProfileGuidePage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Pet profiles"
            title="One home for your pet's story, care, and safety"
            description="Start with a free profile for a cat, dog, or other pet in Malaysia. A physical tag is optional."
            action={<CreateProfileCTA>Create Free Pet Profile</CreateProfileCTA>}
          />
          <div className="grid gap-4 md:grid-cols-3">
            {benefits.map((benefit) => (
              <article className="brand-card rounded-[1.75rem] p-6" key={benefit.title}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon className="h-5 w-5" name={benefit.icon} />
                </span>
                <h2 className="mt-5 text-xl font-black text-pet-ink">{benefit.title}</h2>
                <p className="mt-3 text-sm leading-6 text-pet-muted">{benefit.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          <article className="rounded-[1.75rem] border border-pet-border p-6">
            <h2 className="text-xl font-black text-pet-ink">Public Share Profile</h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              A warm page for friends, family, and pet communities. It focuses on your pet&apos;s identity, personality, memories, and owner-approved details.
            </p>
            <CTAButton className="mt-5" href={publicRoutes.publicProfile(samplePet)} variant="secondary">
              Meet Topu
            </CTAButton>
          </article>
          <article className="rounded-[1.75rem] border border-pet-border p-6">
            <h2 className="text-xl font-black text-pet-ink">QR Safety Page</h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              A finder-first page with large contact actions, a general area, and safety notes when the owner enables them. It remains excluded from search results.
            </p>
            <CTAButton className="mt-5" href={marketingRoutes.howItWorks} variant="outline">
              See How Finder Contact Works
            </CTAButton>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
