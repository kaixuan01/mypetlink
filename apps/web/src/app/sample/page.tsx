import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { SampleExperience } from "@/components/marketing/SampleExperience";
import { PageHeader } from "@/components/ui/PageHeader";
import { marketingRoutes } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.sample,
  title: "Sample Share Profile and Safety Profile | MyPetLink",
  description: "See a sample Share Profile and a sample Safety Profile side by side: everyday pet sharing, and how a finder contacts an owner.",
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
            description="A worked example of both pages a Pet Profile publishes: the one an owner shares, and the one a finder opens to contact them."
            eyebrow="Sample experience"
            title="See how Share Profiles and Safety Profiles work"
          />
          <SampleExperience />
        </div>
      </section>
    </PublicLayout>
  );
}
