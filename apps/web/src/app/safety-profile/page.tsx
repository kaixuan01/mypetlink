import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { CreateProfileCTA } from "@/components/marketing/CreateProfileCTA";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { marketingRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.safetyProfile,
  title: "Safety Profile for Lost Pets in Malaysia | MyPetLink",
  description:
    "The finder-first page someone opens when they find your pet. Contact you by WhatsApp or call, see a general area and safety notes, and share where the pet was found.",
});

/**
 * What Safety Profile is, as a product page rather than a demo.
 *
 * The Product menu used to send "Safety Profile" to `/sample#safety-profile`,
 * which is a demo of the thing rather than an explanation of it — somebody who
 * clicked a product name landed in a sample gallery. The demo is still here,
 * but as the CTA at the end, which is the one place linking to it is honest.
 *
 * It deliberately does not restate How It Works. That page is the whole journey
 * from signing up to being reunited; this one answers a single question a
 * worried owner asks: what actually happens if someone finds my pet?
 */

const finderSteps: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "qr",
    title: "They scan or tap",
    description:
      "A QR code — on a Smart Tag, or one you printed yourself — opens with any phone camera, and an NFC tap works without one. Both open the same page, and the finder installs nothing.",
  },
  {
    icon: "shield",
    title: "The Safety Profile opens",
    description:
      "Your pet's name and photo first, so the finder knows straight away they have the right pet and that somebody is looking for it.",
  },
  {
    icon: "share",
    title: "They contact you",
    description:
      "Large WhatsApp and call buttons, using the contact details you switched on — not a form, and not an account they have to create.",
  },
  {
    icon: "paw",
    title: "They can share where",
    description:
      "If you enable it, a finder can send the general area where your pet turned up, so you know where to start looking.",
  },
];

const shown = [
  "Your pet's name and photo",
  "A general area you choose — never your home address",
  "Contact options you switched on, such as WhatsApp or a phone number",
  "Safety and emergency notes, if you added them",
];

const withheld = [
  "Your home address",
  "Any contact method you left switched off",
  "Your MyPetLink account email",
  "Your Community handle, followers, or Moments",
];

export default function SafetyProfileGuidePage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            action={<CreateProfileCTA />}
            description="Every MyPetLink pet gets a Safety Profile — a page built for whoever finds them, not for browsing. It is free, and a physical tag is optional."
            eyebrow="Safety Profile"
            title="Help a finder reach you quickly"
          />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {finderSteps.map((step, index) => (
              <article className="brand-card rounded-[1.75rem] p-6" key={step.title}>
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                    <Icon className="h-5 w-5" name={step.icon} />
                  </span>
                  <span className="text-xs font-black uppercase tracking-wide text-pet-muted">
                    Step {index + 1}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-black text-pet-ink">
                  {step.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-pet-muted">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <PageHeader
            as="h2"
            eyebrow="Privacy"
            title="What a finder sees, and what they never do"
          />
          {/*
            Two lists rather than a paragraph, because this is the question
            owners actually hesitate over and a list can be checked at a glance.
            Everything here describes a control that exists.
          */}
          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-[1.75rem] border border-pet-border p-6">
              <h3 className="text-lg font-black text-pet-ink">
                What a finder sees
              </h3>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-pet-muted">
                {shown.map((item) => (
                  <li className="flex gap-2" key={item}>
                    <Icon
                      aria-hidden="true"
                      className="mt-1 h-4 w-4 shrink-0 text-pet-teal"
                      name="check"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[1.75rem] border border-pet-border bg-pet-cream p-6">
              <h3 className="text-lg font-black text-pet-ink">
                What stays private
              </h3>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-pet-muted">
                {withheld.map((item) => (
                  <li className="flex gap-2" key={item}>
                    <Icon
                      aria-hidden="true"
                      className="mt-1 h-4 w-4 shrink-0 text-pet-coral"
                      name="close"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-pet-cream px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
          {/*
            The two pages a pet gets, side by side, because the question that
            follows "what is a Safety Profile" is almost always "how is that
            different from the profile I share?".
          */}
          <article className="rounded-[1.75rem] border border-pet-border bg-white p-6">
            <h2 className="text-xl font-black text-pet-ink">Safety Profile</h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              For whoever finds your pet. Contact-first, kept out of search
              results, and opened by a scan, a tap, or a direct link.
            </p>
            <CTAButton
              className="mt-5"
              href={marketingRoutes.sampleSafetyProfile}
              variant="secondary"
            >
              See the Safety Profile sample
            </CTAButton>
          </article>

          <article className="rounded-[1.75rem] border border-pet-border bg-white p-6">
            <h2 className="text-xl font-black text-pet-ink">
              Share Profile
            </h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              For friends, family and pet communities. Your pet&apos;s story,
              photos and Moments — a different page, with different controls.
            </p>
            <CTAButton
              className="mt-5"
              href={marketingRoutes.petProfile}
              variant="outline"
            >
              About Share Profiles
            </CTAButton>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
