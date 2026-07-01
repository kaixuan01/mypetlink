"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import {
  getPetProfileTheme,
  type PetProfileTheme,
} from "@/lib/petProfileThemes";
import {
  publicPetProfileDocumentTitle,
  setAbsolutePageTitle,
} from "@/lib/pageTitles";
import {
  defaultOwnerSettings,
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import {
  getPetAgeLabel,
  getPetSummaryLabel,
  getPetTypeLabel,
} from "@/lib/petDisplay";
import {
  getCallLink,
  getWhatsAppLink,
  normalizeStoredPhone,
} from "@/lib/phone";
import { getPublicTimeline, type PetTimelineItem } from "@/lib/petTimeline";
import { ownerRoutes } from "@/lib/routes";
import { isOwnerAuthenticated } from "@/services/authService";
import { getPublicPetMoments } from "@/services/momentService";
import { getPublicPetProfileByPublicCode } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type {
  CareRecord,
  Pet,
  PetMoment,
  PublicPetProfile,
} from "@/types";

type PublicSharePetProfileProps = {
  initialProfile: PublicPetProfile;
  initialMoments: PetMoment[];
  initialRecords: CareRecord[];
  initialLostMode?: boolean;
};

type TabId = "about" | "moments" | "timeline";

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

// The shareable public profile (/p/{slug}-{publicCode}). This is the friendly,
// IG-style pet page owners share with friends, family, and pet communities.
// It is deliberately separate from the finder/emergency experience. That lives
// on the pet-level QR Safety Page (/q/{safetyCode}); physical tags use
// /t/{tagCode} only as scan entry points while active.
export function PublicSharePetProfile({
  initialProfile,
  initialMoments,
  initialRecords,
  initialLostMode = false,
}: PublicSharePetProfileProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [moments, setMoments] = useState(initialMoments);
  const [records, setRecords] = useState(initialRecords);
  const [lostMode, setLostMode] = useState(
    initialProfile.lifecycleStatus === "Active" &&
      (initialLostMode || initialProfile.lostModeEnabled)
  );
  const [safetyPagePath, setSafetyPagePath] = useState(
    initialProfile.qrSafetyPath
  );
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const [activeTab, setActiveTab] = useState<TabId>("about");
  const isOwner = useSyncExternalStore(
    subscribeToAuth,
    isOwnerAuthenticated,
    getServerAuth
  );

  const visibility = mergeVisibility(profile.visibility);
  const theme = getPetProfileTheme(profile.profileTheme);
  const effectiveContact = getEffectivePetContact(profile, ownerSettings);
  const isMemorial = profile.lifecycleStatus === "Memorial";
  const isArchived = profile.lifecycleStatus === "Archived";
  const isActiveProfile = !isMemorial && !isArchived;

  const ownerDisplayName = visibility.showOwnerName
    ? getPublicOwnerName(effectiveContact.ownerDisplayName, profile.name)
    : `${profile.name}'s owner`;
  const whatsappE164 = normalizeStoredPhone(effectiveContact.whatsappNumber);
  const phoneE164 = normalizeStoredPhone(effectiveContact.phoneNumber);
  const whatsappHref = getWhatsAppLink(
    whatsappE164,
    `Hi, I saw ${profile.name}'s MyPetLink profile.`
  );
  const phoneHref = getCallLink(phoneE164);
  const canWhatsapp = visibility.showWhatsapp && Boolean(whatsappE164);
  const canCall = visibility.showPhone && Boolean(phoneE164);
  const canContact = isActiveProfile && (canWhatsapp || canCall);
  const lostModeDetails = profile.lostMode;

  const publicMoments = visibility.showMoments
    ? moments.filter(
        (moment) =>
          moment.visibility === "Public" && moment.showOnPublicProfile
      )
    : [];
  const careRecords = visibility.showCareBadges
    ? records.filter((record) => record.publicVisibility !== "Private").slice(0, 4)
    : [];
  const timelineEvents = getPublicTimeline(profile, moments);

  useEffect(() => {
    setAbsolutePageTitle(publicPetProfileDocumentTitle(profile.name));
  }, [profile.name]);

  useEffect(() => {
    let active = true;
    const settingsTimer = window.setTimeout(() => {
      if (active) {
        setOwnerSettings(readOwnerSettings());
      }
    }, 0);

    getPublicPetProfileByPublicCode(initialProfile.publicCode).then(
      async (profileResponse) => {
        if (!active) {
          return;
        }

        const nextProfile = profileResponse.data ?? initialProfile;
        setProfile(nextProfile);

        const [momentsResponse, recordsResponse] =
          await Promise.all([
            getPublicPetMoments(nextProfile.id),
            getPetRecords(nextProfile.id),
          ]);

        if (!active) {
          return;
        }

        setMoments(momentsResponse.data);
        setRecords(recordsResponse.data);
        setSafetyPagePath(nextProfile.qrSafetyPath);
        setLostMode(
          nextProfile.lifecycleStatus === "Active" && nextProfile.lostModeEnabled
        );
      }
    );

    return () => {
      active = false;
      window.clearTimeout(settingsTimer);
    };
  }, [initialProfile]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "about", label: "About" },
  ];

  if (visibility.showMoments) {
    tabs.push({ id: "moments", label: "Moments" });
  }

  if (visibility.showTimeline) {
    tabs.push({ id: "timeline", label: "Timeline" });
  }

  const currentTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "about";

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
        {/* Identity hero â€” a friendly, shareable introduction to the pet. */}
        <section
          className="brand-card overflow-hidden rounded-[2rem]"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <div
            className="h-28 w-full bg-cover bg-center"
            style={
              profile.coverUrl
                ? { backgroundImage: `url(${profile.coverUrl})` }
                : { background: theme.gradients.cover }
            }
          />
          <div className="px-6 pb-6 text-center">
            <div className="-mt-14 flex justify-center">
              <span
                className="rounded-full border-4"
                style={{ borderColor: theme.colors.surface }}
              >
                <PetAvatar pet={profile} size="xl" />
              </span>
            </div>
            <h1
              className="mt-4 text-3xl font-black text-pet-ink"
              style={{ color: theme.colors.text }}
            >
              {isMemorial ? `Remembering ${profile.name}` : profile.name}
            </h1>
            <p
              className="mt-2 text-sm font-bold text-pet-muted"
              style={{ color: theme.colors.mutedText }}
            >
              {getPetSummaryLabel(profile)}
            </p>
            {profile.bio ? (
              <p
                className="mx-auto mt-3 max-w-sm text-sm leading-6 text-pet-muted"
                style={{ color: theme.colors.mutedText }}
              >
                {profile.bio}
              </p>
            ) : null}

            {profile.personalityTags.length ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {profile.personalityTags.map((tag) => (
                  <ThemedBadge key={tag} theme={theme}>
                    {tag}
                  </ThemedBadge>
                ))}
              </div>
            ) : null}

            {visibility.showOwnerName ? (
              <p
                className="mt-4 text-sm font-bold text-pet-ink"
                style={{ color: theme.colors.text }}
              >
                Cared for by {ownerDisplayName}
              </p>
            ) : null}
          </div>
        </section>

        {isMemorial && profile.memorial.showMemorialOnPublicProfile ? (
          <section
            className="mt-4 rounded-[1.5rem] border p-5 text-center"
            style={{
              background: theme.colors.surface,
              borderColor: theme.colors.border,
            }}
          >
            <div
              className="flex items-center justify-center gap-2 text-sm font-black uppercase"
              style={{ color: theme.colors.accent }}
            >
              <Icon name="heart" className="h-4 w-4" />
              {profile.name} is lovingly remembered.
            </div>
            {profile.memorial.passedAwayDate ? (
              <p
                className="mt-2 text-sm font-bold"
                style={{ color: theme.colors.mutedText }}
              >
                Passed away: {profile.memorial.passedAwayDate}
              </p>
            ) : null}
            {profile.memorial.memorialMessage ? (
              <p
                className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6"
                style={{ color: theme.colors.text }}
              >
                {profile.memorial.memorialMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {isArchived ? (
          <section
            className="mt-4 rounded-[1.5rem] border p-5 text-center"
            style={{
              background: theme.colors.surface,
              borderColor: theme.colors.border,
            }}
          >
            <p
              className="text-sm font-black"
              style={{ color: theme.colors.text }}
            >
              This profile is archived by the owner.
            </p>
            <p
              className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6"
              style={{ color: theme.colors.mutedText }}
            >
              Memories and public details can still be viewed, but emergency
              finder actions are turned off.
            </p>
          </section>
        ) : null}

        {/* Lost Mode is the one time this shareable page turns finder-first. */}
        {isActiveProfile && lostMode ? (
          <section className="mt-4 rounded-[1.5rem] border-2 border-pet-coral bg-[#fff1ee] p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-black uppercase text-pet-coral">
              <Icon name="shield" className="h-4 w-4" />
              {profile.name} is currently missing
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-pet-ink">
              {lostModeDetails.lostMessage ||
                `If you have seen ${profile.name}, please contact the owner.`}
            </p>
            <div className="mt-4 grid gap-2 text-left text-xs font-bold text-pet-muted sm:grid-cols-2">
              {lostModeDetails.lastSeenArea ? (
                <span className="rounded-[1rem] bg-white px-4 py-3">
                  Last seen: {lostModeDetails.lastSeenArea}
                </span>
              ) : null}
              {lostModeDetails.lastSeenDateTime ? (
                <span className="rounded-[1rem] bg-white px-4 py-3">
                  Time: {lostModeDetails.lastSeenDateTime}
                </span>
              ) : null}
              {lostModeDetails.rewardNote ? (
                <span className="rounded-[1rem] bg-white px-4 py-3 sm:col-span-2">
                  {lostModeDetails.rewardNote}
                </span>
              ) : null}
              {lostModeDetails.extraContactInstruction ? (
                <span className="rounded-[1rem] bg-white px-4 py-3 sm:col-span-2">
                  {lostModeDetails.extraContactInstruction}
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              {canWhatsapp ? (
                <CTAButton
                  href={whatsappHref}
                  icon="phone"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="coral"
                  fullWidth
                  className="min-h-12"
                >
                  I found this pet - Contact Owner
                </CTAButton>
              ) : canCall ? (
                <CTAButton
                  href={phoneHref}
                  icon="phone"
                  variant="coral"
                  fullWidth
                  className="min-h-12"
                >
                  I found this pet - Call Owner
                </CTAButton>
              ) : null}
              <CTAButton
                href={safetyPagePath}
                icon="qr"
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                fullWidth
                className="min-h-12 bg-white"
              >
                Open QR Safety Page
              </CTAButton>
            </div>
          </section>
        ) : null}

        {/* Owners previewing their own page get a small admin bar; normal
            visitors just get a compact share button (no raw URL box). */}
        {isOwner ? (
          <section
            className="mt-6 flex flex-col items-center gap-3 rounded-[1.5rem] border border-pet-border bg-white/80 p-4 sm:flex-row sm:justify-between"
            style={{
              background: theme.colors.surface,
              borderColor: theme.colors.border,
            }}
          >
            <span
              className="inline-flex items-center gap-2 text-xs font-black uppercase text-pet-muted"
              style={{ color: theme.colors.mutedText }}
            >
              <Icon name="heart" className="h-4 w-4" />
              Viewing as public
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ShareProfileLink
                path={profile.publicProfilePath}
                petName={profile.name}
                compact
                theme={theme}
              />
              <CTAButton
                href={ownerRoutes.petEdit(profile.id)}
                variant="secondary"
                icon="settings"
                className="min-h-10"
              >
                Back to Edit
              </CTAButton>
            </div>
          </section>
        ) : (
          <div className="mt-6 flex justify-center">
            <ShareProfileLink
              path={profile.publicProfilePath}
              petName={profile.name}
              showShareButton
              compact
              theme={theme}
            />
          </div>
        )}

        {isActiveProfile && !lostMode && canContact ? (
          <div className="mt-3">
            {canWhatsapp ? (
              <CTAButton
                href={whatsappHref}
                icon="phone"
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                fullWidth
                className="min-h-11"
              >
                Message {ownerDisplayName}
              </CTAButton>
            ) : (
              <CTAButton
                href={phoneHref}
                icon="phone"
                variant="secondary"
                fullWidth
                className="min-h-11"
              >
                Call {ownerDisplayName}
              </CTAButton>
            )}
          </div>
        ) : null}

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
                currentTab === tab.id
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
          {currentTab === "about" ? (
            <AboutTab
              profile={profile}
              theme={theme}
              visibility={visibility}
              careRecords={careRecords}
              generalArea={effectiveContact.generalArea}
            />
          ) : null}
          {currentTab === "moments" ? (
            <MomentsTab
              petName={profile.name}
              publicMoments={publicMoments}
              theme={theme}
            />
          ) : null}
          {currentTab === "timeline" ? (
            <TimelineTab
              petName={profile.name}
              events={timelineEvents}
              theme={theme}
            />
          ) : null}
        </div>

        <p
          className="mt-6 text-center text-xs font-semibold leading-5 text-pet-muted"
          style={{ color: theme.colors.mutedText }}
        >
          Powered by MyPetLink. This profile only shows owner-approved public
          information.
        </p>
      </div>
    </article>
  );
}

function AboutTab({
  profile,
  theme,
  visibility,
  careRecords,
  generalArea,
}: {
  profile: PublicPetProfile;
  theme: PetProfileTheme;
  visibility: Pet["visibility"];
  careRecords: CareRecord[];
  generalArea: string;
}) {
  const details: { label: string; value: string }[] = [
    { label: "Pet type", value: getPetTypeLabel(profile) },
    { label: "Breed", value: profile.breed },
    { label: "Color", value: profile.color },
    { label: "Gender", value: profile.gender },
    { label: "Age", value: getPetAgeLabel(profile) },
    { label: "Birthday", value: profile.birthday },
    ...(profile.lifecycleStatus === "Memorial" &&
    profile.memorial.passedAwayDate
      ? [{ label: "Remembered since", value: profile.memorial.passedAwayDate }]
      : []),
    ...(visibility.showGeneralArea
      ? [{ label: "General area", value: generalArea }]
      : []),
    { label: "Favourite toy", value: profile.favoriteToy },
  ].filter((detail) => detail.value && detail.value !== "Not set");

  return (
    <section className="grid gap-4">
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
      </div>

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

function TimelineTab({
  petName,
  events,
  theme,
}: {
  petName: string;
  events: PetTimelineItem[];
  theme: PetProfileTheme;
}) {
  if (!events.length) {
    return (
      <div
        className="rounded-[1.5rem] border border-dashed border-pet-border bg-pet-cream p-8 text-center text-sm text-pet-muted"
        style={{
          background: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          color: theme.colors.mutedText,
        }}
      >
        {petName}&apos;s owner has not shared timeline milestones yet.
      </div>
    );
  }

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
        Life Timeline
      </h2>
      <p
        className="mt-1 text-sm leading-6 text-pet-muted"
        style={{ color: theme.colors.mutedText }}
      >
        Milestones and special dates from {petName}&apos;s life.
      </p>
      <div className="mt-5 grid gap-3">
        {events.map((event) => (
          <div
            className="flex items-start gap-3 rounded-[1.25rem] bg-pet-cream p-4"
            key={event.id}
            style={{ background: theme.colors.surfaceAlt }}
          >
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ background: theme.colors.timelineDot }}
            />
            <div className="min-w-0">
              <p
                className="text-xs font-bold uppercase text-pet-muted"
                style={{ color: theme.colors.mutedText }}
              >
                {event.date}
              </p>
              <p
                className="mt-0.5 font-black text-pet-ink"
                style={{ color: theme.colors.text }}
              >
                {event.title}
              </p>
              {event.description ? (
                <p
                  className="mt-1 text-sm leading-6 text-pet-muted"
                  style={{ color: theme.colors.mutedText }}
                >
                  {event.description}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
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

function subscribeToAuth() {
  return () => {};
}

function getServerAuth() {
  return false;
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

