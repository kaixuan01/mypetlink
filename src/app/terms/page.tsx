import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Terms",
};

const terms = [
  "MyPetLink provides record keeping and QR profile tools.",
  "MyPetLink does not guarantee recovery of lost pets.",
  "MyPetLink does not provide veterinary advice.",
  "Users are responsible for keeping contact information updated.",
  "Users should only publish information they are comfortable sharing publicly.",
  "Physical tag availability, pricing, and delivery may vary while the product is being tested.",
  "GPS Safety is Coming Later and is not currently available.",
];

export default function TermsPage() {
  return (
    <PublicLayout>
      <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Terms"
            title="Simple terms for pet owners"
            description="Helpful guidance for using MyPetLink safely and responsibly."
          />
          <ol className="list-decimal space-y-4 pl-6 marker:font-black marker:text-pet-coral">
            {terms.map((term) => (
              <li
                className="brand-card rounded-[1.5rem] py-5 pl-4 pr-5 text-sm leading-6 text-pet-muted"
                key={term}
              >
                {term}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </PublicLayout>
  );
}
