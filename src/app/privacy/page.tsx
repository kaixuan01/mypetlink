import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Privacy",
};

const sections = [
  {
    title: "What is shown publicly",
    body: "A public pet profile can show your pet's name, photos, type, breed, colour, age, bio, personality tags, favourite things, general area, public moments, and owner-approved safety notes.",
  },
  {
    title: "What stays private",
    body: "Full home addresses, private care notes, private memories, account details, and anything you choose not to publish should stay inside the owner portal.",
  },
  {
    title: "Finder safety page privacy",
    body: "A QR or NFC safety page is designed for quick contact. It can show a general area, safety note, emergency note, WhatsApp button, and call button without showing a full address.",
  },
  {
    title: "Public profile visibility",
    body: "Owners are responsible for choosing which profile details are public and for keeping contact information accurate.",
  },
  {
    title: "Pet moments visibility",
    body: "Moments can be public, private, or family-only in the owner workspace. Only public moments should appear on a shareable profile.",
  },
  {
    title: "Care records visibility",
    body: "Care records are owner-managed. Public pages should show only public-safe care badges unless the owner chooses to share more detail.",
  },
  {
    title: "Contact information usage",
    body: "Contact buttons are used so a finder can reach the owner. Keep your WhatsApp and phone details current so they remain helpful.",
  },
  {
    title: "Found location sharing",
    body: "A finder may choose to share their browser location through WhatsApp. MyPetLink does not need to show a full owner address for this to work.",
  },
  {
    title: "Profile updates and deletion",
    body: "Owners should update or remove outdated profile information when a pet's details, care needs, or contact details change.",
  },
  {
    title: "Not veterinary advice",
    body: "MyPetLink helps with records and safety profiles, but it does not replace advice from a qualified veterinarian.",
  },
  {
    title: "Contact and support",
    body: "Need help updating or removing a profile? Contact MyPetLink support.",
  },
];

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Privacy"
            title="Safe public profiles first"
            description="QR profiles should help finders contact you without exposing more than necessary."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((section) => (
              <article
                className="brand-card flex gap-4 rounded-[1.5rem] p-5"
                key={section.title}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name="shield" className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-black text-pet-ink">
                    {section.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-pet-muted">
                    {section.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
