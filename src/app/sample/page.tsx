import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { PublicFinderProfile } from "@/components/marketing/PublicFinderProfile";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPublicPetProfile } from "@/services/petService";

export const metadata: Metadata = {
  title: "Sample QR Profile",
};

export default async function SamplePage() {
  const profile = await getPublicPetProfile("milo");

  return (
    <PublicLayout>
      <section className="brand-blue-section px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            eyebrow="Sample finder page"
            title="What someone sees after scanning a QR tag"
            description="This sample shows safe public information only. Full addresses and private care records are not shown."
          />
          {profile.data ? <PublicFinderProfile pet={profile.data} /> : null}
        </div>
      </section>
    </PublicLayout>
  );
}
