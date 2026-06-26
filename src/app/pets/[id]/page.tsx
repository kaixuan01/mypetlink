import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import {
  getQrStatusLabel,
  ProfileAccessBadges,
} from "@/components/portal/ProfileAccessStatus";
import { RecordCard } from "@/components/portal/RecordCard";
import { QRPreviewCard } from "@/components/QRPreviewCard";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetMoments } from "@/services/momentService";
import { getPetById, getPetHealthSummary } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getPetTags } from "@/services/tagService";

type PetDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export async function generateMetadata({
  params,
}: PetDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const pet = await getPetById(id);

  return {
    title: pet.data ? `${pet.data.name} Profile` : "Pet Profile",
  };
}

export default async function PetDetailPage({ params }: PetDetailPageProps) {
  const { id } = await params;
  const petResponse = await getPetById(id);

  if (!petResponse.data) {
    notFound();
  }

  const pet = petResponse.data;
  const records = await getPetRecords(pet.id);
  const summary = await getPetHealthSummary(pet.id);
  const tags = await getPetTags(pet.id);
  const moments = await getPetMoments(pet.id);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Pet detail"
        title={`${pet.name}'s profile`}
        description="Owner-only profile details, emergency notes, health summary, and QR status."
        action={
          <CTAButton href={`/pets/${pet.id}/edit`} icon="settings">
            Edit Pet Info
          </CTAButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="brand-card rounded-[2rem] p-6">
          <div className="flex items-start gap-5">
            <PetAvatar pet={pet} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-black text-pet-ink">
                  {pet.name}
                </h2>
                <ProfileAccessBadges qrStatus={pet.qrStatus} />
              </div>
              <p className="mt-2 text-sm text-pet-muted">
                {pet.species} - {pet.breed} - {pet.color}
              </p>
              <p className="mt-1 text-sm text-pet-muted">{pet.ageLabel}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {[
              ["Owner contact", pet.owner.phone],
              ["Emergency contact", pet.owner.emergencyContact],
              ["General area", pet.generalArea],
            ].map(([label, value]) => (
              <div
                className="rounded-[1.25rem] bg-pet-cream p-4"
                key={label}
              >
                <p className="text-xs font-bold uppercase text-pet-muted">
                  {label}
                </p>
                <p className="mt-1 font-bold text-pet-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[1.25rem] bg-pet-apricot p-4">
            <p className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon name="shield" className="h-4 w-4 text-pet-coral" />
              Emergency note
            </p>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              {pet.emergencyNote}
            </p>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="brand-card rounded-[1.5rem] p-5">
              <p className="text-sm font-bold text-pet-muted">Records</p>
              <p className="mt-2 text-3xl font-black text-pet-ink">
                {summary.data.totalRecords}
              </p>
            </div>
            <div className="brand-card rounded-[1.5rem] p-5">
              <p className="text-sm font-bold text-pet-muted">Upcoming care</p>
              <p className="mt-2 text-3xl font-black text-pet-ink">
                {summary.data.upcomingCare}
              </p>
            </div>
            <div className="brand-card rounded-[1.5rem] p-5">
              <p className="text-sm font-bold text-pet-muted">
                Profile access
              </p>
              <p className="mt-2 text-3xl font-black text-pet-ink">
                {getQrStatusLabel(pet.qrStatus)}
              </p>
            </div>
          </div>
          <QRPreviewCard pet={pet} compact />
          <ShareProfileLink path={pet.publicProfilePath} petName={pet.name} />
        </section>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          {
            title: "Manage QR / Safety Profile",
            description: "Review the finder page, QR status, and contact actions.",
            href: `/pets/${pet.id}/qr`,
            icon: "shield" as const,
          },
          {
            title: "Public share profile preview",
            description: "Open the cute shareable profile for family and friends.",
            href: pet.publicProfilePath,
            icon: "heart" as const,
          },
          {
            title: "Manage Care Records",
            description: `${records.data.length} records saved for ${pet.name}.`,
            href: `/pets/${pet.id}/records`,
            icon: "record" as const,
          },
          {
            title: "Smart tags",
            description: `${tags.data.length} physical tags linked to this pet.`,
            href: `/pets/${pet.id}/tags`,
            icon: "tag" as const,
          },
          {
            title: "Add Pet Moment",
            description: `${moments.data.length} moments and memories saved.`,
            href: `/pets/${pet.id}/moments/new`,
            icon: "heart" as const,
          },
          {
            title: "Life timeline",
            description: "View milestones, care days, and memories in order.",
            href: `/pets/${pet.id}/timeline`,
            icon: "paw" as const,
          },
        ].map((item) => (
          <article
            className="brand-card rounded-[1.5rem] p-5"
            key={item.title}
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
              <Icon name={item.icon} className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-lg font-black text-pet-ink">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              {item.description}
            </p>
            <CTAButton href={item.href} variant="secondary" className="mt-4">
              Open
            </CTAButton>
          </article>
        ))}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black text-pet-ink">
            Latest care records
          </h2>
          <CTAButton href={`/pets/${pet.id}/records`} variant="secondary">
            View All Records
          </CTAButton>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {records.data.slice(0, 4).map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
