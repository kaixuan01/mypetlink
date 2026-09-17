import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { SampleExperience } from "@/components/marketing/SampleExperience";
import { PageHeader } from "@/components/ui/PageHeader";
import { marketingRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.sample,
  title: "Sample Public and Safety Profiles | MyPetLink",
  description: "Explore sample Public Share and Safety Profiles to see everyday pet sharing and finder contact in action.",
});

export default function SamplePage() {
  return (
    <PublicLayout>
      <section className="brand-blue-section px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/*
            "Two real situations" claimed more than this page delivers: these
            are a staged sample pet, not a customer's story, and a visitor who
            reads "real" and then meets Linko has been told something untrue
            about a page whose whole job is trust.
          */}
          <PageHeader
            description="A worked example of both pages a pet gets: the profile an owner shares, and the Safety Profile a finder opens to contact them."
            eyebrow="Sample experience"
            title="See how Public Share and Safety Profiles work"
          />
          <SampleExperience />
        </div>
      </section>
    </PublicLayout>
  );
}
