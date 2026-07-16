"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MomentMediaField } from "@/components/portal/MomentMediaField";
import { DateInput } from "@/components/ui/DateInput";
import { Icon } from "@/components/ui/Icon";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import type {
  MomentMedia,
  MomentType,
  MomentVisibility,
  PetMoment,
  PetMomentPayload,
} from "@/types";

const momentCategories: MomentType[] = [
  "Birthday",
  "Adoption Day",
  "First Day Home",
  "Grooming Day",
  "Vet Visit",
  "Vaccination",
  "Achievement",
  "Funny Moment",
  "Training",
  "Outdoor / Trip",
  "Memory",
  "Other",
];

const visibilityOptions: MomentVisibility[] = [
  "Public",
  "Private",
  "Family Only",
];

type MomentEditorValues = {
  title: string;
  date: string;
  type: "" | MomentType;
  caption: string;
  media: MomentMedia[];
  coverMediaId?: string;
  visibility: MomentVisibility;
  showOnPublicProfile: boolean;
  showInLifeTimeline: boolean;
  timelineNote: string;
};

type FormErrors = Partial<Record<keyof MomentEditorValues, string>>;

type MomentEditorDialogProps = {
  mode: "create" | "edit";
  petName: string;
  initialMoment?: PetMoment;
  submitting: boolean;
  error?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onRequestClose: () => void;
  onSubmit: (payload: PetMomentPayload) => void | Promise<void>;
};

const emptyValues: MomentEditorValues = {
  title: "",
  date: "",
  type: "",
  caption: "",
  media: [],
  coverMediaId: undefined,
  visibility: "Public",
  showOnPublicProfile: true,
  showInLifeTimeline: false,
  timelineNote: "",
};

