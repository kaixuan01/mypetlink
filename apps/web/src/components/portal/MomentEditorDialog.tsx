"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MomentMediaField } from "@/components/portal/MomentMediaField";
import { DateInput } from "@/components/ui/DateInput";
import { FormDialog } from "@/components/ui/FormDialog";
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

type OwnerMomentVisibility = Exclude<MomentVisibility, "Family Only">;

const audienceOptions: Array<{
  value: OwnerMomentVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "Private",
    label: "Only me",
    description: "Keep this Moment private to your owner account.",
  },
  {
    value: "Public",
    label: "Anyone with the link",
    description: "Allow this Moment to appear on your pet's shared profile.",
  },
];

type MomentEditorValues = {
  title: string;
  date: string;
  type: "" | MomentType;
  caption: string;
  media: MomentMedia[];
  coverMediaId?: string;
  visibility: OwnerMomentVisibility;
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
  visibility: "Private",
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
  const dirty = valuesFingerprint(form) !== valuesFingerprint(initialValues);

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
      showInLifeTimeline: form.showInLifeTimeline,
      timelineNote: form.timelineNote.trim(),
    });
  }

  const dialogTitle = mode === "create" ? `Add a moment for ${petName}` : "Update this memory";
  const formId = `moment-editor-${mode}-form`;
  const primaryLabel = mode === "create" ? "Add Moment" : "Save Changes";

  return (
    <FormDialog
      cancelAction={{ disabled: submitting, label: "Cancel" }}
      closeLabel="Close moment editor"
      description="Add the details once, then choose where this memory appears."
      eyebrow={mode === "create" ? "Add Moment" : "Edit Moment"}
      onRequestClose={onRequestClose}
      open
      primaryAction={{
        disabled: submitting,
        form: formId,
        label: primaryLabel,
        pending: submitting,
        pendingLabel: "Saving...",
        type: "submit",
      }}
      title={dialogTitle}
    >
      <form
        className="grid gap-4"
        data-moment-editor-mode={mode}
        id={formId}
        onSubmit={handleSubmit}
      >
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
              </div>

              <fieldset className="grid gap-3">
                <legend className="text-sm font-bold text-pet-ink">
                  Who can see this Moment?
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {audienceOptions.map((option) => {
                    const descriptionId = `moment-editor-${mode}-audience-${option.value.toLowerCase()}-description`;

                    return (
                      <label
                        className="flex cursor-pointer items-start gap-3 rounded-[1.25rem] border border-pet-border bg-white p-4 text-sm text-pet-ink transition has-[:checked]:border-pet-teal has-[:checked]:bg-[#e8f8f0]"
                        key={option.value}
                      >
                        <input
                          aria-describedby={descriptionId}
                          aria-label={option.label}
                          checked={form.visibility === option.value}
                          className="mt-1 h-4 w-4 shrink-0 accent-pet-teal"
                          name={`moment-editor-${mode}-audience`}
                          onChange={() => updateField("visibility", option.value)}
                          type="radio"
                          value={option.value}
                        />
                        <span>
                          <span className="block font-bold">{option.label}</span>
                          <span
                            className="mt-1 block text-xs font-semibold leading-5 text-pet-muted"
                            id={descriptionId}
                          >
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

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

              <div className="grid gap-3">
                <MomentCheckbox
                  checked={form.showInLifeTimeline}
                  description="Include this Moment in your pet's Life Timeline. Private Moments stay private."
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
      </form>
    </FormDialog>
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
    visibility: normalizeOwnerVisibility(moment.visibility),
    showInLifeTimeline: moment.showInLifeTimeline,
    timelineNote: moment.timelineNote ?? "",
  };
}

function normalizeOwnerVisibility(
  visibility: MomentVisibility
): OwnerMomentVisibility {
  return visibility === "Public" ? "Public" : "Private";
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

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ].indexOf(`${month.slice(0, 1).toUpperCase()}${month.slice(1, 3).toLowerCase()}`);

  return monthIndex < 0
    ? ""
    : `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}
