import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layouts/AppLayout";
import {
  getQrStatusLabel,
  ProfileAccessBadges,
  ProfileAccessStatus,
} from "@/components/portal/ProfileAccessStatus";
import { QRDownloadButton } from "@/components/portal/QRDownloadButton";
import { QRPreviewCard } from "@/components/QRPreviewCard";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { staticPetIdParams } from "@/data/staticRouteParams";
import { getPetProfileTheme } from "@/lib/petProfileThemes";
import { getPetById } from "@/services/petService";
import { getPetTags } from "@/services/tagService";

type QRPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "QR Profile",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return staticPetIdParams();
}

export default async function QRPage({ params }: QRPageProps) {
  const { id } = await params;
  const pet = await getPetById(id);

  if (!pet.data) {
    notFound();
  }

  const tags = await getPetTags(pet.data.id);
  const activeTags = tags.data.filter((tag) => tag.status === "Active");
  const pendingTags = tags.data.filter((tag) => tag.status === "Pending");
  const publicProfileTheme = getPetProfileTheme(pet.data.profileTheme);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="QR profile"
        title={`${pet.data.name}'s public finder page`}
        description="Your pet profile can be opened by scanning the QR code. A physical tag helps others contact you quickly if your pet is found."
        action={
          <CTAButton href={pet.data.finderProfileUrl} icon="qr" target="_blank">
            Open QR Profile
          </CTAButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <QRPreviewCard pet={pet.data} />
        <div className="grid content-start gap-5">
          <section className="brand-card rounded-[1.75rem] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-pet-muted">
                  Profile access
                </p>
                <p className="mt-2 text-2xl font-black text-pet-ink">
                  {getQrStatusLabel(pet.data.qrStatus)}
                </p>
              </div>
              <ProfileAccessBadges
                className="justify-end"
                qrStatus={pet.data.qrStatus}
              />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.25rem] bg-pet-cream p-4">
                <p className="text-sm font-black text-pet-ink">
                  Public profile
                </p>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  A cute profile for friends and family, with approved moments,
                  favourite things, and public-safe care badges.
                </p>
              </div>
              <div className="rounded-[1.25rem] bg-[#e8f3ff] p-4">
                <p className="text-sm font-black text-pet-ink">
                  Safety tag page
                </p>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  A focused QR/NFC page for finders, with contact buttons and
                  safety notes only.
                </p>
              </div>
            </div>
            <ShareProfileLink
              className="mt-5"
              label="Finder safety page link"
              path={pet.data.finderProfileUrl}
              petName={pet.data.name}
            />
            <div className="mt-3 rounded-[1.25rem] bg-[#e8f3ff] p-4">
              <ShareProfileLink
                label="Public share profile link"
                path={pet.data.publicProfileUrl}
                petName={pet.data.name}
              />
            </div>
          </section>

          <section className="brand-card rounded-[1.75rem] p-6">
            <h2 className="text-lg font-black text-pet-ink">Tag status</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatusBox label="QR status" value={getQrStatusLabel(pet.data.qrStatus)} />
              <StatusBox
                label="Public profile theme"
                value={publicProfileTheme.name}
              />
              <StatusBox label="Active tags" value={activeTags.length} />
              <StatusBox label="Pending tags" value={pendingTags.length} />
            </div>
            <p className="mt-4 text-sm leading-6 text-pet-muted">
              NFC smart tags open the same safe profile with a simple tap.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <QRDownloadButton pet={pet.data} />
              <CTAButton
                href={`/pets/${pet.data.id}/tags/order?type=qr`}
                icon="tag"
                variant="outline"
                fullWidth
              >
                Order MyPetLink QR Tag
              </CTAButton>
              <CTAButton
                href={`/pets/${pet.data.id}/tags/order?type=nfc`}
                icon="tag"
                fullWidth
              >
                Order MyPetLink QR + NFC Smart Tag
              </CTAButton>
            </div>
          </section>

          <FormSection
            title="Visibility settings"
            description="These settings are maintained from the pet profile form and control what appears publicly."
          >
            <div className="grid gap-3">
              {[
                ["Show owner display name", pet.data.visibility.showOwnerName],
                ["Show general area", pet.data.visibility.showGeneralArea],
                ["Show WhatsApp contact", pet.data.visibility.showWhatsapp],
                ["Show call contact", pet.data.visibility.showPhone],
                ["Show emergency note", pet.data.visibility.showEmergencyNote],
                ["Show care badges", pet.data.visibility.showCareBadges],
                ["Show public moments", pet.data.visibility.showMoments],
                ["Show life timeline", pet.data.visibility.showTimeline],
                [
                  "Show birthday in Life Timeline",
                  pet.data.visibility.showBirthdayOnTimeline,
                ],
                [
                  "Show adoption day in Life Timeline",
                  pet.data.visibility.showAdoptionDayOnTimeline,
                ],
                [
                  "Allow public care record details",
                  pet.data.visibility.showHealthSummary,
                ],
              ].map(([label, checked]) => (
                <label
                  className="flex items-center justify-between gap-3 rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink"
                  key={label as string}
                >
                  {label as string}
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      checked
                        ? "bg-[#e8f8f0] text-pet-sage"
                        : "bg-pet-apricot text-[#9b4037]"
                    }`}
                  >
                    {checked ? "Shown" : "Hidden"}
                  </span>
                </label>
              ))}
            </div>
            <CTAButton
              href={`/pets/${pet.data.id}/edit`}
              className="mt-5"
              icon="settings"
              variant="secondary"
            >
              Edit Profile Visibility
            </CTAButton>
          </FormSection>

          <ProfileAccessStatus qrStatus={pet.data.qrStatus} />

          <section className="rounded-[1.5rem] border border-pet-mint bg-[#e8f8f0] p-5">
            <h2 className="text-lg font-black text-pet-ink">
              Safety details shown to finders
            </h2>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              The finder page should show only pet identity, general area,
              safety note, and contact actions. Full address and private health
              records remain owner-only by default.
            </p>
            <div className="mt-4 grid gap-3">
              <StatusBox label="General area" value={pet.data.generalArea} />
              <StatusBox label="Safety note" value={pet.data.safetyNote} />
              <StatusBox
                label="Emergency note"
                value={pet.data.emergencyNote}
              />
              <StatusBox
                label="Contact preference"
                value={pet.data.contactPreference}
              />
              <StatusBox
                label="Owner display"
                value={
                  pet.data.visibility.showOwnerName
                    ? pet.data.owner.name || `${pet.data.name}'s owner`
                    : `${pet.data.name}'s owner`
                }
              />
            </div>
            <CTAButton
              href={`/pets/${pet.data.id}/edit`}
              className="mt-5"
              icon="settings"
              variant="secondary"
            >
              Edit Safety Info
            </CTAButton>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function StatusBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
      <p className="mt-1 text-lg font-black text-pet-ink">{value}</p>
    </div>
  );
}
