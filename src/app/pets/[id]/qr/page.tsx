import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import { ProfileAccessStatus } from "@/components/portal/ProfileAccessStatus";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { ownerRoutes } from "@/lib/routes";
import { getPetById } from "@/services/petService";
import { getPetTags } from "@/services/tagService";

type PetQrPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "QR Safety Page",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function PetQrPage({ params }: PetQrPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const tags = await getPetTags(pet.data.id);
  const activeTags = tags.data.filter(
    (tag) => tag.status === "Active" && !tag.isArchived
  );

  return (
    <AppLayout>
      <PageHeader
        eyebrow="QR Safety Page"
        title={`${pet.data.name}'s finder-first safety page`}
        description="This pet-level page works independently from physical tag status. Use Smart Tags to manage printed tag scan links separately."
        action={
          <CTAButton href={ownerRoutes.petEdit(pet.data.id)} icon="settings">
            Edit Safety Settings
          </CTAButton>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-5">
          <ShareProfileLink
            label="QR Safety Page URL"
            path={pet.data.qrSafetyPath}
            petName={pet.data.name}
            showShareButton
          />

          <ProfileAccessStatus
            finderProfileUrl={pet.data.qrSafetyPath}
            qrStatus={pet.data.qrStatus}
            tags={tags.data}
          />
        </div>

        <section className="brand-card rounded-[1.75rem] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-pet-ink">
                Physical tags
              </h2>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                Tags are scan entry points. Active tags open this QR Safety
                Page; lost, disabled, replaced, or archived tags show an
                inactive tag page.
              </p>
            </div>
            <Badge tone={activeTags.length ? "mint" : "soft"}>
              {activeTags.length ? "Active tag" : "No active tag"}
            </Badge>
          </div>

          <div className="mt-5 grid gap-3">
            <CTAButton
              href={pet.data.qrSafetyPath}
              icon="qr"
              target="_blank"
              rel="noopener noreferrer"
              fullWidth
            >
              View QR Safety Page
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petTags(pet.data.id)}
              icon="tag"
              variant="outline"
              fullWidth
            >
              Manage Physical Tags
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petTagOrder(pet.data.id)}
              icon="tag"
              variant="secondary"
              fullWidth
            >
              Order Physical Tag
            </CTAButton>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
