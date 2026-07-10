"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getQrStatusBadge,
  getSmartTagStatusBadge,
} from "@/components/portal/ProfileAccessStatus";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { QrCodeButton } from "@/components/qr/QrCodeButton";
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
import { getMemoryLimitState } from "@/lib/planLimits";
import { getPetProfileTheme } from "@/lib/petProfileThemes";
import { isActivePet, isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import { smartTagOrderingEnabled } from "@/lib/features";
import { ownerRoutes, tagPath } from "@/lib/routes";
import { getServerFallbackBaseUrl, toAbsoluteUrl } from "@/lib/siteUrl";
import { getTagScanDisplay, isActivePhysicalTagForPet } from "@/lib/tagStatus";
import { isApiConfigured } from "@/services/apiConfig";
import { getPetMoments } from "@/services/momentService";
import { getPetById, updatePetLostMode } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type {
  CareRecord,
  Pet,
  PetLostMode,
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
  { id: "tag", label: "Smart Tag", mobileLabel: "Tag" },
  { id: "privacy", label: "Privacy" },
];

export function PetManagementTabs({
  pet,
  records,
  moments,
  orders = [],
  tags,
}: PetManagementTabsProps) {
  const apiMode = isApiConfigured();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [currentPet, setCurrentPet] = useState(pet);
  const [currentRecords, setCurrentRecords] = useState<CareRecord[]>(
    apiMode ? [] : records
  );
  const [currentMoments, setCurrentMoments] = useState<PetMoment[]>(
    apiMode ? [] : moments
  );

  // The page is server-rendered from seed data; re-read the pet on the client so
  // persisted edits (e.g. Lost Mode) survive a refresh and match the QR safety
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

    Promise.all([
      getPetRecords(currentPet.id),
      getPetMoments(currentPet.id),
    ])
      .then(([recordResponse, momentResponse]) => {
        if (active) {
          setCurrentRecords(recordResponse.data);
          setCurrentMoments(momentResponse.data);
        }
      })
      .catch(() => {
        if (active) {
          setCurrentRecords([]);
          setCurrentMoments([]);
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
          onPetChange={setCurrentPet}
          orders={orders}
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
}: {
  pet: Pet;
  records: CareRecord[];
  moments: PetMoment[];
  onPetChange: (pet: Pet) => void;
  orders: TagOrder[];
  tags: PetTag[];
}) {
  const recentRecords = records.slice(0, 3);
  const recentMoments = moments.slice(0, 3);
  const memoryLimit = getMemoryLimitState(moments.length);
  const currentTags = tags.filter((tag) => !tag.isArchived);
  const activeTag = currentTags.find((tag) => isActivePhysicalTagForPet(tag, pet));
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const activeTagScanDisplay = activeTag
    ? getTagScanDisplay(activeTag, undefined, pet)
    : null;
  const activeTagScanPath = activeTag ? tagPath(activeTag.tagCode) : "";
  const activeTagScanUrl =
    activeTag && activeTagScanPath ? toAbsoluteUrl(activeTagScanPath, origin) : "";
  const theme = getPetProfileTheme(pet.profileTheme);
  const qrBadge = getQrStatusBadge(pet.qrStatus, pet.qrSafetyPath, pet);
  const smartTagBadge = getSmartTagStatusBadge(tags, orders, pet);
  const isMemorial = isMemorialPet(pet);
  const isArchived = isArchivedPet(pet);
  const isActiveProfile = isActivePet(pet);
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const effectiveContact = getEffectivePetContact(pet, ownerSettings);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOwnerSettings(readOwnerSettings());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      {/* Public Share Profile */}
      <SectionCard
        icon="heart"
        title="Public Share Profile"
        badge={<Badge tone="mint">{theme.name} theme</Badge>}
        description="The friendly page you share with family, friends, and pet communities."
      >
        <LinkActionPanel
          copyLabel="Copy Link"
          copyMessage="Public Share Profile link copied."
          fileNameBase={`${pet.slug}-share-profile-qr`}
          helperText="Share your pet's public profile with friends and family."
          path={pet.publicProfilePath}
          qrTitle="Share Profile QR"
          url={toAbsoluteUrl(pet.publicProfilePath, origin)}
          viewLabel={isMemorial ? "View Memorial Profile" : "View Public Profile"}
        />
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={pet.publicProfilePath}
            variant="secondary"
            icon="heart"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            {isMemorial ? "View Memorial Profile" : "View Public Profile"}
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit Public Profile Settings
          </CTAButton>
        </div>
      </SectionCard>

      {/* QR Safety Page */}
      <SectionCard
        icon="qr"
        title="QR Safety Page"
        badge={
          <Badge tone={qrBadge.tone}>{qrBadge.label}</Badge>
        }
        description={
          isMemorial
            ? "Memorial profiles keep QR Safety contact actions turned off."
            : isArchived
              ? "Restore this profile to manage QR Safety contact settings again."
              : "This is the page people see when they find your pet. You can share it anytime."
        }
      >
        <LinkActionPanel
          copyLabel="Copy Link"
          copyMessage="QR Safety Page link copied."
          fileNameBase={`${pet.slug}-qr-safety-page`}
          helperText="Use this safety page if someone finds your pet."
          path={pet.qrSafetyPath}
          qrTitle="QR Safety Page QR"
          url={toAbsoluteUrl(pet.qrSafetyPath, origin)}
          viewLabel="View QR Safety Page"
          warning={
            isActiveProfile
              ? undefined
              : "This profile is inactive, so the QR Safety Page does not reveal finder contact details."
          }
        />
        <div className="rounded-[1.25rem] bg-pet-cream p-4">
          <p className="text-xs font-bold uppercase text-pet-muted">
            General area
          </p>
          <p className="mt-1 font-black text-pet-ink">
            {effectiveContact.generalArea}
          </p>
        </div>
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={pet.qrSafetyPath}
            variant="secondary"
            icon="qr"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            View QR Safety Page
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit Safety Settings
          </CTAButton>
        </div>
      </SectionCard>

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
            href={ownerRoutes.petEdit(pet.id)}
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
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Open Profile Status
          </CTAButton>
        </SectionCard>
      ) : (
        <LostModeCard pet={pet} onPetChange={onPetChange} />
      )}

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
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={ownerRoutes.petRecords(pet.id)}
            variant="secondary"
            icon="record"
            fullWidth
          >
            Manage Care Records
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petRecords(pet.id)}
            variant="outline"
            icon="plus"
            fullWidth
          >
            Add Care Record
          </CTAButton>
        </div>
      </SectionCard>

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
                className="flex items-center justify-between gap-2 rounded-[1rem] bg-pet-cream px-4 py-3"
                key={moment.id}
              >
                <div className="min-w-0">
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
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={ownerRoutes.petMoments(pet.id)}
            variant="secondary"
            icon="heart"
            fullWidth
          >
            Manage Pet Memories
          </CTAButton>
          <CTAButton
            disabled={!memoryLimit.canCreate}
            href={memoryLimit.canCreate ? ownerRoutes.petMomentNew(pet.id) : undefined}
            variant="outline"
            icon="plus"
            fullWidth
          >
            {memoryLimit.canCreate ? "Add Memory" : "Memory Limit Reached"}
          </CTAButton>
        </div>
      </SectionCard>

      {/* Smart Tags */}
      <SectionCard
        icon="tag"
        title="Smart Tags"
        badge={<Badge tone={smartTagBadge.tone}>{smartTagBadge.label}</Badge>}
        description={
          isMemorial
            ? "Physical tags linked to this memorial are kept as history and show an inactive scan page."
            : isArchived
              ? "Restore this profile before using physical tags again."
              : "Physical QR or QR + NFC tags. Active tags open this pet's QR Safety Page."
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
              <LinkActionPanel
                copyLabel="Copy Link"
                copyMessage="Physical Tag Scan Page link copied."
                fileNameBase={`${activeTag.tagCode}-physical-tag-qr`}
                helperText="This QR belongs to the physical tag linked to this pet."
                path={activeTagScanPath}
                qrTitle="Physical Tag QR"
                url={activeTagScanUrl}
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
          <p className="text-sm leading-6 text-pet-muted">
            {isMemorial
              ? `Physical tags linked to ${pet.name} are historical and no longer show finder contact actions.`
              : isArchived
                ? `Physical tags linked to ${pet.name} are inactive while this profile is archived.`
                : `No active physical tag right now. ${pet.name}'s QR Safety Page is still ready to share, and you can order a tag when needed.`}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={ownerRoutes.petTags(pet.id)}
            variant="secondary"
            icon="tag"
            fullWidth
          >
            Manage Smart Tags
          </CTAButton>
          {isActiveProfile && smartTagOrderingEnabled ? (
            <CTAButton
              href={ownerRoutes.petTagOrder(pet.id)}
              variant="outline"
              icon="plus"
              fullWidth
            >
              Order Physical Tag
            </CTAButton>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return getServerFallbackBaseUrl();
}

function LinkActionPanel({
  copyLabel,
  copyMessage,
  fileNameBase,
  helperText,
  path,
  qrTitle,
  url,
  viewLabel,
  warning,
}: {
  copyLabel: string;
  copyMessage: string;
  fileNameBase: string;
  helperText: string;
  path: string;
  qrTitle: string;
  url: string;
  viewLabel: string;
  warning?: string;
}) {
  const [status, setStatus] = useState("");

  async function handleCopy() {
    const copied = await copyText(url);
    setStatus(copied ? copyMessage : "Copy unavailable. Select and copy the link.");
    window.setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p
        aria-label={`${qrTitle} link`}
        className="select-all break-all rounded-[1rem] border border-pet-border bg-white px-3 py-2 text-xs font-bold leading-5 text-pet-ink"
        role="textbox"
        tabIndex={0}
      >
        {url}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          onClick={handleCopy}
          type="button"
        >
          <Icon name="copy" className="h-4 w-4" />
          {copyLabel}
        </button>
        <CTAButton
          href={path}
          icon="qr"
          rel="noopener noreferrer"
          target="_blank"
          variant="secondary"
          fullWidth
        >
          {viewLabel}
        </CTAButton>
        <QrCodeButton
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          fileNameBase={fileNameBase}
          helperText={helperText}
          label="Show QR"
          targetPath={path}
          title={qrTitle}
          viewLabel={viewLabel}
          warning={warning}
        />
      </div>
      {status ? (
        <p className="text-xs font-bold text-pet-sage" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Try the textarea copy path below.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

function LostModeCard({
  onPetChange,
  pet,
}: {
  onPetChange: (pet: Pet) => void;
  pet: Pet;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<PetLostMode>(() =>
    getLostModeDraft(pet)
  );

  async function saveLostMode() {
    setIsSaving(true);
    const response = await updatePetLostMode(pet.id, true, {
      ...draft,
      lostMessage:
        draft.lostMessage.trim() ||
        `${pet.name} is currently missing. If you have found ${pet.name}, please contact the owner immediately.`,
    });

    if (response.data) {
      onPetChange(response.data);
    }

    setIsSaving(false);
    setIsEditing(false);
  }

  async function turnOffLostMode() {
    setIsSaving(true);
    const response = await updatePetLostMode(pet.id, false, draft);

    if (response.data) {
      onPetChange(response.data);
    }

    setIsSaving(false);
  }

  function openLostModeEditor() {
    setDraft(getLostModeDraft(pet));
    setIsEditing(true);
  }

  return (
    <>
      <SectionCard
        icon="shield"
        title="Lost Mode"
        badge={
          pet.lostModeEnabled ? (
            <Badge tone="danger">Lost Mode Active</Badge>
          ) : (
            <Badge tone="soft">Off</Badge>
          )
        }
        description="Use this only when your pet is actually missing. Finders will see a clearer missing pet notice."
      >
        {pet.lostModeEnabled ? (
          <div className="grid gap-3">
            <div className="rounded-[1.25rem] bg-[#fff1ee] p-4">
              <p className="text-sm font-black text-pet-coral">
                {pet.name} is currently missing
              </p>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                {pet.lostMode.lostMessage}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniInfo
                label="Last seen area"
                value={pet.lostMode.lastSeenArea || "Not set"}
              />
              <MiniInfo
                label="Last seen date/time"
                value={pet.lostMode.lastSeenDateTime || "Not set"}
              />
            </div>
            {pet.lostMode.rewardNote ? (
              <MiniInfo label="Reward note" value={pet.lostMode.rewardNote} />
            ) : null}
          </div>
        ) : (
          <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
            Lost Mode adds a missing pet banner to the public profile and makes
            the QR safety page more urgent while active tags still work.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            icon="shield"
            onClick={openLostModeEditor}
            variant={pet.lostModeEnabled ? "secondary" : "coral"}
            fullWidth
          >
            {pet.lostModeEnabled ? "Edit Lost Mode" : `Mark ${pet.name} as Lost`}
          </CTAButton>
          {pet.lostModeEnabled ? (
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-wait disabled:opacity-70"
              disabled={isSaving}
              onClick={turnOffLostMode}
              type="button"
            >
              Turn Off Lost Mode
            </button>
          ) : null}
        </div>
      </SectionCard>

      {isEditing ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
        >
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
            <h2 className="text-2xl font-black text-pet-ink">
              {pet.lostModeEnabled ? "Edit Lost Mode" : `Mark ${pet.name} as lost?`}
            </h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              Lost Mode tells finders your pet is missing. It does not disable
              your active tags.
            </p>

            <div className="mt-5 grid gap-4">
              <LostModeField label="Last seen area">
                <input
                  className="brand-input"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      lastSeenArea: event.target.value,
                    }))
                  }
                  placeholder="Petaling Jaya, Selangor"
                  type="text"
                  value={draft.lastSeenArea}
                />
              </LostModeField>
              <LostModeField label="Last seen date/time">
                <input
                  className="brand-input"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      lastSeenDateTime: event.target.value,
                    }))
                  }
                  type="datetime-local"
                  value={draft.lastSeenDateTime}
                />
              </LostModeField>
              <LostModeField label="Message for finder">
                <textarea
                  className="brand-input min-h-28"
                  maxLength={260}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      lostMessage: event.target.value,
                    }))
                  }
                  value={draft.lostMessage}
                />
              </LostModeField>
              <LostModeField label="Reward note optional">
                <input
                  className="brand-input"
                  maxLength={120}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      rewardNote: event.target.value,
                    }))
                  }
                  placeholder="Reward offered for safe return"
                  type="text"
                  value={draft.rewardNote}
                />
              </LostModeField>
              <LostModeField label="Extra contact instruction optional">
                <input
                  className="brand-input"
                  maxLength={160}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      extraContactInstruction: event.target.value,
                    }))
                  }
                  placeholder="Please WhatsApp first if possible"
                  type="text"
                  value={draft.extraContactInstruction}
                />
              </LostModeField>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={() => setIsEditing(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-pet-coral px-5 py-3 text-sm font-bold text-white transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
                disabled={isSaving}
                onClick={saveLostMode}
                type="button"
              >
                {isSaving
                  ? "Saving..."
                  : pet.lostModeEnabled
                    ? "Save Lost Mode"
                    : "Activate Lost Mode"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
      <SectionCard
        icon="heart"
        title="Public profile visibility"
        description="What friends and family see on the shareable public profile."
      >
        <StatusGrid items={publicStatuses} />
        <div className="mt-auto pt-1">
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit public profile settings
          </CTAButton>
        </div>
      </SectionCard>

      <SectionCard
        icon="qr"
        title="QR safety page visibility"
        description="What a finder sees after scanning the physical tag."
      >
        <StatusGrid items={safetyStatuses} />
        <div className="mt-auto pt-1">
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit QR safety settings
          </CTAButton>
        </div>
      </SectionCard>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-pet-ink">
        {value}
      </p>
    </div>
  );
}

function LostModeField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-pet-ink">{label}</span>
      {children}
    </label>
  );
}

function getLostModeDraft(pet: Pet): PetLostMode {
  return {
    lastSeenArea: pet.lostMode.lastSeenArea || pet.generalArea,
    lastSeenDateTime: pet.lostMode.lastSeenDateTime || "",
    lostMessage:
      pet.lostMode.lostMessage ||
      `${pet.name} is currently missing. If you have found ${pet.name}, please contact the owner immediately.`,
    rewardNote: pet.lostMode.rewardNote || "",
    extraContactInstruction: pet.lostMode.extraContactInstruction || "",
  };
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
