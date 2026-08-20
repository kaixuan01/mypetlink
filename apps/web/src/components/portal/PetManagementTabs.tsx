"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { MomentMediaThumbnail } from "@/components/moments/MomentMediaThumbnail";
import {
  getSafetyProfileBadge,
  getSmartTagStatusBadge,
} from "@/components/portal/ProfileAccessStatus";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { ProfileCompletionCard } from "@/components/portal/ProfileCompletionCard";
import { PublicLinkActions } from "@/components/portal/PublicLinkActions";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
import { ShareCenter } from "@/components/share/ShareCenter";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { LostModeControl } from "@/components/portal/LostModeControl";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import {
  defaultOwnerSettings,
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { getEffectivePlanLimits, getMemoryLimitState } from "@/lib/planLimits";
import { deriveProfileCompletion } from "@/lib/profileCompletion";
import { getCareRecordDateTerminology } from "@/lib/careRecordTerminology";
import {
  getActivePets,
  isActivePet,
  isArchivedPet,
  isMemorialPet,
} from "@/lib/petLifecycle";
import { useOwnerPets } from "@/components/portal/OwnerHeaderActions";
import {
  addPublicProfileShareVersion,
  getPublicProfileShareVersion,
} from "@/lib/publicProfileSocial";
import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
  smartTagOrderingEnabled,
  smartTagsEnabled,
  tagOrdersEnabled,
} from "@/lib/features";
import { ownerRoutes, tagQrPath } from "@/lib/routes";
import { getTagScanDisplay, isActivePhysicalTagForPet } from "@/lib/tagStatus";
import { isApiConfigured } from "@/services/apiConfig";
import { getPetMoments } from "@/services/momentService";
import { getPetById } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type {
  CareRecord,
  Pet,
  PetMoment,
  PetTag,
  TagOrder,
} from "@/types";

type TabId = "overview" | "records" | "moments" | "tag" | "privacy";

type PetManagementTabsProps = {
  pet: Pet;
  records: CareRecord[];
  moments: PetMoment[];
  orders?: TagOrder[];
  tags: PetTag[];
};

const tabs: (SegmentedTab & { id: TabId })[] = [
  { id: "overview", label: "Overview" },
  { id: "records", label: "Care Records", mobileLabel: "Records" },
  { id: "moments", label: "Moments" },
  // The Smart Tag tab returns automatically when the feature relaunches.
  ...(smartTagsEnabled
    ? [{ id: "tag", label: "Smart Tag", mobileLabel: "Tag" } as SegmentedTab & { id: TabId }]
    : []),
  ...(publicProfilesEnabled || safetyProfilesOwnerUiEnabled
    ? [{ id: "privacy", label: "Privacy" } as SegmentedTab & { id: TabId }]
    : []),
];

