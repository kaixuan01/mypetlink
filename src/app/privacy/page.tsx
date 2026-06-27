import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Privacy",
};

const publicItems = [
  "Pet name",
  "Pet photos",
  "Breed / type",
  "General area",
  "Owner-approved notes",
  "Public moments",
];

const privateItems = [
  "Full home address",
  "Private notes",
  "Private memories",
  "Account details",
  "Internal records",
];

const ownerControls = [
  "WhatsApp button",
  "Call button",
  "Public memories",
  "Life timeline",
  "Care badges",
  "Safety notes",
];

const explainers: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "qr",
    title: "Finder safety page",
    body: "When a tag is scanned, the finder sees a quick contact page — general area, safety note, WhatsApp, and call — without your full address.",
  },
  {
    icon: "pin",
    title: "Found location sharing",
    body: "A finder can choose to share their own browser location with you through WhatsApp. We never need to publish your home address for this to work.",
  },
  {
    icon: "record",
    title: "Care records & memories",
    body: "Care records stay in your owner portal. Only the badges and moments you mark public appear on a shareable profile.",
  },
];

export default function PrivacyPage() {
  return (
    <PublicLayout>
      {/* Intro */}
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Privacy"
            title="Privacy-first pet profiles"
            description="You decide what a finder or friend can see. By default, a profile shows just enough to bring your pet home — never your private details."
          />
        </div>
      </section>

      {/* What can be public vs what stays private */}
      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          <article className="brand-card rounded-[1.75rem] p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="paw" className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black text-pet-ink">
                What can be public
              </h2>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-pet-muted">
              {publicItems.map((item) => (
                <li className="flex gap-2" key={item}>
                  <Icon
                    name="paw"
                    className="mt-0.5 h-4 w-4 shrink-0 text-pet-teal"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="brand-card rounded-[1.75rem] p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fdeada] text-pet-coral">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-black text-pet-ink">
                What stays private
              </h2>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-pet-muted">
              {privateItems.map((item) => (
                <li className="flex gap-2" key={item}>
                  <Icon
                    name="shield"
                    className="mt-0.5 h-4 w-4 shrink-0 text-pet-coral"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {/* Owner controls */}
      <section className="brand-blue-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Owner controls"
            title="You approve every detail"
            description="Each of these is off until you turn it on, so nothing is shared without your say-so."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ownerControls.map((control) => (
              <div
                className="brand-card flex items-center gap-3 rounded-[1.25rem] p-4 text-sm font-bold text-pet-ink"
                key={control}
              >
                <Icon name="settings" className="h-5 w-5 shrink-0 text-pet-teal" />
                {control}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How safety & sharing work */}
      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 md:grid-cols-3">
            {explainers.map((item) => (
              <article
                className="brand-soft-card rounded-[1.75rem] p-6"
                key={item.title}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-lg font-black text-pet-ink">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
