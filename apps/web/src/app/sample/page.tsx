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
          <PageHeader eyebrow="Sample experiences" title="See MyPetLink in two real situations" description="See the friendly profile owners share, and the Safety Profile a finder can use to contact the owner quickly." />
          <SampleExperience />
        </div>
      </section>
    </PublicLayout>
  );
}
