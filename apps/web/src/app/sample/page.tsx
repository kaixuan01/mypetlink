import type { Metadata } from "next";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { marketingRoutes, publicRoutes, samplePet } from "@/lib/routes";
import { createMarketingMetadata } from "@/lib/seo";
import { getPublicPetProfileByPublicCode } from "@/services/petService";

export const metadata: Metadata = createMarketingMetadata({
  path: marketingRoutes.sample,
  title: "Topu Sample Pet Profile and QR Safety Page | MyPetLink",
  description:
    "Explore Topu's sample Public Share Profile and QR Safety Page to see the difference between everyday pet sharing and finder contact.",
});

export default async function SamplePage() {
  const profile = await getPublicPetProfileByPublicCode(samplePet.publicCode);
  // Fall back to the static sample pet so the sample cards always render (and
  // link correctly) even where the live profile is not fetched at build time.
  const pet = profile.data ?? samplePet;

  return (
    <PublicLayout>
      <section className="brand-blue-section px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            eyebrow="Sample experiences"
            title="See MyPetLink in two real situations"
            description="See the friendly profile owners share, and the QR Safety Page a finder can use to contact the owner quickly."
          />
          {(
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="brand-card overflow-hidden rounded-[2rem]">
                <div className="brand-paw-dots bg-pet-apricot p-6">
                  <div className="flex items-center gap-4">
                    <PetAvatar pet={pet} size="lg" />
                    <div>
                      <p className="text-sm font-bold uppercase text-pet-coral">
                        Public Share Profile
                      </p>
                      <h2 className="mt-2 text-3xl font-black text-pet-ink">
                        {pet.name}&apos;s mini website
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-pet-muted">
                        A warm pet page for family and friends, with approved
                        details, moments, care badges, and a shareable link.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 p-6">
                  {[
                    "Cute pet intro and favourite things",
                    "Public moments and life timeline",
                    "Only owner-approved details are shown",
                  ].map((item) => (
                    <div
                      className="flex items-center gap-3 rounded-2xl bg-pet-cream px-4 py-3 text-sm font-bold text-pet-ink"
                      key={item}
                    >
                      <Icon name="heart" className="h-4 w-4 text-pet-coral" />
                      {item}
                    </div>
                  ))}
                  <CTAButton
                    href={publicRoutes.publicProfile(pet)}
                    icon="heart"
                    className="mt-2"
                  >
                    View Sample Public Profile
                  </CTAButton>
                </div>
              </article>

              <article className="brand-card overflow-hidden rounded-[2rem]">
                <div className="brand-paw-dots bg-[#e8f3ff] p-6">
                  <div className="flex items-center gap-4">
                    <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[2rem] border-4 border-white bg-white text-pet-teal shadow-lg">
                      <Icon name="qr" className="h-10 w-10" />
                    </span>
                    <div>
                      <p className="text-sm font-bold uppercase text-pet-teal">
                        QR Safety Page
                      </p>
                      <h2 className="mt-2 text-3xl font-black text-pet-ink">
                        Found {pet.name}?
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-pet-muted">
                        A contact-focused pet page for finders, with large
                        action buttons and safe location guidance.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 p-6">
                  {[
                    "WhatsApp owner, call owner, and found-location actions",
                    "Safety note, emergency note, and general area",
                    "No full owner address shown",
                  ].map((item) => (
                    <div
                      className="flex items-center gap-3 rounded-2xl bg-pet-cream px-4 py-3 text-sm font-bold text-pet-ink"
                      key={item}
                    >
                      <Icon name="shield" className="h-4 w-4 text-pet-teal" />
                      {item}
                    </div>
                  ))}
                  <CTAButton
                    href={publicRoutes.qrSafetyPage(pet)}
                    icon="qr"
                    variant="coral"
                    className="mt-2"
                  >
                    View Sample QR Safety Page
                  </CTAButton>
                </div>
              </article>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
