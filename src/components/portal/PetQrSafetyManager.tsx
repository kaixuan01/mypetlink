"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { QRDownloadButton } from "@/components/portal/QRDownloadButton";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import {
  defaultOwnerSettings,
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { normalizeStoredPhone } from "@/lib/phone";
import { ownerRoutes } from "@/lib/routes";
import { getPetById, updatePetLostMode } from "@/services/petService";
import { getPetTags } from "@/services/tagService";
import type { Pet, PetLostMode, PetTag } from "@/types";

type PetQrSafetyManagerProps = {
  initialPet: Pet;
  initialTags: PetTag[];
};

export function PetQrSafetyManager({
  initialPet,
  initialTags,
}: PetQrSafetyManagerProps) {
  const [pet, setPet] = useState(initialPet);
  const [tags, setTags] = useState(initialTags);
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const visibility = pet.visibility;
  const effectiveContact = getEffectivePetContact(pet, ownerSettings);
  const whatsappE164 = normalizeStoredPhone(effectiveContact.whatsappNumber);
  const phoneE164 = normalizeStoredPhone(effectiveContact.phoneNumber);
  const showWhatsapp = visibility.showWhatsapp && Boolean(whatsappE164);
  const showPhone = visibility.showPhone && Boolean(phoneE164);
  const showEmergencyNote = visibility.showEmergencyNote;
  const showGeneralArea = visibility.showGeneralArea;
  const isMemorial = pet.lifecycleStatus === "Memorial";
  const isArchived = pet.lifecycleStatus === "Archived";
  const activeTags = tags.filter(
    (tag) => tag.status === "Active" && !tag.isArchived
  );

  useEffect(() => {
    let active = true;
    const settingsTimer = window.setTimeout(() => {
      if (active) {
        setOwnerSettings(readOwnerSettings());
      }
    }, 0);

    Promise.all([getPetById(initialPet.id), getPetTags(initialPet.id)]).then(
      ([petResponse, tagsResponse]) => {
        if (!active) {
          return;
        }

        if (petResponse.data) {
          setPet(petResponse.data);
        }

        setTags(tagsResponse.data);
      }
    );

    return () => {
      active = false;
      window.clearTimeout(settingsTimer);
    };
  }, [initialPet.id]);

  function handlePetChange(updatedPet: Pet) {
    setPet(updatedPet);
  }

  return (
    <div className="grid gap-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <section className="brand-soft-card rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase text-pet-teal">
              QR Safety Page
            </p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-pet-ink sm:text-4xl">
              {pet.name}&apos;s QR Safety Page
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
              Manage what finders see when they scan {pet.name}&apos;s safety
              QR.
            </p>
          </div>
          <CTAButton href={ownerRoutes.petEdit(pet.id)} icon="settings">
            Edit Safety Settings
          </CTAButton>
        </div>
      </section>

      {isMemorial ? (
        <section className="brand-card rounded-[1.75rem] p-5">
          <Badge tone="soft">Memorial Mode</Badge>
          <h2 className="mt-3 text-xl font-black text-pet-ink">
            QR Safety contact actions are turned off.
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            This profile is in Memorial Mode. People can still view the
            memorial profile, but finder contact buttons are hidden.
          </p>
          <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
            Consider disabling or archiving physical tags that are no longer in
            use.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <CTAButton
              href={pet.publicProfilePath}
              icon="heart"
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
            >
              View Memorial Profile
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petTags(pet.id)}
              icon="tag"
              variant="outline"
            >
              Manage Physical Tags
            </CTAButton>
          </div>
        </section>
      ) : null}

      {isArchived ? (
        <section className="brand-card rounded-[1.75rem] p-5">
          <Badge tone="soft">Archived</Badge>
          <h2 className="mt-3 text-xl font-black text-pet-ink">
            Restore this profile to manage QR Safety settings.
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            This profile is archived. Memories, records, tags, and order history
            stay saved, but emergency finder contact actions are hidden.
          </p>
          <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
            Consider disabling or archiving physical tags that are no longer in
            use.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <CTAButton href={ownerRoutes.petEdit(pet.id)} icon="settings">
              Open Profile Status
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petTags(pet.id)}
              icon="tag"
              variant="outline"
            >
              Manage Physical Tags
            </CTAButton>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-5">
          <section className="brand-card rounded-[1.75rem] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-pet-ink">
                  QR Safety Page link
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  You can share this page anytime. Active physical tags open
                  this same safety page.
                </p>
              </div>
              <Badge tone={pet.qrSafetyEnabled ? "mint" : "warm"}>
                {pet.qrSafetyEnabled ? "Active" : "Not active"}
              </Badge>
            </div>
            <ShareProfileLink
              className="mt-4 shadow-none"
              label="QR Safety Page URL"
              path={pet.qrSafetyPath}
              petName={pet.name}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CTAButton
                href={pet.qrSafetyPath}
                icon="qr"
                target="_blank"
                rel="noopener noreferrer"
                fullWidth
              >
                View QR Safety Page
              </CTAButton>
              <QRDownloadButton pet={pet} />
            </div>
          </section>

          <section className="brand-card rounded-[1.75rem] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-pet-ink">
                  Finder contact actions
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  Choose which contact buttons people can use when they find
                  {` ${pet.name}`}.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatusTile
                label="WhatsApp button"
                shown={showWhatsapp}
                value={showWhatsapp ? "Shown" : "Hidden"}
              />
              <StatusTile
                label="Call button"
                shown={showPhone}
                value={showPhone ? "Shown" : "Hidden"}
              />
              <StatusTile
                label="Send Found Location"
                shown={showWhatsapp}
                value={showWhatsapp ? "Available" : "Hidden"}
              />
            </div>
            <CTAButton
              className="mt-4"
              href={ownerRoutes.petEdit(pet.id)}
              icon="settings"
              variant="outline"
            >
              Edit Safety Settings
            </CTAButton>
          </section>

          <section className="brand-card rounded-[1.75rem] p-5">
            <h2 className="text-xl font-black text-pet-ink">Safety notes</h2>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              These notes help finders keep {pet.name} calm and safe.
            </p>
            <div className="mt-4 grid gap-3">
              <InfoRow
                label="General area"
                status={showGeneralArea ? "Shown" : "Hidden"}
                value={effectiveContact.generalArea}
              />
              <InfoRow label="Safety note" status="Shown" value={pet.safetyNote} />
              <InfoRow
                label="Emergency note"
                status={showEmergencyNote ? "Shown" : "Hidden"}
                value={pet.emergencyNote}
              />
            </div>
            <p className="mt-4 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
              Your full address is never shown publicly.
            </p>
          </section>
        </div>

        <div className="grid gap-5 content-start">
          {isMemorial || isArchived ? null : (
            <LostModePanel pet={pet} onPetChange={handlePetChange} />
          )}

          <section className="brand-card rounded-[1.75rem] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-pet-ink">
                  Physical tags
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  Active physical tags open this QR Safety Page. Lost or
                  disabled tags will show an inactive tag page.
                </p>
              </div>
              <Badge tone={activeTags.length ? "mint" : "soft"}>
                {activeTags.length
                  ? `${activeTags.length} active`
                  : "No active tag"}
              </Badge>
            </div>
            <div className="mt-5 grid gap-3">
              <CTAButton
                href={ownerRoutes.petTags(pet.id)}
                icon="tag"
                variant="outline"
                fullWidth
              >
                Manage Physical Tags
              </CTAButton>
              <CTAButton
                href={ownerRoutes.petTagOrder(pet.id)}
                icon="tag"
                variant="secondary"
                fullWidth
              >
                Order Physical Tag
              </CTAButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusTile({
  label,
  shown,
  value,
}: {
  label: string;
  shown: boolean;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
      <p
        className={`mt-2 inline-flex items-center gap-2 text-sm font-black ${
          shown ? "text-pet-sage" : "text-pet-muted"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            shown ? "bg-pet-sage" : "bg-pet-muted/40"
          }`}
        />
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  status,
  value,
}: {
  label: string;
  status: "Shown" | "Hidden";
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] bg-pet-cream p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
        <Badge tone={status === "Shown" ? "mint" : "soft"}>{status}</Badge>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-pet-ink">
        {value || "Not set"}
      </p>
    </div>
  );
}

function LostModePanel({
  onPetChange,
  pet,
}: {
  onPetChange: (pet: Pet) => void;
  pet: Pet;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<PetLostMode>(() => getLostModeDraft(pet));

  function openEditor() {
    setDraft(getLostModeDraft(pet));
    setIsEditing(true);
  }

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
    const response = await updatePetLostMode(pet.id, false, pet.lostMode);

    if (response.data) {
      onPetChange(response.data);
    }

    setIsSaving(false);
  }

  return (
    <>
      <section className="brand-card rounded-[1.75rem] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-pet-ink">Lost Mode</h2>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              Use Lost Mode when {pet.name} is missing, so finders see urgent
              instructions.
            </p>
          </div>
          <Badge tone={pet.lostModeEnabled ? "danger" : "soft"}>
            {pet.lostModeEnabled ? "Active" : "Off"}
          </Badge>
        </div>

        {pet.lostModeEnabled ? (
          <div className="mt-4 grid gap-3">
            <div className="rounded-[1.25rem] bg-[#fff1ee] p-4">
              <p className="text-sm font-black text-pet-coral">
                {pet.name} is currently missing
              </p>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                {pet.lostMode.lostMessage}
              </p>
            </div>
            <InfoRow
              label="Last seen"
              status="Shown"
              value={pet.lostMode.lastSeenArea || "Not set"}
            />
          </div>
        ) : (
          <p className="mt-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
            Lost Mode is off. The QR Safety Page still shows normal finder
            contact actions.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <CTAButton
            icon="shield"
            onClick={openEditor}
            variant={pet.lostModeEnabled ? "secondary" : "coral"}
            fullWidth
          >
            {pet.lostModeEnabled ? "Edit Lost Mode" : "Mark as Lost"}
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
      </section>

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
              Add clear details so people nearby know what to do.
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
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      lostMessage: event.target.value,
                    }))
                  }
                  value={draft.lostMessage}
                />
              </LostModeField>
              <LostModeField label="Reward note">
                <input
                  className="brand-input"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      rewardNote: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  type="text"
                  value={draft.rewardNote}
                />
              </LostModeField>
              <LostModeField label="Extra contact instruction">
                <textarea
                  className="brand-input min-h-24"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      extraContactInstruction: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  value={draft.extraContactInstruction}
                />
              </LostModeField>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                onClick={() => setIsEditing(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
                disabled={isSaving}
                onClick={saveLostMode}
                type="button"
              >
                {isSaving ? "Saving..." : "Save Lost Mode"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LostModeField({
  children,
  label,
}: {
  children: ReactNode;
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