export function MomentEditorDialog({
  mode,
  petName,
  initialMoment,
  submitting,
  error,
  onDirtyChange,
  onRequestClose,
  onSubmit,
}: MomentEditorDialogProps) {
  const initialValues = useMemo(
    () => (initialMoment ? valuesFromMoment(initialMoment) : emptyValues),
    [initialMoment]
  );
  const [form, setForm] = useState<MomentEditorValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dirty = valuesFingerprint(form) !== valuesFingerprint(initialValues);

  useModalDialogFocus({
    dialogRef,
    initialFocusRef: closeRef,
    onEscape: onRequestClose,
  });

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    function preventAccidentalUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", preventAccidentalUnload);
    return () => window.removeEventListener("beforeunload", preventAccidentalUnload);
  }, [dirty]);

  function updateField<K extends keyof MomentEditorValues>(
    key: K,
    value: MomentEditorValues[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FormErrors = {};

    if (!form.title.trim()) {
      nextErrors.title = "Add a moment title.";
    }
    if (!form.date) {
      nextErrors.date = "Choose a moment date.";
    } else if (!isValidDate(form.date)) {
      nextErrors.date = "Choose a valid date.";
    }
    if (!form.type) {
      nextErrors.type = "Choose a moment category.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    void onSubmit({
      title: form.title.trim(),
      date: formatDisplayDate(form.date),
      type: form.type || "Other",
      caption: form.caption.trim(),
      media: form.media,
      coverMediaId: form.coverMediaId,
      visibility: form.visibility,
      showOnPublicProfile: form.showOnPublicProfile,
      showInLifeTimeline: form.showInLifeTimeline,
      timelineNote: form.timelineNote.trim(),
    });
  }

  const dialogTitle = mode === "create" ? `Add a moment for ${petName}` : "Update this memory";
  const descriptionId = `moment-editor-${mode}-description`;
  const titleId = `moment-editor-${mode}-title`;

  return (
    <div
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      className="fixed inset-0 z-40 grid bg-pet-ink/35 backdrop-blur-sm sm:place-items-center sm:p-4"
      data-moment-editor-mode={mode}
      role="dialog"
    >
      <button
        aria-label="Close moment editor"
        className="absolute inset-0 hidden cursor-default sm:block"
        onClick={onRequestClose}
        type="button"
      />
      <div
        className="relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-[2rem]"
        ref={dialogRef}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-pet-border px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-pet-coral">
              {mode === "create" ? "Add Moment" : "Edit Moment"}
            </p>
            <h2 className="mt-1 truncate text-xl font-black text-pet-ink sm:text-2xl" id={titleId}>
              {dialogTitle}
            </h2>
            <p className="mt-1 hidden text-sm leading-6 text-pet-muted sm:block" id={descriptionId}>
              Add the details once, then choose where this memory appears.
            </p>
          </div>
          <button
            aria-label="Close moment editor"
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full bg-pet-cream text-pet-muted transition hover:text-pet-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
            onClick={onRequestClose}
            ref={closeRef}
            type="button"
          >
            <Icon className="h-5 w-5 rotate-45" name="plus" />
          </button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div className="grid gap-4">
              {error ? (
                <div className="rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]" role="alert">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Field error={errors.title} label="Title">
                  <input
                    className="brand-input"
                    onChange={(event) => updateField("title", event.target.value)}
                    type="text"
                    value={form.title}
                  />
                </Field>
                <Field error={errors.date} label="Date">
                  <DateInput
                    onChange={(event) => updateField("date", event.target.value)}
                    value={form.date}
                  />
                </Field>
                <Field error={errors.type} label="Moment category">
                  <select
                    className="brand-input brand-select"
                    onChange={(event) => updateField("type", event.target.value as MomentEditorValues["type"])}
                    value={form.type}
                  >
                    <option value="">Select category</option>
                    {momentCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Visibility">
                  <select
                    className="brand-input brand-select"
                    onChange={(event) => updateField("visibility", event.target.value as MomentVisibility)}
                    value={form.visibility}
                  >
                    {visibilityOptions.map((visibility) => (
                      <option key={visibility} value={visibility}>{visibility}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Caption">
                <textarea
                  className="brand-input min-h-28"
                  onChange={(event) => updateField("caption", event.target.value)}
                  value={form.caption}
                />
              </Field>

              <MomentMediaField
                coverMediaId={form.coverMediaId}
                items={form.media}
                onChange={(media, coverMediaId) => {
                  setForm((current) => ({ ...current, media, coverMediaId }));
                  setErrors((current) => ({ ...current, media: undefined }));
                }}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <MomentCheckbox
                  checked={form.showOnPublicProfile}
                  description="Public memories appear in the Pet Memories gallery."
                  label="Show on Public Profile"
                  onChange={(value) => updateField("showOnPublicProfile", value)}
                />
                <MomentCheckbox
                  checked={form.showInLifeTimeline}
                  description="Timeline moments appear in your pet's Life Timeline when visibility allows."
                  label="Show in Life Timeline"
                  onChange={(value) => updateField("showInLifeTimeline", value)}
                />
              </div>

              {form.showInLifeTimeline ? (
                <Field label="Timeline note (optional)">
                  <input
                    className="brand-input"
                    onChange={(event) => updateField("timelineNote", event.target.value)}
                    placeholder="A short milestone note for the timeline"
                    type="text"
                    value={form.timelineNote}
                  />
                </Field>
              ) : null}

              <div className="rounded-[1.25rem] border border-pet-border bg-white p-4 text-sm leading-6 text-pet-muted">
                {form.visibility === "Public"
                  ? "Preview: this moment will appear where you selected it: Pet Memories, Life Timeline, or both."
                  : "Private and family-only memories stay inside the owner workspace until family access is available."}
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-pet-border bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              disabled={submitting}
              onClick={onRequestClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Saving..." : mode === "create" ? "Add Moment" : "Save Changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>
      {children}
      {error ? <span className="text-xs font-bold text-[#a63c2e]">{error}</span> : null}
    </label>
  );
}

function MomentCheckbox({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm font-bold text-pet-ink">
      <span>
        <span className="block">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-pet-muted">{description}</span>
      </span>
      <input
        aria-label={label}
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0 accent-pet-teal"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function valuesFromMoment(moment: PetMoment): MomentEditorValues {
  return {
    title: moment.title,
    date: parseDisplayDate(moment.date),
    type: moment.type,
    caption: moment.caption,
    media: moment.media ?? [],
    coverMediaId: moment.coverMediaId,
    visibility: moment.visibility,
    showOnPublicProfile: moment.showOnPublicProfile,
    showInLifeTimeline: moment.showInLifeTimeline,
    timelineNote: moment.timelineNote ?? "",
  };
}

function valuesFingerprint(values: MomentEditorValues) {
  return JSON.stringify({
    ...values,
    media: values.media.map(({ id, type, url, posterUrl, durationSeconds, caption, altText, sortOrder, sourceFile }) => ({
      id,
      type,
      url,
      posterUrl,
      durationSeconds,
      caption,
      altText,
      sortOrder,
      sourceFile: sourceFile
        ? `${sourceFile.name}:${sourceFile.size}:${sourceFile.lastModified}`
        : undefined,
    })),
  });
}

function isValidDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function parseDisplayDate(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = value.match(/^(\d{2}) ([A-Za-z]{3}) (\d{4})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ].indexOf(month);

  return monthIndex < 0
    ? ""
    : `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
}