export function PetManagementTabs({
  pet,
  records,
  moments,
  orders = [],
  tags,
}: PetManagementTabsProps) {
  const apiMode = isApiConfigured();
  // The owner header already loads this owner's pets on every owner route, so
  // the real active-pet count is read from that shared state rather than
  // requested again here.
  const { pets: ownerPets } = useOwnerPets();
  const activePetCount = ownerPets ? getActivePets(ownerPets).length : undefined;
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [currentPet, setCurrentPet] = useState(pet);
  const [currentRecords, setCurrentRecords] = useState<CareRecord[]>(
    apiMode ? [] : records
  );
  const [currentMoments, setCurrentMoments] = useState<PetMoment[]>(
    apiMode ? [] : moments
  );
  const [recordsAvailable, setRecordsAvailable] = useState(!apiMode);
  const [momentsAvailable, setMomentsAvailable] = useState(!apiMode);

  // The page is server-rendered from seed data; re-read the pet on the client so
  // persisted edits (e.g. Lost Mode) survive a refresh and match the safety
  // and public profile pages, which read the same stored record.
  useEffect(() => {
    let active = true;

    getPetById(pet.id).then((response) => {
      if (active && response.data) {
        setCurrentPet(response.data);
      }
    });

    return () => {
      active = false;
    };
  }, [pet.id]);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      getPetRecords(currentPet.id),
      getPetMoments(currentPet.id),
    ])
      .then(([recordResult, momentResult]) => {
        if (active) {
          if (recordResult.status === "fulfilled") {
            setCurrentRecords(recordResult.value.data);
            setRecordsAvailable(true);
          } else {
            setCurrentRecords([]);
            setRecordsAvailable(false);
          }

          if (momentResult.status === "fulfilled") {
            setCurrentMoments(momentResult.value.data);
            setMomentsAvailable(true);
          } else {
            setCurrentMoments([]);
            setMomentsAvailable(false);
          }
        }
      });

    return () => {
      active = false;
    };
  }, [currentPet.id]);

  return (
    <div>
      <SegmentedTabs
        ariaLabel="Manage pet sections"
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={tabs}
      />

      {activeTab === "overview" ? (
        <OverviewTab
          pet={currentPet}
          records={currentRecords}
          moments={currentMoments}
          momentsAvailable={momentsAvailable}
          onPetChange={setCurrentPet}
          orders={orders}
          activePetCount={activePetCount}
          recordsAvailable={recordsAvailable}
          tags={tags}
        />
      ) : null}

      {activeTab === "records" ? (
        <RecordsManager petId={currentPet.id} initialRecords={currentRecords} />
      ) : null}

      {activeTab === "moments" ? (
        <PetMomentsManager pet={currentPet} initialMoments={currentMoments} />
      ) : null}

      {activeTab === "tag" ? (
        <TagManagementPanel
          pets={[currentPet]}
          initialTags={tags}
          initialOrders={orders}
          petId={currentPet.id}
        />
      ) : null}

      {activeTab === "privacy" ? <PrivacyTab pet={currentPet} /> : null}
    </div>
  );
}

