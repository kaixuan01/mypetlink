"use client";

import { useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { Icon } from "@/components/ui/Icon";
import { formatFinderDateTime } from "@/lib/dateTime";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import {
  getFriendlyApiErrorMessage,
  updatePetLostMode,
} from "@/services/petService";
import type { Pet, PetLostMode } from "@/types";

type LostModeControlProps = {
  pet: Pet;
  onPetChange: (pet: Pet) => void;
  variant?: "card" | "compact";
};

export function LostModeControl({
  pet,
  onPetChange,
  variant = "card",
}: LostModeControlProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingFound, setConfirmingFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const savingRef = useRef(false);
  const editorTitleId = useId();
  const [draft, setDraft] = useState<PetLostMode>(() =>
    getLostModeDraft(pet)
  );

  async function changeLostMode(enabled: boolean) {
    if (savingRef.current) {
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setMessage("");
    setHasError(false);

    try {
      const response = await updatePetLostMode(pet.id, enabled, {
        ...draft,
        lostMessage:
          draft.lostMessage.trim() ||
          `${pet.name} is currently missing. If you have found ${pet.name}, please contact the owner immediately.`,
      });

      const savedPet = response.data;
      if (!savedPet || savedPet.lostModeEnabled !== enabled) {
        throw new Error("Lost Mode update was not confirmed");
      }

      onPetChange(savedPet);
      setDraft(getLostModeDraft(savedPet));
      setMessage(
        savedPet.lostModeEnabled
          ? `Lost Mode is now on for ${savedPet.name}.`
          : `${savedPet.name} is now marked as found. Lost Mode is off.`
      );
      if (savedPet.lostModeEnabled) {
        setIsEditing(false);
      }
    } catch (caught) {
      setHasError(true);
      setMessage(getFriendlyApiErrorMessage(caught));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function saveLostMode() {
    void changeLostMode(true);
  }

  function markAsFound() {
    setConfirmingFound(false);
    void changeLostMode(false);
  }

  function openLostModeEditor() {
    setDraft(getLostModeDraft(pet));
    setMessage("");
    setHasError(false);
    setIsEditing(true);
  }

  const body = (
    <>
      {pet.lostModeEnabled ? (
        <div className="grid gap-3">
          <div className="rounded-[1.25rem] bg-[#fff1ee] p-4">
            <p className="text-sm font-black text-pet-coral">
              {pet.name} is currently marked missing
            </p>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              The Public Share Profile and Safety Profile show an urgent missing
              pet notice. Active smart tags continue to work.
            </p>
          </div>
          {variant === "card" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniInfo
                label="Last seen area"
                value={pet.lostMode.lastSeenArea || "Not set"}
              />
              <MiniInfo
                label="Last seen date/time"
                value={
                  formatFinderDateTime(pet.lostMode.lastSeenDateTime) ||
                  "Not set"
                }
              />
              {pet.lostMode.rewardNote ? (
                <div className="sm:col-span-2">
                  <MiniInfo
                    label="Reward note"
                    value={pet.lostMode.rewardNote}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
          Turn this on only when {pet.name} is missing. It adds a clear missing
          pet notice to the Public Share Profile and makes the Safety Profile
          more urgent without disabling active smart tags.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-70 ${
            pet.lostModeEnabled
              ? "border border-pet-border bg-white text-pet-ink hover:bg-pet-cream"
              : "bg-pet-coral text-white hover:bg-[#f26155]"
          }`}
          disabled={isSaving}
          onClick={openLostModeEditor}
          type="button"
        >
          <Icon name="shield" className="h-4 w-4" />
          {pet.lostModeEnabled
            ? "Edit Lost Mode"
            : `Mark ${pet.name} as Lost`}
        </button>
        {pet.lostModeEnabled ? (
          <button
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-bold text-white transition hover:bg-[#087f93] disabled:cursor-wait disabled:opacity-70"
            disabled={isSaving}
            onClick={() => setConfirmingFound(true)}
            type="button"
          >
            {isSaving ? "Updating..." : `Mark ${pet.name} as Found`}
          </button>
        ) : null}
      </div>

      {message && (!isEditing || !hasError) ? (
        <p
          className={`rounded-[1rem] px-4 py-3 text-sm font-bold leading-6 ${
            hasError
              ? "bg-[#fff1ee] text-[#a63c2e]"
              : "bg-[#eaf8f1] text-[#277a55]"
          }`}
          role={hasError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      {variant === "card" ? (
        <section className="brand-card flex min-w-0 flex-col gap-4 rounded-[1.75rem] p-6">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <h2 className="min-w-0 text-lg font-black text-pet-ink">
                Lost Mode
              </h2>
            </div>
            <Badge tone={pet.lostModeEnabled ? "danger" : "soft"}>
              {pet.lostModeEnabled ? "On" : "Off"}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-pet-muted">
            Use this only when your pet is actually missing. Finders will see a
            clearer missing pet notice.
          </p>
          {body}
        </section>
      ) : (
        <section className="grid min-w-0 gap-4 rounded-[1.25rem] border border-pet-border bg-white p-4 sm:p-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-black text-pet-ink">Lost Mode</h2>
                <p className="mt-0.5 text-xs font-semibold text-pet-muted">
                  Current status
                </p>
              </div>
            </div>
            <Badge tone={pet.lostModeEnabled ? "danger" : "soft"}>
              {pet.lostModeEnabled ? "On" : "Off"}
            </Badge>
          </div>
          {body}
        </section>
      )}

      {isEditing ? (
        <LostModeEditorShell
          labelledBy={editorTitleId}
          onEscape={() => {
            if (!savingRef.current) {
              setIsEditing(false);
            }
          }}
        >
            <h2 className="text-2xl font-black text-pet-ink" id={editorTitleId}>
              {pet.lostModeEnabled
                ? "Edit Lost Mode"
                : `Mark ${pet.name} as lost?`}
            </h2>
            <p className="mt-3 text-sm leading-6 text-pet-muted">
              Lost Mode tells finders your pet is missing. It does not disable
              active smart tags.
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
                <DateInput
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
              <LostModeField
                helper="For example: RM50 reward offered."
                label="Reward note (optional)"
              >
                <input
                  className="brand-input"
                  maxLength={120}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      rewardNote: event.target.value,
                    }))
                  }
                  type="text"
                  value={draft.rewardNote}
                />
              </LostModeField>
              <LostModeField
                helper="For example: Please call instead of messaging."
                label="Contact instructions (optional)"
              >
                <input
                  className="brand-input"
                  maxLength={160}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      extraContactInstruction: event.target.value,
                    }))
                  }
                  type="text"
                  value={draft.extraContactInstruction}
                />
              </LostModeField>
            </div>

            {hasError && message ? (
              <p
                className="mt-4 rounded-[1rem] bg-[#fff1ee] px-4 py-3 text-sm font-bold text-[#a63c2e]"
                role="alert"
              >
                {message}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:opacity-70"
                disabled={isSaving}
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
        </LostModeEditorShell>
      ) : null}

      <ConfirmDialog
        confirmLabel="Mark as Found"
        message={`This will turn off Lost Mode for ${pet.name}. The missing pet notices will be removed from the Public Share Profile and Safety Profile.`}
        onCancel={() => setConfirmingFound(false)}
        onConfirm={markAsFound}
        open={confirmingFound}
        title={`Mark ${pet.name} as found?`}
      />
    </>
  );
}

// Mounted only while the editor is open so the shared modal focus behavior
// (initial focus, Tab trap, Escape, focus restore) applies per opening.
function LostModeEditorShell({
  children,
  labelledBy,
  onEscape,
}: {
  children: React.ReactNode;
  labelledBy: string;
  onEscape: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useModalDialogFocus({ dialogRef, onEscape });

  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6"
        ref={dialogRef}
      >
        {children}
      </div>
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
  helper,
  label,
}: {
  children: React.ReactNode;
  helper?: string;
  label: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-pet-ink">{label}</span>
      {helper ? (
        <span className="text-xs font-semibold leading-5 text-pet-muted">
          {helper}
        </span>
      ) : null}
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
