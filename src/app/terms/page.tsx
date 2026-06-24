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
          <ol className="grid list-none gap-4">
            {terms.map((term, index) => (
              <li
                className="brand-card flex gap-3 rounded-[1.5rem] p-5 text-sm leading-6 text-pet-muted"
                key={term}
              >
                <span className="shrink-0 font-black text-pet-coral">
                  {index + 1}.
                </span>
                <span>{term}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </PublicLayout>
  );
}