function OverviewTab({
  pet,
  records,
  moments,
  onPetChange,
  orders,
  tags,
  activePetCount,
  recordsAvailable,
  momentsAvailable,
}: {
  pet: Pet;
  records: CareRecord[];
  moments: PetMoment[];
  onPetChange: (pet: Pet) => void;
  orders: TagOrder[];
  tags: PetTag[];
  activePetCount?: number;
  recordsAvailable: boolean;
  momentsAvailable: boolean;
}) {
  const recentRecords = records.slice(0, 3);
  const recentMoments = moments.slice(0, 3);
  const memoryLimit = getMemoryLimitState(moments.length);
  const currentTags = tags.filter((tag) => !tag.isArchived);
  const activeTag = currentTags.find((tag) => isActivePhysicalTagForPet(tag, pet));
  const activeTagScanDisplay = activeTag
    ? getTagScanDisplay(activeTag, undefined, pet)
    : null;
  const activeTagScanPath = activeTag ? tagQrPath(activeTag.tagCode) : "";
  const safetyBadge = getSafetyProfileBadge(pet);
  const smartTagBadge = getSmartTagStatusBadge(tags, orders, pet);
  const isMemorial = isMemorialPet(pet);
  const isArchived = isArchivedPet(pet);
  const isActiveProfile = isActivePet(pet);
  const publicProfileAccessible =
    pet.publicProfileEnabled &&
    !isArchived &&
    (!isMemorial || pet.memorial.showMemorialOnPublicProfile);
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const effectiveContact = getEffectivePetContact(pet, ownerSettings);
  const publicProfileSharePath = addPublicProfileShareVersion(
    pet.publicProfilePath,
    getPublicProfileShareVersion(pet)
  );
  const completion = deriveProfileCompletion({
    pet,
    momentCount: momentsAvailable ? moments.length : undefined,
    careRecordCount: recordsAvailable ? records.length : undefined,
    ownerSettings,
    safetyProfilesEnabled: safetyProfilesOwnerUiEnabled,
    publicProfilesEnabled,
    memoryLimit: getEffectivePlanLimits().maxMemoriesPerPet,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOwnerSettings(readOwnerSettings());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="grid min-w-0 gap-5">
      {isActiveProfile ? (
        <ProfileCompletionCard
          completion={completion}
          isFirstPet={activePetCount === 1}
          pet={pet}
        />
      ) : null}

      {/* Sharing & Safety */}
      {publicProfilesEnabled || safetyProfilesOwnerUiEnabled || isActiveProfile ? (
        <SectionCard
          icon="heart"
          title="Sharing & Safety"
          description={`Share ${pet.name}'s profile with people you know, and manage what someone sees if they find ${pet.name}.`}
        >
          {/*
            The two profiles are siblings of equal weight: one is who you show
            the pet to, the other is who finds them. Neither should look like
            the more important half of the page.
          */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {publicProfilesEnabled ? (
              <ProfileSubcard
                action={
                  publicProfileAccessible ? (
                    <ShareCenter
                      pet={pet}
                      triggerClassName={subcardActionClass}
                    />
                  ) : (
                    <Link
                      className={subcardActionClass}
                      href={`${ownerRoutes.petEdit(pet.id)}?tab=public`}
                    >
                      <Icon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0"
                        name="settings"
                      />
                      Manage
                    </Link>
                  )
                }
                badge={
                  <Badge tone={publicProfileAccessible ? "mint" : "soft"}>
                    {publicProfileAccessible ? "Public" : "Private"}
                  </Badge>
                }
                description={
                  publicProfileAccessible
                    ? "The profile friends, family, and pet communities see."
                    : "This profile is private, so sharing actions are unavailable."
                }
                icon="heart"
                link={
                  publicProfileAccessible ? (
                    <Link
                      className={subcardLinkClass}
                      href={publicProfileSharePath}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {isMemorial ? "View memorial profile" : "View profile"}
                      <span aria-hidden="true">&rarr;</span>
                    </Link>
                  ) : null
                }
                title="Public Profile"
              />
            ) : null}

            {safetyProfilesOwnerUiEnabled ? (
              <ProfileSubcard
                action={
                  <QrCodeButton
                    ariaLabel={`Show ${pet.name}'s Safety Profile QR code`}
                    className={subcardActionClass}
                    fileNameBase={`${pet.slug}-safety-profile-qr`}
                    helperText={`Scan if you have found ${pet.name}`}
                    label={
                      <>
                        <Icon
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                          name="qr"
                        />
                        Show Safety QR
                      </>
                    }
                    targetPath={pet.qrSafetyPath}
                    title={`${pet.name}'s Safety Profile`}
                    viewLabel="Open Safety Profile"
                    warning={
                      isActiveProfile
                        ? undefined
                        : "This profile is inactive, so the Safety Profile does not reveal finder contact details."
                    }
                  />
                }
                badge={<Badge tone={safetyBadge.tone}>{safetyBadge.label}</Badge>}
                description={
                  isMemorial
                    ? "Memorial profiles keep Safety Profile contact actions turned off."
                    : isArchived
                      ? "Restore this profile to manage Safety Profile contact settings again."
                      : `The page someone sees if they find ${pet.name}.`
                }
                icon="qr"
                link={
                  <Link
                    className={subcardLinkClass}
                    href={pet.qrSafetyPath}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View profile
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                }
                meta={
                  effectiveContact.generalArea
                    ? `General area \u00b7 ${effectiveContact.generalArea}`
                    : undefined
                }
                notice={
                  isActiveProfile &&
                  safetyBadge.label === "Contact Update Needed" ? (
                    <section
                      aria-labelledby={`safety-contact-warning-${pet.id}`}
                      className="rounded-[1rem] border border-[#f0dfae] bg-[#fffbea] px-3 py-2.5"
                      role="status"
                    >
                      <h4
                        className="text-xs font-black text-[#6b5500]"
                        id={`safety-contact-warning-${pet.id}`}
                      >
                        Update your contact details
                      </h4>
                      <p className="mt-1 text-xs font-bold leading-5 text-[#856a00]">
                        Add a phone or WhatsApp number so finders can reach you.
                      </p>
                      <Link
                        className="mt-1.5 inline-flex min-h-9 items-center gap-1 text-xs font-extrabold text-[#6b5500] hover:underline"
                        href={`${ownerRoutes.petEdit(pet.id)}?tab=contact`}
                      >
                        Update contact
                        <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </section>
                  ) : null
                }
                title="Safety Profile"
              />
            ) : null}
          </div>

          {/* Lost Mode belongs to safety, but not inside either profile. */}
          {isActiveProfile ? (
            <LostModeControl
              onPetChange={onPetChange}
              pet={pet}
              variant="compact"
            />
          ) : null}
        </SectionCard>
      ) : null}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      {/* Moments / Memories */}
      <SectionCard
        icon="heart"
        title="Pet Memories"
        description="Photo and video moments, with public, private, and family-only control."
      >
        {recentMoments.length ? (
          <div className="grid gap-2">
            {recentMoments.map((moment) => (
              <div
                className="flex items-center gap-3 rounded-[1rem] bg-pet-cream p-2.5"
                key={moment.id}
              >
                <MomentMediaThumbnail moment={moment} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-pet-ink">
                    {moment.title}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-pet-muted">
                    {moment.date}
                  </p>
                </div>
                <Badge tone={moment.visibility === "Public" ? "mint" : "soft"}>
                  {moment.visibility}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-pet-muted">No pet memories yet.</p>
        )}
        <div className="mt-auto grid gap-2 pt-1 sm:grid-cols-[1fr_auto]">
          <CTAButton
            disabled={!memoryLimit.canCreate}
            href={memoryLimit.canCreate ? ownerRoutes.petMomentNew(pet.id) : undefined}
            variant="primary"
            icon="plus"
            fullWidth
          >
            {memoryLimit.canCreate ? "Add Moment" : "Memory Limit Reached"}
          </CTAButton>
          <Link
            className="inline-flex min-h-12 items-center justify-center gap-1 px-2 text-sm font-extrabold text-pet-teal transition hover:underline"
            href={ownerRoutes.petMoments(pet.id)}
          >
            View all
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </SectionCard>

      {/* Care Records */}
      <SectionCard
        icon="record"
        title="Care Records"
        description="Vaccines, deworming, grooming, and vet visit history."
      >
        {recentRecords.length ? (
          <div className="grid gap-2">
            {recentRecords.map((record) => (
              <div
                className="flex items-center justify-between gap-2 rounded-[1rem] bg-pet-cream px-4 py-3"
                key={record.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-pet-ink">
                    {record.title}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-pet-muted">
                    {getCareRecordDateTerminology(record.type).primaryDateLabel}:{" "}
                    {record.date}
                  </p>
                </div>
                <Badge tone="soft">{record.type}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-pet-muted">No care records yet.</p>
        )}
        <div className="mt-auto grid gap-2 pt-1 sm:grid-cols-[1fr_auto]">
          <CTAButton
            href={ownerRoutes.petRecords(pet.id, { create: true })}
            variant="primary"
            icon="plus"
            fullWidth
          >
            Add Care Record
          </CTAButton>
          <Link
            className="inline-flex min-h-12 items-center justify-center gap-1 px-2 text-sm font-extrabold text-pet-teal transition hover:underline"
            href={ownerRoutes.petRecords(pet.id)}
          >
            View all
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </SectionCard>

      {/* Smart Tags */}
      {smartTagsEnabled ? (
      <SectionCard
        icon="tag"
        title="Smart Tags"
        badge={<Badge tone={smartTagBadge.tone}>{smartTagBadge.label}</Badge>}
        description={
          isMemorial
            ? "Physical tags linked to this memorial are kept as history and show an inactive scan page."
            : isArchived
              ? "Restore this profile before using physical tags again."
              : "Physical QR or QR + NFC tags. Linked tags open this pet's Safety Profile."
        }
      >
        {activeTag ? (
          <div className="rounded-[1.25rem] bg-pet-cream p-4">
            <p className="text-xs font-bold uppercase text-pet-muted">
              Active tag code
            </p>
            <p className="mt-1 text-lg font-black tracking-wide text-pet-ink">
              {activeTag.tagCode}
            </p>
            <p className="mt-3 text-xs font-bold uppercase text-pet-muted">
              Physical Tag Scan Page
            </p>
            <div className="mt-2">
              <PublicLinkActions
                copyLabel="Copy Link"
                copyMessage="Physical Tag Scan Page link copied."
                fileNameBase={`${activeTag.tagCode}-physical-tag-qr`}
                helperText="This QR belongs to the physical tag linked to this pet."
                path={activeTagScanPath}
                qrTitle="Physical Tag QR"
                viewLabel="View Tag Scan Page"
              />
            </div>
            {activeTagScanDisplay ? (
              <p className="mt-2 text-sm text-pet-muted">
                {activeTagScanDisplay.label}: {activeTagScanDisplay.value}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-[1.25rem] bg-pet-cream px-4 py-3 text-sm leading-6 text-pet-muted">
            {isMemorial
              ? `Physical tags linked to ${pet.name} are historical and no longer show finder contact actions.`
              : isArchived
                ? `Physical tags linked to ${pet.name} are inactive while this profile is archived.`
                : `No physical tag linked yet. ${pet.name}'s Safety Profile already works without one.`}
          </p>
        )}
        <div className="mt-auto grid gap-2 pt-1 sm:auto-cols-max sm:grid-flow-col sm:justify-start">
          <CTAButton
            href={ownerRoutes.petTags(pet.id)}
            variant="secondary"
            icon="tag"
          >
            {activeTag ? "Manage Smart Tags" : "Smart Tag Options"}
          </CTAButton>
          {isActiveProfile && tagOrdersEnabled && smartTagOrderingEnabled ? (
            <CTAButton
              href={ownerRoutes.petTagOrder(pet.id)}
              variant="outline"
              icon="plus"
            >
              Order Physical Tag
            </CTAButton>
          ) : null}
        </div>
      </SectionCard>
      ) : null}

      {isMemorial ? (
        <SectionCard
          icon="heart"
          title="Memorial Mode"
          badge={<Badge tone="soft">Memorial</Badge>}
          description="Emergency finder actions are turned off while this profile is in Memorial Mode."
        >
          <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
            Memories, care records, and Life Timeline remain available. You can
            edit memorial details from the pet edit page.
          </p>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id, { tab: "public" })}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit Memorial
          </CTAButton>
        </SectionCard>
      ) : isArchived ? (
        <SectionCard
          icon="record"
          title="Archived profile"
          badge={<Badge tone="soft">Archived</Badge>}
          description="Archived profiles stay saved but emergency finder actions are hidden."
        >
          <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
            Restore this profile from the pet edit page if you want it back in
            your main pet list and Free profile count.
          </p>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id, { tab: "public" })}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Open Profile Status
          </CTAButton>
        </SectionCard>
      ) : null}
      </div>
    </div>
  );
}

function PrivacyTab({ pet }: { pet: Pet }) {
  const publicStatuses = [
    { label: "Owner name", enabled: pet.visibility.showOwnerName },
    { label: "Care badges", enabled: pet.visibility.showCareBadges },
    { label: "Public memories", enabled: pet.visibility.showMoments },
    { label: "Life Timeline", enabled: pet.visibility.showTimeline },
  ];
  const safetyStatuses = [
    { label: "WhatsApp owner", enabled: pet.visibility.showWhatsapp },
    { label: "Call owner", enabled: pet.visibility.showPhone },
    { label: "Emergency note", enabled: pet.visibility.showEmergencyNote },
    { label: "General area", enabled: pet.visibility.showGeneralArea },
  ];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      {publicProfilesEnabled ? (
        <SectionCard
          icon="heart"
          title="Public profile visibility"
          description="What friends and family see on the shareable public profile."
        >
          <StatusGrid items={publicStatuses} />
          <div className="mt-auto pt-1">
            <CTAButton
              href={ownerRoutes.petEdit(pet.id, { tab: "public" })}
              variant="outline"
              icon="settings"
              fullWidth
            >
              Edit public profile settings
            </CTAButton>
          </div>
        </SectionCard>
      ) : null}

      {safetyProfilesOwnerUiEnabled ? (
        <SectionCard
          icon="qr"
          title="Safety Profile visibility"
          description="What a finder sees after opening the Safety Profile by QR code, NFC tag, or link."
        >
          <StatusGrid items={safetyStatuses} />
          <div className="mt-auto pt-1">
            <CTAButton
              href={ownerRoutes.petEdit(pet.id, { tab: "contact" })}
              variant="outline"
              icon="settings"
              fullWidth
            >
              Edit Safety Profile settings
            </CTAButton>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

const subcardActionClass =
  "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink shadow-sm transition hover:bg-pet-cream";

const subcardLinkClass =
  "inline-flex min-h-11 items-center gap-1 whitespace-nowrap px-1 text-sm font-extrabold text-pet-teal transition hover:underline";

/**
 * One of the two equal halves of Sharing & Safety. Both profiles get the same
 * shape - title, status, a line of description, optional metadata, one action
 * and one quiet link - so neither reads as the more important one.
 */
function ProfileSubcard({
  action,
  badge,
  description,
  icon,
  link,
  meta,
  notice,
  title,
}: {
  action: React.ReactNode;
  badge: React.ReactNode;
  description: string;
  icon: Parameters<typeof Icon>[0]["name"];
  link?: React.ReactNode;
  meta?: string;
  notice?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[1.35rem] border border-pet-border bg-white p-4">
      {/* The badge wraps below on narrow cards rather than squeezing the title. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f3ff] text-pet-teal">
            <Icon aria-hidden="true" className="h-4 w-4" name={icon} />
          </span>
          <h3 className="min-w-0 text-base font-black text-pet-ink">{title}</h3>
        </div>
        {badge}
      </div>
      <p className="text-sm leading-6 text-pet-muted">{description}</p>
      {meta ? (
        <p className="text-xs font-bold leading-5 text-pet-muted">{meta}</p>
      ) : null}
      {notice}
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1">
        {action}
        {link}
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  badge,
  description,
  children,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  badge?: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="brand-card flex min-w-0 flex-col gap-4 rounded-[1.75rem] p-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
            <Icon name={icon} className="h-5 w-5" />
          </span>
          <h2 className="min-w-0 text-lg font-black text-pet-ink">{title}</h2>
        </div>
        {badge}
      </div>
      <p className="-mt-1 text-sm leading-6 text-pet-muted">{description}</p>
      {children}
    </section>
  );
}

function StatusGrid({
  items,
}: {
  items: { label: string; enabled: boolean }[];
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          className="flex min-w-0 items-center justify-between gap-3 rounded-[1rem] bg-pet-cream px-3 py-2 text-sm font-bold text-pet-ink"
          key={item.label}
        >
          <span className="min-w-0">{item.label}</span>
          <span
            className={`shrink-0 ${item.enabled ? "text-pet-sage" : "text-pet-muted"}`}
          >
            {item.enabled ? "Shown" : "Hidden"}
          </span>
        </div>
      ))}
    </div>
  );
}
