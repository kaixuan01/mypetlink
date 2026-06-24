"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  getPetProfileTheme,
  type PetProfileTheme,
} from "@/lib/petProfileThemes";
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
  showBirthdayOnTimeline: true,
  showAdoptionDayOnTimeline: true,
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
  const theme = getPetProfileTheme(profile.profileTheme);
  const publicTimelineMoments = moments.filter(
    (moment) =>
      moment.visibility === "Public" && moment.showInLifeTimeline
  );
  const publicMemoryMoments = moments.filter(
    (moment) =>
      moment.visibility === "Public" && moment.showOnPublicProfile
  );
  const publicMoments = visibility.showMoments ? publicMemoryMoments : [];
  const timelineItems = visibility.showTimeline
    ? buildTimelineItems(profile, publicTimelineMoments, visibility).slice(0, 5)
    : [];
  const careRecords = visibility.showCareBadges
    ? records
        .filter((record) => record.publicVisibility !== "Private")
        .slice(0, 3)
    : [];
  const profilePath = profile.publicProfileUrl || `/p/${profile.slug}`;
  const contactPreference = profile.contactPreference ?? "WhatsApp preferred";
  const summaryCards: { label: string; value: string; icon: IconName }[] = [
    {
      label: "Profile visibility",
      value: "Owner controls what appears publicly",
      icon: "shield",
    },
    {
      label: "Care records",
      value: `${careRecords.length} public-safe badges`,
      icon: "record",
    },
    {
      label: "Public moments",
      value: `${publicMoments.length} public memories`,
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
    <article
      className="min-h-screen overflow-hidden bg-pet-cream"
      style={{
        background: theme.gradients.page,
        color: theme.colors.text,
      }}
    >
      <header
        className="border-b border-pet-border bg-white/92 backdrop-blur"
        style={{ borderColor: theme.colors.border }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-11 w-auto max-w-[190px]" priority />
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CTAButton href="/login" icon="paw" variant="coral">
              Create Your Pet Profile
            </CTAButton>
          </div>
        </div>
      </header>
      <section
        className="relative"
        style={{ background: theme.gradients.page }}
      >
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end lg:px-8">
          <div>
            <ThemedBadge theme={theme}>Shareable pet page</ThemedBadge>
            <h1
              className="mt-5 text-4xl font-black leading-tight text-pet-ink sm:text-5xl"
              style={{ color: theme.colors.text }}
            >
              {profile.name}&apos;s little corner on MyPetLink
            </h1>
            <p
              className="mt-4 max-w-2xl text-lg font-semibold leading-8 text-pet-ink"
              style={{ color: theme.colors.text }}
            >
              A little page for {profile.name}&apos;s photos, moments, care
              notes, and favourite things.
            </p>
            <p
              className="mt-4 max-w-2xl text-lg leading-8 text-pet-muted"
              style={{ color: theme.colors.mutedText }}
            >
              {profile.bio}
            </p>
            <p
              className="mt-6 text-xs font-bold uppercase text-pet-coral"
              style={{ color: theme.colors.accent }}
            >
              Personality
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.personalityTags.map((tag) => (
                <ThemedBadge key={tag} theme={theme}>
                  {tag}
                </ThemedBadge>
              ))}
            </div>
            <p
              className="mt-5 rounded-[1.25rem] border bg-white/80 p-4 text-sm font-semibold leading-6 text-pet-muted"
              style={{
                background: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.mutedText,
              }}
            >
              Only owner-approved public details are shown here. Full addresses
              and private care records stay out of this profile.
            </p>
            <div className="mt-8 grid gap-3">
              <ShareProfileLink
                path={profilePath}
                petName={profile.name}
                showShareButton
                theme={theme}
              />
              <div className="flex flex-col gap-3 sm:flex-row">
                <ThemedLinkButton
                  href={profile.finderProfileUrl}
                  icon="qr"
                  theme={theme}
                >
                  QR Safety Page
                </ThemedLinkButton>
              </div>
            </div>
          </div>

          <PublicHeroCard profile={profile} theme={theme} />
        </div>
      </section>

      <section style={{ background: theme.colors.surface }}>
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3 lg:grid-cols-5 lg:px-8">
          <InfoTile label="Pet Type" theme={theme} value={profile.species} />
          <InfoTile label="Breed" theme={theme} value={profile.breed} />
          <InfoTile label="Gender" theme={theme} value={profile.gender} />
          <InfoTile label="Color" theme={theme} value={profile.color} />
          <InfoTile label="Age" theme={theme} value={profile.ageLabel} />
          <InfoTile label="Birthday" theme={theme} value={profile.birthday} />
          <InfoTile
            label="Adoption Day"
            theme={theme}
            value={profile.adoptionDay}
          />
          <InfoTile
            label="Favourite Food"
            theme={theme}
            value={profile.favoriteFood}
          />
          <InfoTile
            label="Favourite Toy"
            theme={theme}
            value={profile.favoriteToy}
          />
          <InfoTile label="Contact" theme={theme} value={contactPreference} />
        </div>
      </section>

      <section style={{ background: theme.colors.pageBackground }}>
        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div
            className="brand-card rounded-[1.75rem] p-6"
            style={{
              background: theme.colors.surface,
              borderColor: theme.colors.border,
            }}
          >
            <p
              className="text-sm font-bold uppercase text-pet-coral"
              style={{ color: theme.colors.accent }}
            >
              About and safety
            </p>
            <h2
              className="mt-2 text-3xl font-black text-pet-ink"
              style={{ color: theme.colors.text }}
            >
              Helpful details for people who care about {profile.name}.
            </h2>
            <div className="mt-6 grid gap-3">
              {visibility.showOwnerName ? (
                <SafetyTile
                  icon="heart"
                  label="Owner"
                  theme={theme}
                  value={`Cared for by ${getPublicOwnerName(
                    profile.owner.name,
                    profile.name
                  )}`}
                />
              ) : null}
              {visibility.showGeneralArea ? (
                <SafetyTile
                  icon="pin"
                  label="General area"
                  theme={theme}
                  value={profile.generalArea}
                />
              ) : null}
              <SafetyTile
                icon="shield"
                label="Safety note"
                theme={theme}
                value={profile.safetyNote}
              />
              {visibility.showEmergencyNote ? (
                <SafetyTile
                  icon="record"
                  label="Emergency note"
                  theme={theme}
                  value={profile.emergencyNote}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-5">
            <section
              className="brand-card rounded-[1.75rem] p-6"
              style={{
                background: theme.colors.surface,
                borderColor: theme.colors.border,
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p
                    className="text-sm font-bold uppercase text-pet-coral"
                    style={{ color: theme.colors.accent }}
                  >
                    Care badges
                  </p>
                  <h2
                    className="mt-2 text-2xl font-black text-pet-ink"
                    style={{ color: theme.colors.text }}
                  >
                    Care notes saved by the owner
                  </h2>
                  <p
                    className="mt-2 text-sm leading-6 text-pet-muted"
                    style={{ color: theme.colors.mutedText }}
                  >
                    Only owner-approved care badges are shown.
                  </p>
                </div>
                {visibility.showHealthSummary ? (
                  <ThemedBadge theme={theme}>{records.length} records</ThemedBadge>
                ) : null}
              </div>
              {careRecords.length ? (
                <div className="mt-5 grid gap-3">
                  {careRecords.map((record) => (
                    <div
                      className="rounded-[1.25rem] bg-pet-cream p-4"
                      style={{ background: theme.colors.surfaceAlt }}
                      key={record.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <ThemedBadge theme={theme}>{record.type}</ThemedBadge>
                        <span
                          className="text-xs font-bold text-pet-muted"
                          style={{ color: theme.colors.mutedText }}
                        >
                          {record.date}
                        </span>
                      </div>
                      {record.dueDate ? (
                        <p
                          className="mt-2 text-sm font-bold text-pet-muted"
                          style={{ color: theme.colors.mutedText }}
                        >
                          Next due {record.dueDate}
                        </p>
                      ) : null}
                      {record.publicVisibility === "Public details" &&
                      visibility.showHealthSummary ? (
                        <>
                          <p
                            className="mt-2 font-black text-pet-ink"
                            style={{ color: theme.colors.text }}
                          >
                            {record.title}
                          </p>
                          <p
                            className="mt-1 text-xs font-bold text-pet-muted"
                            style={{ color: theme.colors.mutedText }}
                          >
                            {record.provider}
                          </p>
                        </>
                      ) : null}
                      {record.publicVisibility === "Public details" &&
                      visibility.showHealthSummary ? (
                        <p
                          className="mt-1 text-sm leading-6 text-pet-muted"
                          style={{ color: theme.colors.mutedText }}
                        >
                          {record.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="mt-5 rounded-[1.25rem] border border-dashed border-pet-border bg-pet-cream p-5 text-sm text-pet-muted"
                  style={{
                    background: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                    color: theme.colors.mutedText,
                  }}
                >
                  Care badges will appear when care records are added.
                </div>
              )}
            </section>

            {visibility.showTimeline ? (
              <section
                className="brand-soft-card rounded-[1.75rem] p-6"
                style={{
                  background: theme.colors.surfaceAlt,
                  borderColor: theme.colors.border,
                }}
              >
                <p
                  className="text-sm font-bold uppercase text-pet-coral"
                  style={{ color: theme.colors.accent }}
                >
                  Life Timeline
                </p>
                <h2
                  className="mt-2 text-2xl font-black text-pet-ink"
                  style={{ color: theme.colors.text }}
                >
                  Milestones and special dates from {profile.name}&apos;s life.
                </h2>
                {timelineItems.length ? (
                  <div
                    className="mt-5 grid gap-3 border-l-2 pl-4"
                    style={{ borderColor: theme.colors.timelineLine }}
                  >
                    {timelineItems.map((item, index) => (
                      <div
                        className="grid gap-3 rounded-[1.25rem] bg-white p-4 shadow-sm sm:grid-cols-[48px_1fr]"
                        style={{ background: theme.colors.surface }}
                        key={item.id}
                      >
                        <span
                          className="grid h-12 w-12 place-items-center rounded-2xl bg-pet-apricot text-sm font-black text-pet-coral"
                          style={{
                            background: theme.colors.accentSoft,
                            color: theme.colors.timelineDot,
                          }}
                        >
                          <Icon
                            name={index === 0 ? "heart" : item.icon}
                            className="h-5 w-5"
                          />
                        </span>
                        <div>
                          <p
                            className="text-xs font-bold text-pet-muted"
                            style={{ color: theme.colors.mutedText }}
                          >
                            {item.date}
                          </p>
                          <p
                            className="mt-1 font-black text-pet-ink"
                            style={{ color: theme.colors.text }}
                          >
                            {item.title}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p
                    className="mt-4 text-sm leading-6 text-pet-muted"
                    style={{ color: theme.colors.mutedText }}
                  >
                    Public milestones will appear when moments are added.
                  </p>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </section>

      {visibility.showMoments ? (
        <section style={{ background: theme.colors.surface }}>
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-sm font-bold uppercase text-pet-coral"
                  style={{ color: theme.colors.accent }}
                >
                  Pet Memories
                </p>
                <h2
                  className="mt-2 text-3xl font-black text-pet-ink"
                  style={{ color: theme.colors.text }}
                >
                  Photos, videos, and little stories shared by{" "}
                  {profile.name}&apos;s owner.
                </h2>
              </div>
            </div>
            {publicMoments.length ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publicMoments.map((moment) => (
                  <PetMomentCard
                    key={moment.id}
                    moment={moment}
                    publicView
                    theme={theme}
                  />
                ))}
              </div>
            ) : (
              <div
                className="rounded-[1.5rem] border border-dashed border-[#dfc9b3] bg-pet-cream p-8 text-center text-sm text-pet-muted"
                style={{
                  background: theme.colors.surfaceAlt,
                  borderColor: theme.colors.border,
                  color: theme.colors.mutedText,
                }}
              >
                {profile.name}&apos;s public memories will appear here.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section style={{ background: theme.colors.primarySoft }}>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                className="brand-card rounded-[1.5rem] p-5"
                key={card.label}
                style={{
                  background: theme.colors.surface,
                  borderColor: theme.colors.border,
                }}
              >
                <span
                  className="grid h-10 w-10 place-items-center rounded-2xl bg-pet-apricot text-pet-coral"
                  style={{
                    background: theme.colors.accentSoft,
                    color: theme.colors.accent,
                  }}
                >
                  <Icon name={card.icon} className="h-5 w-5" />
                </span>
                <p
                  className="mt-4 text-sm font-bold uppercase text-pet-muted"
                  style={{ color: theme.colors.mutedText }}
                >
                  {card.label}
                </p>
                <p
                  className="mt-1 text-lg font-black text-pet-ink"
                  style={{ color: theme.colors.text }}
                >
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

function PublicHeroCard({
  profile,
  theme,
}: {
  profile: PublicPetProfile;
  theme: PetProfileTheme;
}) {
  const featuredTags = profile.personalityTags.slice(0, 3);

  return (
    <aside
      className="brand-card w-full max-w-[520px] justify-self-center overflow-hidden rounded-[1.75rem] p-3 sm:p-4 lg:justify-self-end"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="relative">
        <div
          className="relative h-[150px] overflow-hidden rounded-[1.45rem] sm:h-[180px]"
          style={{ background: theme.gradients.cover }}
        >
          <div
            className="absolute inset-0"
            style={{ background: theme.gradients.decorative }}
          />
          <span
            aria-hidden="true"
            className="absolute left-6 top-7 grid h-9 w-9 -rotate-6 place-items-center rounded-2xl bg-white/55 text-pet-coral"
            style={{ color: theme.colors.accent }}
          >
            <Icon name="heart" className="h-4 w-4" />
          </span>
          <span
            aria-hidden="true"
            className="absolute bottom-6 right-8 grid h-10 w-10 rotate-6 place-items-center rounded-2xl bg-white/55 text-pet-teal"
            style={{ color: theme.colors.primary }}
          >
            <Icon name="paw" className="h-5 w-5" />
          </span>
          <span
            className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-2 text-xs font-black text-pet-coral shadow-sm"
            style={{ color: theme.colors.accent }}
          >
            <Icon name="heart" className="h-4 w-4" />
            Loved
          </span>
        </div>

        <div
          className="absolute -bottom-10 left-1/2 z-10 grid h-20 w-20 -translate-x-1/2 place-items-center rounded-[1.55rem] border-[5px] border-white bg-white text-pet-coral shadow-lg shadow-[#0d1b3d]/12 sm:h-24 sm:w-24 sm:rounded-[1.75rem]"
          style={{
            borderColor: theme.colors.surface,
            color: theme.colors.accent,
          }}
        >
          <div
            className="absolute inset-2 rounded-[1.15rem] sm:rounded-[1.35rem]"
            style={{ background: theme.colors.accentSoft }}
          />
          <div className="relative z-10 grid place-items-center text-center">
            <Icon name="paw" className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="mt-0.5 text-lg font-black leading-none sm:text-xl">
              {profile.photoInitial}
            </span>
          </div>
        </div>
      </div>

      <div className="px-2 pb-3 pt-14 text-center sm:px-4 sm:pt-16">
        <h2
          className="text-3xl font-black leading-tight text-pet-ink"
          style={{ color: theme.colors.text }}
        >
          {profile.name}
        </h2>
        <p
          className="mt-2 text-sm font-bold text-pet-muted"
          style={{ color: theme.colors.mutedText }}
        >
          {profile.species}
          {" \u00b7 "}
          {profile.breed}
        </p>
        <p
          className="mt-1 text-sm font-bold text-pet-muted"
          style={{ color: theme.colors.mutedText }}
        >
          {profile.gender}
          {" \u00b7 "}
          {profile.ageLabel}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {featuredTags.map((tag) => (
            <ThemedBadge key={tag} theme={theme}>
              {tag}
            </ThemedBadge>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniDetail label="Birthday" theme={theme} value={profile.birthday} />
          <MiniDetail
            label="Favourite"
            theme={theme}
            value={profile.favoriteToy}
          />
        </div>
      </div>
    </aside>
  );
}

function MiniDetail({
  label,
  theme,
  value,
}: {
  label: string;
  theme: PetProfileTheme;
  value: string;
}) {
  return (
    <div
      className="rounded-[1.1rem] bg-pet-cream px-4 py-3"
      style={{ background: theme.colors.surfaceAlt }}
    >
      <p
        className="text-xs font-bold uppercase text-pet-muted"
        style={{ color: theme.colors.mutedText }}
      >
        {label}
      </p>
      <p
        className="mt-1 break-words text-sm font-black text-pet-ink"
        style={{ color: theme.colors.text }}
      >
        {value}
      </p>
    </div>
  );
}

function InfoTile({
  label,
  theme,
  value,
}: {
  label: string;
  theme: PetProfileTheme;
  value: string;
}) {
  return (
    <div
      className="brand-soft-card rounded-[1.5rem] p-5"
      style={{
        background: theme.colors.surfaceAlt,
        borderColor: theme.colors.border,
      }}
    >
      <p
        className="text-xs font-bold uppercase text-pet-muted"
        style={{ color: theme.colors.mutedText }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-lg font-black text-pet-ink"
        style={{ color: theme.colors.text }}
      >
        {value}
      </p>
    </div>
  );
}

function SafetyTile({
  icon,
  label,
  theme,
  value,
}: {
  icon: "heart" | "pin" | "shield" | "record";
  label: string;
  theme: PetProfileTheme;
  value: string;
}) {
  return (
    <div
      className="rounded-[1.25rem] bg-pet-cream p-4"
      style={{ background: theme.colors.surfaceAlt }}
    >
      <div
        className="flex items-center gap-2 text-sm font-black text-pet-ink"
        style={{ color: theme.colors.text }}
      >
        <Icon
          name={icon}
          className="h-4 w-4 text-pet-coral"
          style={{ color: theme.colors.accent }}
        />
        {label}
      </div>
      <p
        className="mt-2 text-sm leading-6 text-pet-muted"
        style={{ color: theme.colors.mutedText }}
      >
        {value}
      </p>
    </div>
  );
}

function ThemedBadge({
  children,
  theme,
}: {
  children: ReactNode;
  theme: PetProfileTheme;
}) {
  return (
    <span
      className="inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-black"
      style={{
        background: theme.colors.badgeBackground,
        color: theme.colors.primary,
      }}
    >
      {children}
    </span>
  );
}

function ThemedLinkButton({
  children,
  href,
  icon,
  theme,
}: {
  children: ReactNode;
  href: string;
  icon: IconName;
  theme: PetProfileTheme;
}) {
  return (
    <Link
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-extrabold shadow-lg shadow-[#0d1b3d]/10 transition"
      href={href}
      style={{
        background: theme.colors.buttonBackground,
        borderColor: theme.colors.buttonBackground,
        color: theme.colors.buttonText,
      }}
    >
      <Icon name={icon} className="h-4 w-4" />
      {children}
    </Link>
  );
}

function mergeVisibility(
  visibility?: Partial<Pet["visibility"]>
): Pet["visibility"] {
  return {
    ...fallbackVisibility,
    ...visibility,
  };
}

function getPublicOwnerName(name: string, petName: string) {
  return name.trim() || `${petName}'s owner`;
}

function buildTimelineItems(
  profile: PublicPetProfile,
  publicMoments: PetMoment[],
  visibility: Pet["visibility"]
) {
  const items: {
    date: string;
    icon: "heart" | "paw";
    id: string;
    title: string;
  }[] = [];

  if (visibility.showBirthdayOnTimeline && profile.birthday !== "Not set") {
    items.push({
      date: profile.birthday,
      icon: "paw",
      id: `${profile.id}-birthday`,
      title: `${profile.name}'s birthday`,
    });
  }

  if (
    visibility.showAdoptionDayOnTimeline &&
    profile.adoptionDay !== "Not set"
  ) {
    items.push({
      date: profile.adoptionDay,
      icon: "heart",
      id: `${profile.id}-adoption`,
      title: `${profile.name}'s adoption day`,
    });
  }

  publicMoments
    .filter((moment) => moment.showInLifeTimeline)
    .forEach((moment) => {
      items.push({
        date: moment.date,
        icon: "paw",
        id: moment.id,
        title: moment.title,
      });
    });

  return items;
}
