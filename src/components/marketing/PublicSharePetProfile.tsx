"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import {
  getPetProfileTheme,
  type PetProfileTheme,
} from "@/lib/petProfileThemes";
import { getPublicPetMoments } from "@/services/momentService";
import { getPublicPetProfileByPublicCode } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type { CareRecord, Pet, PetMoment, PublicPetProfile } from "@/types";

type PublicSharePetProfileProps = {
  initialProfile: PublicPetProfile;
  initialMoments: PetMoment[];
  initialRecords: CareRecord[];
};

type TabId = "about" | "notes" | "moments";

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
  const [activeTab, setActiveTab] = useState<TabId>("about");
  const [locationStatus, setLocationStatus] = useState("");

  const visibility = mergeVisibility(profile.visibility);
  const theme = getPetProfileTheme(profile.profileTheme);

  const ownerDisplayName = visibility.showOwnerName
    ? getPublicOwnerName(profile.owner.name, profile.name)
    : `${profile.name}'s owner`;
  const whatsappNumber = normalizeWhatsappNumber(profile.owner.whatsapp);
  const phoneHref = normalizePhoneHref(profile.owner.phone);
  const whatsappBaseUrl = `https://wa.me/${whatsappNumber}`;
  const introMessage = encodeURIComponent(
    `Hi, I found ${profile.name} from the MyPetLink profile.`
  );
  const canWhatsapp = visibility.showWhatsapp && Boolean(whatsappNumber);
  const canCall = visibility.showPhone && Boolean(phoneHref);

  const publicMoments = visibility.showMoments
    ? moments.filter(
        (moment) =>
          moment.visibility === "Public" && moment.showOnPublicProfile
      )
    : [];
  const careRecords = visibility.showCareBadges
    ? records.filter((record) => record.publicVisibility !== "Private").slice(0, 4)
    : [];

  useEffect(() => {
    let active = true;

    getPublicPetProfileByPublicCode(initialProfile.publicCode).then(
      async (profileResponse) => {
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
      }
    );

    return () => {
      active = false;
    };
  }, [initialProfile]);

  function openWhatsappWithMessage(text: string) {
    window.location.href = `${whatsappBaseUrl}?text=${encodeURIComponent(text)}`;
  }

  function handleSendFoundLocation() {
    if (!whatsappNumber) {
      return;
    }

    setLocationStatus("Asking your browser for location permission...");

    if (!navigator.geolocation) {
      setLocationStatus(
        "Location is not available here. A WhatsApp message is ready for you to type the location."
      );
      openWhatsappWithMessage(
        `Hi ${ownerDisplayName}, I found ${profile.name}. I can describe the found location here.`
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setLocationStatus("Location ready. Opening WhatsApp...");
        openWhatsappWithMessage(
          `Hi ${ownerDisplayName}, I found ${profile.name}. Found location: ${mapsUrl}`
        );
      },
      () => {
        setLocationStatus(
          "Location was not shared. A WhatsApp message is ready for you to type the location."
        );
        openWhatsappWithMessage(
          `Hi ${ownerDisplayName}, I found ${profile.name}. I can describe the found location here.`
        );
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "about", label: "About" },
    { id: "notes", label: "Notes" },
    { id: "moments", label: "Moments" },
  ];

  return (
    <article
      className="min-h-screen bg-pet-cream"
      style={{ background: theme.gradients.page, color: theme.colors.text }}
    >
      <header
        className="border-b border-pet-border bg-white/92 backdrop-blur"
        style={{ borderColor: theme.colors.border }}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-9 w-auto max-w-[160px]" priority />
          </Link>
          <span
            className="text-xs font-bold uppercase text-pet-muted"
            style={{ color: theme.colors.mutedText }}
          >
            Pet profile
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:pt-8">
        {/* Identity + contact: the first thing a finder sees. */}
        <section
          className="brand-card rounded-[2rem] p-6 text-center"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <div className="flex justify-center">
            <PetAvatar pet={profile} size="xl" />
          </div>
          <h1
            className="mt-5 text-3xl font-black text-pet-ink"
            style={{ color: theme.colors.text }}
          >
            {profile.name}
          </h1>
          <p
            className="mt-2 text-sm font-bold text-pet-muted"
            style={{ color: theme.colors.mutedText }}
          >
            {profile.species}
            {" · "}
            {profile.breed}
            {" · "}
            {profile.ageLabel}
          </p>
          <p
            className="mx-auto mt-3 max-w-sm text-sm leading-6 text-pet-muted"
            style={{ color: theme.colors.mutedText }}
          >
            {profile.bio}
          </p>

          <div className="mt-6 grid gap-3">
            {canWhatsapp ? (
              <CTAButton
                href={`${whatsappBaseUrl}?text=${introMessage}`}
                icon="phone"
                target="_blank"
                rel="noopener noreferrer"
                variant="coral"
                fullWidth
                className="min-h-14 text-base"
              >
                I found this pet - Contact Owner
              </CTAButton>
            ) : canCall ? (
              <CTAButton
                href={`tel:${phoneHref}`}
                icon="phone"
                variant="coral"
                fullWidth
                className="min-h-14 text-base"
              >
                I found this pet - Call Owner
              </CTAButton>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {canWhatsapp ? (
                <CTAButton
                  href={`${whatsappBaseUrl}?text=${introMessage}`}
                  icon="phone"
                  target="_blank"
                  rel="noopener noreferrer"
                  fullWidth
                  className="min-h-12"
                >
                  WhatsApp
                </CTAButton>
              ) : null}
              {canCall ? (
                <CTAButton
                  href={`tel:${phoneHref}`}
                  icon="phone"
                  variant="secondary"
                  fullWidth
                  className="min-h-12"
                >
                  Call
                </CTAButton>
              ) : null}
            </div>

            {canWhatsapp ? (
              <CTAButton
                icon="pin"
                onClick={handleSendFoundLocation}
                variant="outline"
                fullWidth
                className="min-h-12 bg-white"
              >
                Send Found Location
              </CTAButton>
            ) : null}
          </div>

          {locationStatus ? (
            <p className="mt-3 rounded-[1.25rem] bg-[#e8f3ff] p-3 text-sm font-bold leading-6 text-pet-ink">
              {locationStatus}
            </p>
          ) : null}

          {visibility.showOwnerName ? (
            <p
              className="mt-4 text-sm font-bold text-pet-ink"
              style={{ color: theme.colors.text }}
            >
              Cared for by {ownerDisplayName}
            </p>
          ) : null}
        </section>

        {/* Secondary info grouped behind simple tabs. */}
        <div
          className="mt-6 flex gap-1 rounded-full border border-pet-border bg-white p-1"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          {tabs.map((tab) => (
            <button
              className="min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-bold transition"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={
                activeTab === tab.id
                  ? {
                      background: theme.colors.buttonBackground,
                      color: theme.colors.buttonText,
                    }
                  : { color: theme.colors.mutedText }
              }
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {activeTab === "about" ? (
            <AboutTab profile={profile} theme={theme} />
          ) : null}
          {activeTab === "notes" ? (
            <NotesTab
              profile={profile}
              theme={theme}
              visibility={visibility}
              careRecords={careRecords}
            />
          ) : null}
          {activeTab === "moments" ? (
            <MomentsTab
              petName={profile.name}
              publicMoments={publicMoments}
              theme={theme}
            />
          ) : null}
        </div>

        <div className="mt-6">
          <ShareProfileLink
            path={profile.publicProfilePath}
            petName={profile.name}
            showShareButton
            theme={theme}
          />
        </div>

        <p
          className="mt-4 text-center text-xs font-semibold leading-5 text-pet-muted"
          style={{ color: theme.colors.mutedText }}
        >
          For safety, this profile only shows owner-approved public information.
          The owner&apos;s full address is never shared.
        </p>
      </div>
    </article>
  );
}

function AboutTab({
  profile,
  theme,
}: {
  profile: PublicPetProfile;
  theme: PetProfileTheme;
}) {
  const details: { label: string; value: string }[] = [
    { label: "Breed", value: profile.breed },
    { label: "Color", value: profile.color },
    { label: "Gender", value: profile.gender },
    { label: "Age", value: profile.ageLabel },
    { label: "Birthday", value: profile.birthday },
    { label: "Favourite", value: profile.favoriteToy },
  ];

  return (
    <section
      className="brand-card rounded-[1.75rem] p-6"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <h2
        className="text-lg font-black text-pet-ink"
        style={{ color: theme.colors.text }}
      >
        About {profile.name}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {details.map((detail) => (
          <div
            className="rounded-[1.25rem] bg-pet-cream p-4"
            key={detail.label}
            style={{ background: theme.colors.surfaceAlt }}
          >
            <p
              className="text-xs font-bold uppercase text-pet-muted"
              style={{ color: theme.colors.mutedText }}
            >
              {detail.label}
            </p>
            <p
              className="mt-1 break-words font-black text-pet-ink"
              style={{ color: theme.colors.text }}
            >
              {detail.value}
            </p>
          </div>
        ))}
      </div>

      {profile.personalityTags.length ? (
        <>
          <p
            className="mt-5 text-xs font-bold uppercase text-pet-muted"
            style={{ color: theme.colors.mutedText }}
          >
            Personality
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {profile.personalityTags.map((tag) => (
              <ThemedBadge key={tag} theme={theme}>
                {tag}
              </ThemedBadge>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function NotesTab({
  profile,
  theme,
  visibility,
  careRecords,
}: {
  profile: PublicPetProfile;
  theme: PetProfileTheme;
  visibility: Pet["visibility"];
  careRecords: CareRecord[];
}) {
  return (
    <section className="grid gap-4">
      <NoteCard
        icon="shield"
        label="Safety note"
        theme={theme}
        value={profile.safetyNote}
      />
      {visibility.showEmergencyNote ? (
        <NoteCard
          icon="record"
          label="Emergency note"
          theme={theme}
          value={profile.emergencyNote}
        />
      ) : null}
      {visibility.showGeneralArea ? (
        <NoteCard
          icon="pin"
          label="General area"
          theme={theme}
          value={profile.generalArea}
        />
      ) : null}

      {careRecords.length ? (
        <div
          className="brand-card rounded-[1.75rem] p-6"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <h2
            className="text-lg font-black text-pet-ink"
            style={{ color: theme.colors.text }}
          >
            Care badges
          </h2>
          <div className="mt-4 grid gap-3">
            {careRecords.map((record) => (
              <div
                className="rounded-[1.25rem] bg-pet-cream p-4"
                key={record.id}
                style={{ background: theme.colors.surfaceAlt }}
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
                {record.publicVisibility === "Public details" &&
                visibility.showHealthSummary ? (
                  <p
                    className="mt-2 font-bold text-pet-ink"
                    style={{ color: theme.colors.text }}
                  >
                    {record.title}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MomentsTab({
  petName,
  publicMoments,
  theme,
}: {
  petName: string;
  publicMoments: PetMoment[];
  theme: PetProfileTheme;
}) {
  if (!publicMoments.length) {
    return (
      <div
        className="rounded-[1.5rem] border border-dashed border-pet-border bg-pet-cream p-8 text-center text-sm text-pet-muted"
        style={{
          background: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          color: theme.colors.mutedText,
        }}
      >
        {petName}&apos;s public memories will appear here.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {publicMoments.map((moment) => (
        <PetMomentCard
          key={moment.id}
          moment={moment}
          publicView
          theme={theme}
        />
      ))}
    </div>
  );
}

function NoteCard({
  icon,
  label,
  theme,
  value,
}: {
  icon: IconName;
  label: string;
  theme: PetProfileTheme;
  value: string;
}) {
  return (
    <div
      className="brand-card rounded-[1.5rem] p-5"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
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

function normalizeWhatsappNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizePhoneHref(value: string) {
  return value.replace(/[^\d+]/g, "");
}
