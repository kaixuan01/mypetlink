import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { marketingRoutes, publicRoutes, samplePet } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.howItWorks,
  title: "How MyPetLink Works | Pet Profiles and Finder Contact",
  description:
    "See how to create a free pet profile, choose safe public details, share it, and help a finder contact you through a QR or NFC pet tag.",
});

const steps: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "paw",
    title: "Create a free pet profile",
    description:
      "Add your cat, dog, or other pet, then keep their identity, care notes, and memories together.",
  },
  {
    icon: "shield",
    title: "Choose what people can see",
    description:
      "Share only owner-approved details. A general area can be shown without publishing a full home address.",
  },
  {
    icon: "heart",
    title: "Share the friendly profile",
    description:
      "Send the Public Share Profile to family, friends, and pet communities—no physical tag purchase required.",
  },
  {
    icon: "qr",
    title: "Add a tag when you want one",
    description:
      "A QR Pet Tag works with a phone camera. The QR + NFC Smart Tag also supports a tap. Both open the same QR Safety Page.",
  },
  {
    icon: "phone",
    title: "A finder contacts the owner",
    description:
      "When enabled, the QR Safety Page offers clear WhatsApp and Call Owner actions plus practical safety notes.",
  },
];

export default function HowItWorksPage() {
  return (
    <PublicLayout>
      <section className="brand-blue-section px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="How it works"
            title="From pet profile to a safer way home"
            description="MyPetLink separates everyday sharing from finder contact, so each page has one clear purpose."
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <article className="brand-card rounded-[1.75rem] p-6" key={step.title}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
                  <Icon className="h-5 w-5" name={step.icon} />
                </span>
                <p className="mt-5 text-xs font-black uppercase text-pet-teal">
                  Step {index + 1}
                </p>
                <h2 className="mt-1 text-xl font-black text-pet-ink">{step.title}</h2>
                <p className="mt-3 text-sm leading-6 text-pet-muted">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-pet-border bg-pet-cream p-6 sm:p-8">
          <h2 className="text-2xl font-black text-pet-ink">What a scan does—and does not do</h2>
          <p className="mt-3 text-sm leading-6 text-pet-muted">
            A scan or NFC tap opens a web page. It does not track your pet or reveal a live GPS location. The finder sees only the contact and safety details the owner chose to make public.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <CreateProfileCTA>Create Free Pet Profile</CreateProfileCTA>
            <CTAButton href={publicRoutes.qrSafetyPage(samplePet)} variant="secondary">
              View Topu&apos;s QR Safety Page
            </CTAButton>
            <CTAButton href={marketingRoutes.smartPetTags} variant="outline">
              Compare QR and NFC Tags
            </CTAButton>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
