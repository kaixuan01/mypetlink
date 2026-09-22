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
import { MomentPetSelector } from "@/components/portal/MomentPetSelector";
import type {
  MomentMedia,
  MomentType,
  MomentVisibility,
  PetListItem,
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

/**
 * Who actually sees a Moment.
 *
 * "Anyone with the link" was wrong, and wrong in the direction that matters:
 * it is the standard phrase for unlisted, so an owner read it as "nobody finds
 * this unless I send it". A Public Moment appears on the pet's Share Profile,
 * on the household's Community Profile, on its own page, in the feed of
 * everyone who follows them, and — once the household and the pet are
 * discoverable — in Explore, where strangers browse.
 *
 * One switch drives all of that: `showOnPublicProfile` is derived from this
 * value, it is not a second choice. So the label has to name the widest
 * audience, not the narrowest.
 */
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
    label: "Shared publicly",
    description:
      "Appears on your pet's Share Profile and your Community Profile, and may appear in Community feeds or Explore when your profile and pet are discoverable.",
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
  /** Additional owned pets. The primary pet is never in this list. */
  additionalPetIds: string[];
};

type FormErrors = Partial<Record<keyof MomentEditorValues, string>>;

type MomentEditorDialogProps = {
  mode: "create" | "edit";
  petName: string;
  /**
   * The pet this Moment belongs to, plus the owner's other pets. Supplied only
   * where the caller knows them; without it the subject selector is simply not
   * offered and the Moment is about its primary pet alone.
   */
  primaryPet?: PetListItem;
  otherPets?: PetListItem[];
  /**
   * Lets the caller offer a choice of which pet the Moment is mainly about.
   *
   * The Owner Portal never needs this: it opens from a pet's own page, so the
   * primary subject is already decided by the route. Community Share has no pet
   * context at all — it is reached from a feed — so it supplies the owner's pets
   * and handles the choice here rather than in a separate step, which would
   * mean two dialogs to write one Moment.
   *
   * Supplied together or not at all; without both, the selector is not offered
   * and nothing about the existing flow changes.
   */
  primaryPetOptions?: PetListItem[];
  onPrimaryPetChange?: (petId: string) => void;
  /**
   * Wording and width for the surface this editor is opening on.
   *
   * The Owner Portal is a management context and says "Add a moment for
   * Mochi"; Community is a sharing one and says "Share a Moment", because the
   * nav item somebody just pressed says Share. Same editor, same rules — only
   * the words around them belong to the place they were opened from.
   */
  dialogTitle?: string;
  dialogDescription?: string;
  submitLabel?: string;
  maxWidthClassName?: string;
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
  additionalPetIds: [],
};

export function MomentEditorDialog({
  mode,
  petName,
  primaryPet,
  otherPets = [],
  primaryPetOptions,
  onPrimaryPetChange,
  dialogTitle: dialogTitleOverride,
  dialogDescription,
  submitLabel,
  maxWidthClassName,
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
      // Sent only when a choice was actually offered. Omitting it leaves the
      // server's existing subjects alone; sending [] would clear them, which is
      // not what "this editor had no pet selector" means.
      ...(primaryPet && otherPets.length > 0
        ? { additionalPetIds: form.additionalPetIds }
        : {}),
    });
  }

  const dialogTitle =
    dialogTitleOverride ??
    (mode === "create" ? `Add a Moment for ${petName}` : "Update this Moment");
  const formId = `moment-editor-${mode}-form`;
  const primaryLabel =
    submitLabel ?? (mode === "create" ? "Add Moment" : "Save Changes");

  return (
    <FormDialog
      cancelAction={{ disabled: submitting, label: "Cancel" }}
      closeLabel="Close moment editor"
      description={
        dialogDescription ??
        "Add the details once, then choose where this Moment appears."
      }
      eyebrow={dialogTitleOverride ? undefined : mode === "create" ? "Add Moment" : "Edit Moment"}
      maxWidthClassName={maxWidthClassName}
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

              {primaryPetOptions && onPrimaryPetChange ? (
                /*
                  Which pet this Moment is mainly about. First, because it is
                  the one answer everything else hangs off — the additional
                  subjects below are "who else was there", and that question
                  makes no sense until this one is settled.
                */
                <Field label="Pet">
                  <select
                    className="brand-input brand-select"
                    data-testid="moment-primary-pet"
                    disabled={submitting}
                    onChange={(event) => onPrimaryPetChange(event.target.value)}
                    value={primaryPet?.id ?? ""}
                  >
                    {primaryPetOptions.map((pet) => (
                      <option key={pet.id} value={pet.id}>
                        {pet.name}
                      </option>
                    ))}
                  </select>
                </Field>
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

              {primaryPet ? (
                <MomentPetSelector
                  disabled={submitting}
                  onChange={(petIds) => updateField("additionalPetIds", petIds)}
                  otherPets={otherPets}
                  primaryPet={primaryPet}
                  selectedPetIds={form.additionalPetIds}
                />
              ) : null}

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
    additionalPetIds: [...(moment.additionalPetIds ?? [])],
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
