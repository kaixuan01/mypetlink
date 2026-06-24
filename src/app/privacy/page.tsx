import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Privacy",
};

const points = [
  "We do not recommend showing a full home address publicly.",
  "Owners control what appears on the public QR profile.",
  "Owners should keep contact and profile details up to date.",
  "Health records are private unless an owner chooses to share them.",
  "MyPetLink is not veterinary or medical advice.",
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
          <div className="grid gap-4">
            {points.map((point) => (
              <article
                className="brand-card flex gap-4 rounded-[1.5rem] p-5"
                key={point}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                  <Icon name="shield" className="h-5 w-5" />
                </span>
                <p className="text-sm leading-6 text-pet-muted">{point}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
