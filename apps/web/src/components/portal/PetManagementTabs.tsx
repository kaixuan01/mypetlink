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
import { normalizeMomentVisibility } from "@/lib/momentVisibility";
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

type TabId = "overview" | "records" | "moments" | "tag";

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
  const trailingCardCount =
    Number(smartTagsEnabled) + Number(isMemorial || isArchived);
  const publicProfileAccessible =
    pet.publicProfileEnabled &&
    !isArchived &&
    (!isMemorial || pet.memorial.showMemorialOnPublicProfile);
  const sharingProfileCount =
    Number(publicProfilesEnabled) + Number(safetyProfilesOwnerUiEnabled);
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
    <div className="grid min-w-0 gap-4 sm:gap-5">
      {isActiveProfile ? (
        <ProfileCompletionCard
          completion={completion}
          isFirstPet={activePetCount === 1}
          pet={pet}
        />
      ) : null}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:gap-5">
      {/* Moments / Memories */}
      <OverviewSummaryCard
        action={
          <Link
            aria-label="View all pet memories"
            className={summaryHeaderActionClass}
            href={ownerRoutes.petMoments(pet.id)}
          >
            View all
            <span aria-hidden="true">&rarr;</span>
          </Link>
        }
        icon="heart"
        sectionId="moments"
        title="Pet Memories"
        description="Photo and video moments you choose to keep private or share."
      >
        {recentMoments.length ? (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
            {recentMoments.map((moment) => {
              const visibility = normalizeMomentVisibility(moment.visibility);

              return (
                <div
                  className="flex min-w-0 items-center gap-3 rounded-[1rem] bg-pet-cream p-2.5"
                  data-moment-summary-row
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
                  <Badge
                    className="shrink-0"
                    tone={visibility === "Public" ? "mint" : "soft"}
                  >
                    {visibility === "Public" ? "Shared" : "Only me"}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-pet-muted">No pet memories yet.</p>
        )}
        <div className="mt-auto pt-1">
          <CTAButton
            disabled={!memoryLimit.canCreate}
            href={memoryLimit.canCreate ? ownerRoutes.petMomentNew(pet.id) : undefined}
            variant="secondary"
            icon="plus"
          >
            {memoryLimit.canCreate ? "Add Moment" : "Memory Limit Reached"}
          </CTAButton>
        </div>
      </OverviewSummaryCard>

      {/* Care Records */}
      <OverviewSummaryCard
        action={
          <Link
            aria-label="View all care records"
            className={summaryHeaderActionClass}
            href={ownerRoutes.petRecords(pet.id)}
          >
            View all
            <span aria-hidden="true">&rarr;</span>
          </Link>
        }
        icon="record"
        sectionId="care"
        title="Recent care records"
        description="The latest vaccines, deworming, grooming, and vet visits you've added."
      >
        {recentRecords.length ? (
          <div
            className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2"
            data-care-record-summary-list
          >
            {recentRecords.map((record) => (
              <div
                className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2 rounded-[1rem] bg-pet-cream px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"
                data-care-record-summary-row
                key={record.id}
              >
                <div className="min-w-0" data-care-record-summary-content>
                  <p className="break-words font-bold leading-5 text-pet-ink [overflow-wrap:anywhere]">
                    {record.title}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-pet-muted">
                    {getCareRecordDateTerminology(record.type).primaryDateLabel}:{" "}
                    {record.date}
                  </p>
                </div>
                <Badge
                  className="max-w-full shrink-0 justify-self-start whitespace-normal text-left [overflow-wrap:anywhere] sm:justify-self-end"
                  tone="soft"
                >
                  {record.type}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-pet-muted">No care records yet.</p>
        )}
        <div className="mt-auto pt-1">
          <CTAButton
            href={ownerRoutes.petRecords(pet.id, { create: true })}
            variant="secondary"
            icon="plus"
          >
            Add Care Record
          </CTAButton>
        </div>
      </OverviewSummaryCard>
      </div>

      {/* Sharing & Safety */}
      {publicProfilesEnabled || safetyProfilesOwnerUiEnabled || isActiveProfile ? (
        <OverviewSummaryCard
          icon="heart"
          sectionId="sharing"
          title="Sharing & Safety"
          description={`See what people can view and what finders can use if they find ${pet.name}.`}
        >
          {/*
            The two profiles are siblings of equal weight: one is who you show
            the pet to, the other is who finds them. Neither should look like
            the more important half of the page.
          */}
          <div
            aria-label="Sharing and safety profiles"
            className={`grid min-w-0 divide-y divide-pet-border/70 rounded-[1.25rem] bg-pet-cream px-4 ${
              sharingProfileCount > 1
                ? "lg:grid-cols-2 lg:divide-x lg:divide-y-0"
                : ""
            }`}
            role="group"
          >
            {publicProfilesEnabled ? (
              <ProfileSubcard
                ariaLabel="Public Profile overview"
                badge={
                  <Badge tone={publicProfileAccessible ? "mint" : "soft"}>
                    {publicProfileAccessible ? "Shared" : "Not shared"}
                  </Badge>
                }
                description={
                  publicProfileAccessible
                    ? "Anyone with the link can view this page."
                    : "This profile is not shared. Manage sharing to make it available."
                }
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
                ariaLabel="Safety Profile overview"
                badge={<Badge tone={safetyBadge.tone}>{safetyBadge.label}</Badge>}
                description={
                  isMemorial
                    ? "Memorial profiles keep Safety Profile contact actions turned off."
                    : isArchived
                      ? "Restore this profile to manage Safety Profile contact settings again."
                      : `The page someone sees if they find ${pet.name}.`
                }
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
                        href={ownerRoutes.petEdit(pet.id, { tab: "contact" })}
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

          {sharingProfileCount > 0 ? (
            <Link
              className={`${subcardActionClass} self-start`}
              href={ownerRoutes.petEdit(pet.id, {
                tab: publicProfilesEnabled ? "public" : "contact",
              })}
            >
              <Icon
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
                name="settings"
              />
              {publicProfilesEnabled && safetyProfilesOwnerUiEnabled
                ? "Manage sharing & safety"
                : publicProfilesEnabled
                  ? "Manage sharing"
                  : "Manage safety"}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          ) : null}

          {/* Lost Mode belongs to safety, but not inside either profile. */}
          {isActiveProfile ? (
            <LostModeControl
              onPetChange={onPetChange}
              pet={pet}
              variant="compact"
            />
          ) : null}
        </OverviewSummaryCard>
      ) : null}

      {trailingCardCount > 0 ? (
      <div
        className={`grid min-w-0 gap-5 ${
          trailingCardCount === 2 ? "lg:grid-cols-2" : ""
        }`}
      >

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
          title="Saved profile history"
          badge={<Badge tone="soft">Archived</Badge>}
          description="Memories and records stay saved."
        >
          <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
            Restore this profile from the menu at the top of this page.
          </p>
        </SectionCard>
      ) : null}
      </div>
      ) : null}
    </div>
  );
}

const summaryHeaderActionClass =
  "inline-flex min-h-10 shrink-0 items-center gap-1 px-1 text-sm font-extrabold text-pet-teal transition hover:underline";

const subcardActionClass =
  "inline-flex min-h-10 min-w-0 items-center gap-1.5 px-1 text-sm font-extrabold text-pet-teal transition hover:underline";

const subcardLinkClass =
  "inline-flex min-h-10 items-center gap-1 whitespace-nowrap px-1 text-sm font-extrabold text-pet-teal transition hover:underline";

/**
 * One of the two equal halves of Sharing & Safety. Both profiles get the same
 * shape - title, status, a line of description, optional metadata, one action
 * and one quiet link - so the Overview stays a summary rather than a settings
 * surface.
 */
function ProfileSubcard({
  action,
  ariaLabel,
  badge,
  description,
  link,
  meta,
  notice,
  title,
}: {
  action?: React.ReactNode;
  ariaLabel: string;
  badge: React.ReactNode;
  description: string;
  link?: React.ReactNode;
  meta?: string;
  notice?: React.ReactNode;
  title: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="grid min-w-0 gap-2 py-4 first:pt-0 last:pb-0 lg:px-4 lg:py-0 lg:first:pl-0 lg:last:pr-0"
      role="group"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-base font-black text-pet-ink">{title}</h3>
        {badge}
      </div>
      <p className="text-sm leading-5 text-pet-muted">{description}</p>
      {meta ? (
        <p className="text-xs font-bold leading-5 text-pet-muted">{meta}</p>
      ) : null}
      {notice}
      {action || link ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {action}
          {link}
        </div>
      ) : null}
    </div>
  );
}

function OverviewSummaryCard({
  action,
  icon,
  title,
  description,
  sectionId,
  children,
}: {
  action?: React.ReactNode;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  description: string;
  sectionId: "moments" | "care" | "sharing";
  children: React.ReactNode;
}) {
  return (
    <section
      className="brand-card flex min-w-0 flex-col gap-3 rounded-[1.5rem] p-4 sm:p-5"
      data-overview-section={sectionId}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f3ff] text-pet-teal">
            <Icon aria-hidden="true" className="h-4 w-4" name={icon} />
          </span>
          <h2 className="min-w-0 text-base font-black text-pet-ink sm:text-lg">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <p className="text-sm leading-5 text-pet-muted">{description}</p>
      {children}
    </section>
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
