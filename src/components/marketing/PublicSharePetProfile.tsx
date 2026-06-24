"use client";

import { useEffect, useState } from "react";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { getPublicPetMoments } from "@/services/momentService";
import { getPublicPetProfile } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type { CareRecord, Pet, PetMoment, PublicPetProfile } from "@/types";

type PublicSharePetProfileProps = {
  initialProfile: PublicPetProfile;
  initialMoments: PetMoment[];
  initialRecords: CareRecord[];
};

const fallbackVisibility: Pet["visibility"] = {
  showOwnerName: true,
  showGeneralArea: true,
  showPhone: true,
  showWhatsapp: true,
  showEmergencyNote: true,
  showCareBadges: true,
  showMoments: true,
  showTimeline: true,
  showHealthSummary: false,
};

export function PublicSharePetProfile({
  initialProfile,
  initialMoments,
  initialRecords,
}: PublicSharePetProfileProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [moments, setMoments] = useState(initialMoments);
  const [records, setRecords] = useState(initialRecords);
  const visibility = mergeVisibility(profile.visibility);
  const publicMoments = visibility.showMoments ? moments : [];
  const timelineMoments = visibility.showTimeline ? moments.slice(0, 3) : [];
  const careRecords = visibility.showCareBadges ? records.slice(0, 3) : [];
  const profilePath = profile.publicProfileUrl || `/p/${profile.slug}`;
  const contactPreference = profile.contactPreference ?? "WhatsApp preferred";
  const coverTone = profile.coverTone ?? "sky";
  const summaryCards: { label: string; value: string; icon: IconName }[] = [
    {
      label: "Profile visibility",
      value: "Owner controls what appears publicly",
      icon: "shield",
    },
    {
      label: "Care records",
      value: `${records.length} owner-managed records`,
      icon: "record",
    },
    {
      label: "Public moments",
      value: `${moments.length} public memories`,
      icon: "heart",
    },
    {
      label: "QR safety",
      value: contactPreference,
      icon: "qr",
    },
  ];

  useEffect(() => {
    let active = true;

    getPublicPetProfile(initialProfile.slug).then(async (profileResponse) => {
      if (!active) {
        return;
      }

      const nextProfile = profileResponse.data ?? initialProfile;
      setProfile(nextProfile);

      const [momentsResponse, recordsResponse] = await Promise.all([
        getPublicPetMoments(nextProfile.id),
        getPetRecords(nextProfile.id),
      ]);

      if (!active) {
        return;
      }

      setMoments(momentsResponse.data);
      setRecords(recordsResponse.data);
    });

    return () => {
      active = false;
    };
  }, [initialProfile]);

  return (
    <article className="min-h-screen overflow-hidden bg-pet-cream">
      <section className="brand-peach-section relative">
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end lg:px-8">
          <div>
            <Badge tone="warm">Shareable pet page</Badge>
            <h1 className="mt-5 text-4xl font-black leading-tight text-pet-ink sm:text-5xl">
              {profile.name}&apos;s little corner on MyPetLink
            </h1>
            <p className="mt-4 max-w-2xl text-lg font-semibold leading-8 text-pet-ink">
              A little page for {profile.name}&apos;s photos, moments, care
              notes, and favourite things.
            </p>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-pet-muted">
              {profile.bio}
            </p>
            <p className="mt-6 text-xs font-bold uppercase text-pet-coral">
              Personality
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.personalityTags.map((tag) => (
                <Badge key={tag} tone="mint">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="mt-5 rounded-[1.25rem] bg-white/80 p-4 text-sm font-semibold leading-6 text-pet-muted">
              Only owner-approved public details are shown here. Full addresses
              and private care records stay out of this profile.
            </p>
            <div className="mt-8 grid gap-3">
              <ShareProfileLink
                path={profilePath}
                petName={profile.name}
                showShareButton
              />
              <div className="flex flex-col gap-3 sm:flex-row">
                <CTAButton
                  href={profile.finderProfileUrl}
                  icon="qr"
                  variant="primary"
                >
                  QR Safety Page
                </CTAButton>
              </div>
            </div>
          </div>

          <div className="brand-card overflow-hidden rounded-[2rem]">
            <div
              className={`brand-paw-dots flex min-h-60 items-end justify-between gap-4 p-6 ${coverToneClasses[coverTone]}`}
            >
              <div className="rounded-3xl bg-white/90 px-4 py-3 text-sm font-extrabold text-pet-ink shadow-sm">
                {profile.coverPhotoLabel || `${profile.name}'s cover photo`}
              </div>
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-pet-coral shadow-sm">
                <Icon name="heart" className="h-6 w-6" />
              </span>
            </div>
            <div className="px-6 pb-6">
              <div className="-mt-16 flex flex-col gap-5 sm:flex-row sm:items-end">
                <PetAvatar pet={profile} size="xl" />
                <div className="rounded-[1.5rem] bg-white/95 p-4 shadow-sm">
                  <p className="text-sm font-bold text-pet-muted">
                    {profile.profilePhotoLabel || "Profile photo"}
                  </p>
                  <p className="mt-1 text-2xl font-black text-pet-ink">
                    {profile.species} - {profile.breed}
                  </p>
                  <p className="mt-1 text-sm font-bold text-pet-muted">
                    {profile.gender} - {profile.ageLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3 lg:grid-cols-5 lg:px-8">
          <InfoTile label="Pet Type" value={profile.species} />
          <InfoTile label="Breed" value={profile.breed} />
          <InfoTile label="Gender" value={profile.gender} />
          <InfoTile label="Color" value={profile.color} />
          <InfoTile label="Age" value={profile.ageLabel} />
          <InfoTile label="Birthday" value={profile.birthday} />
          <InfoTile label="Adoption Day" value={profile.adoptionDay} />
          <InfoTile label="Favourite Food" value={profile.favoriteFood} />
              <InfoTile label="Favourite Toy" value={profile.favoriteToy} />
              <InfoTile label="Contact" value={contactPreference} />
        </div>
      </section>

      <section className="bg-pet-cream">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div className="brand-card rounded-[1.75rem] p-6">
            <p className="text-sm font-bold uppercase text-pet-coral">
              About and safety
            </p>
            <h2 className="mt-2 text-3xl font-black text-pet-ink">
              Helpful details for people who care about {profile.name}.
            </h2>
            <div className="mt-6 grid gap-3">
              {visibility.showOwnerName ? (
                <SafetyTile
                  icon="heart"
                  label="Owner"
                  value={`Cared for by ${profile.owner.name}`}
                />
              ) : null}
              {visibility.showGeneralArea ? (
                <SafetyTile
                  icon="pin"
                  label="General area"
                  value={profile.generalArea}
                />
              ) : null}
              <SafetyTile
                icon="shield"
                label="Safety note"
                value={profile.safetyNote}
              />
              {visibility.showEmergencyNote ? (
                <SafetyTile
                  icon="record"
                  label="Emergency note"
                  value={profile.emergencyNote}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-5">
            <section className="brand-card rounded-[1.75rem] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase text-pet-coral">
                    Care badges
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-pet-ink">
                    Care notes saved by the owner
                  </h2>
                </div>
                {visibility.showHealthSummary ? (
                  <Badge tone="teal">{records.length} records</Badge>
                ) : null}
              </div>
              {careRecords.length ? (
                <div className="mt-5 grid gap-3">
                  {careRecords.map((record) => (
                    <div
                      className="rounded-[1.25rem] bg-pet-cream p-4"
                      key={record.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="mint">{record.type}</Badge>
                        <span className="text-xs font-bold text-pet-muted">
                          {record.date}
                        </span>
                      </div>
                      <p className="mt-2 font-black text-pet-ink">
                        {record.title}
                      </p>
                      {visibility.showHealthSummary ? (
                        <p className="mt-1 text-sm leading-6 text-pet-muted">
                          {record.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[1.25rem] border border-dashed border-pet-border bg-pet-cream p-5 text-sm text-pet-muted">
                  Care badges will appear when care records are added.
                </div>
              )}
            </section>

            {visibility.showTimeline ? (
              <section className="brand-soft-card rounded-[1.75rem] p-6">
                <p className="text-sm font-bold uppercase text-pet-coral">
                  Life timeline
                </p>
                <h2 className="mt-2 text-2xl font-black text-pet-ink">
                  Little milestones from {profile.name}&apos;s life
                </h2>
                {timelineMoments.length ? (
                  <div className="mt-5 grid gap-3">
                    {timelineMoments.map((moment, index) => (
                      <div
                        className="grid gap-3 rounded-[1.25rem] bg-white p-4 shadow-sm sm:grid-cols-[48px_1fr]"
                        key={moment.id}
                      >
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pet-apricot text-sm font-black text-pet-coral">
                          <Icon
                            name={index === 0 ? "heart" : "paw"}
                            className="h-5 w-5"
                          />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-pet-muted">
                            {moment.date}
                          </p>
                          <p className="mt-1 font-black text-pet-ink">
                            {moment.title}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-pet-muted">
                    Public milestones will appear when moments are added.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </section>

      {visibility.showMoments ? (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-pet-coral">
                  Pet Moments
                </p>
                <h2 className="mt-2 text-3xl font-black text-pet-ink">
                  Save the little moments that make {profile.name} special.
                </h2>
              </div>
            </div>
            {publicMoments.length ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publicMoments.map((moment) => (
                  <PetMomentCard key={moment.id} moment={moment} publicView />
                ))}
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[#dfc9b3] bg-pet-cream p-8 text-center text-sm text-pet-muted">
                {profile.name}&apos;s public memories will appear here.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="brand-blue-section">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div className="brand-card rounded-[1.5rem] p-5" key={card.label}>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
                  <Icon name={card.icon} className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-bold uppercase text-pet-muted">
                  {card.label}
                </p>
                <p className="mt-1 text-lg font-black text-pet-ink">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="brand-soft-card rounded-[1.5rem] p-5">
      <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
      <p className="mt-2 text-lg font-black text-pet-ink">{value}</p>
    </div>
  );
}

function SafetyTile({
  icon,
  label,
  value,
}: {
  icon: "heart" | "pin" | "shield" | "record";
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
        <Icon name={icon} className="h-4 w-4 text-pet-coral" />
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-pet-muted">{value}</p>
    </div>
  );
}

const coverToneClasses: Record<Pet["coverTone"], string> = {
  apricot: "bg-pet-apricot",
  mint: "bg-[#e8f8f0]",
  sky: "bg-[#e8f3ff]",
};

function mergeVisibility(
  visibility?: Partial<Pet["visibility"]>
): Pet["visibility"] {
  return {
    ...fallbackVisibility,
    ...visibility,
  };
}
