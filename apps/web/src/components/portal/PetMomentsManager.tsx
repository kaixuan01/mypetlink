"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MomentMediaField } from "@/components/portal/MomentMediaField";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { getMemoryLimitState } from "@/lib/planLimits";
import { isArchivedPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import {
  deletePetMoment,
  getFriendlyMomentErrorMessage,
  getPetMoments,
  updatePetMoment,
} from "@/services/momentService";
import type {
  MomentMedia,
  MomentType,
  MomentVisibility,
  Pet,
  PetMoment,
} from "@/types";

type PetMomentsManagerProps = {
  pet: Pet;
  initialMoments: PetMoment[];
};

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

type FormState = {
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

type FormErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
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

export function PetMomentsManager({
  pet,
  initialMoments,
}: PetMomentsManagerProps) {
  const apiMode = isApiConfigured();
  const archivedPet = isArchivedPet(pet);
  const [moments, setMoments] = useState<PetMoment[]>(
    apiMode ? [] : initialMoments
  );
  const [editingMoment, setEditingMoment] = useState<PetMoment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(apiMode);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PetMoment | null>(null);
  const memoryLimit = getMemoryLimitState(moments.length);
  const canCreateMemory = memoryLimit.canCreate && !archivedPet;
  const counts = useMemo(
    () => ({
      publicProfile: moments.filter(
        (moment) =>
          moment.visibility === "Public" && moment.showOnPublicProfile
      ).length,
      private: moments.filter((moment) => moment.visibility === "Private").length,
      family: moments.filter((moment) => moment.visibility === "Family Only")
        .length,
      timeline: moments.filter(
        (moment) =>
          moment.visibility === "Public" && moment.showInLifeTimeline
      ).length,
    }),
    [moments]
  );

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setLoadError("");
      }
    });

    getPetMoments(pet.id)
      .then((response) => {
        if (active) {
          setMoments(response.data);
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError(getFriendlyMomentErrorMessage(caught));
          setMoments([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [pet.id]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError("");
    setSuccess("");
  }

  function openEditForm(moment: PetMoment) {
    setEditingMoment(moment);
    setForm({
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
    });
    setErrors({});
    setActionError("");
    setFormError("");
    setSuccess("");
  }

  function validate() {
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
    return Object.keys(nextErrors).length === 0;
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingMoment || !validate()) {
      return;
    }

    setIsSubmitting(true);
    setSuccess("");
    setActionError("");
    setFormError("");

    try {
      const response = await updatePetMoment(editingMoment.id, {
        title: form.title.trim(),
        date: formatDisplayDate(form.date),
        type: form.type || "Other",
        caption: form.caption.trim(),
        media: form.media,
        coverMediaId: form.coverMediaId,
        visibility: form.visibility,
        showOnPublicProfile: form.showOnPublicProfile,
        showInLifeTimeline: form.showInLifeTimeline,
        timelineNote: form.timelineNote,
      }, pet.id);

      const savedMoment = response.data;

      if (savedMoment) {
        setMoments((current) =>
          current.map((moment) =>
            moment.id === editingMoment.id ? savedMoment : moment
          )
        );
        setSuccess("Moment updated.");
      }

      setEditingMoment(null);
      setErrors({});
    } catch (caught) {
      setFormError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await deletePetMoment(deleteTarget.id);

      if (response.data.deleted) {
        setMoments((current) =>
          current.filter((item) => item.id !== deleteTarget.id)
        );
        setActionError("");
        setSuccess("Moment deleted.");
      }
    } catch (caught) {
      setSuccess("");
      setActionError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Recent moments</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {moments.length}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">
            Public memories
          </p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.publicProfile}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Life Timeline</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.timeline}
          </p>
        </div>
        <div className="brand-card rounded-[1.5rem] p-5">
          <p className="text-sm font-bold text-pet-muted">Private memories</p>
          <p className="mt-2 text-3xl font-black text-pet-ink">
            {counts.private + counts.family}
          </p>
        </div>
      </section>

      <section className="brand-card mt-6 rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-pet-ink">
              Moments and Life Timeline
            </h2>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              Pet Memories are the public gallery. Life Timeline is built from
              public moments you mark as milestones.
            </p>
            {archivedPet ? (
              <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
                Archived pet profiles keep existing memories safe, but new
                memories can be added after the profile is restored.
              </p>
            ) : !memoryLimit.canCreate ? (
              <p className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
                {memoryLimit.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CTAButton
              href={ownerRoutes.petTimeline(pet.id)}
              icon="heart"
              variant="secondary"
            >
              View Life Timeline
            </CTAButton>
            <CTAButton
              disabled={!canCreateMemory}
              href={
                canCreateMemory
                  ? ownerRoutes.petMomentNew(pet.id)
                  : undefined
              }
              icon="plus"
              variant={canCreateMemory ? "coral" : "secondary"}
            >
              {canCreateMemory ? "Add Memory" : "Unavailable"}
            </CTAButton>
          </div>
        </div>
      </section>

      {success ? (
        <div
          className="mt-6 rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage"
          role="status"
        >
          {success}
        </div>
      ) : null}

      {actionError ? (
        <div
          className="mt-6 rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      <section className="mt-6">
        {loading ? (
          <div className="brand-card rounded-[1.75rem] p-6">
            <p className="text-sm font-semibold text-pet-muted">
              Loading pet memories...
            </p>
          </div>
        ) : loadError ? (
          <section className="brand-card rounded-[1.75rem] p-6">
            <p className="text-sm font-bold uppercase text-pet-teal">
              Could not load memories
            </p>
            <h2 className="mt-2 text-2xl font-black text-pet-ink">
              {pet.name}&apos;s memories are temporarily unavailable.
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
              {loadError}
            </p>
            <CTAButton
              className="mt-5"
              onClick={() => window.location.reload()}
              variant="secondary"
            >
              Try Again
            </CTAButton>
          </section>
        ) : moments.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {moments.map((moment) => (
              <PetMomentCard
                key={moment.id}
                moment={moment}
                onDelete={() => setDeleteTarget(moment)}
                onEdit={() => openEditForm(moment)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="heart"
            title="No pet moments yet"
            description="Add your pet's first little moment and keep it safe in their profile."
            actionHref={
              canCreateMemory ? ownerRoutes.petMomentNew(pet.id) : undefined
            }
            actionLabel="Add Moment"
          />
        )}
      </section>

      {editingMoment ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-pet-coral">
                  Edit Moment
                </p>
                <h2 className="mt-2 text-2xl font-black text-pet-ink">
                  Update this memory
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  Control whether this appears in Pet Memories, Life Timeline,
                  or stays private in the owner workspace.
                </p>
              </div>
              <button
                aria-label="Cancel"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pet-cream text-pet-muted transition hover:text-pet-ink"
                onClick={() => setEditingMoment(null)}
                type="button"
              >
                <Icon name="plus" className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleEditSubmit}>
              {formError ? (
                <div className="rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Title" error={errors.title}>
                  <input
                    className="brand-input"
                    onChange={(event) =>
                      updateField("title", event.target.value)
                    }
                    type="text"
                    value={form.title}
                  />
                </Field>

                <Field label="Date" error={errors.date}>
                  <input
                    className="brand-input"
                    onChange={(event) =>
                      updateField("date", event.target.value)
                    }
                    type="date"
                    value={form.date}
                  />
                </Field>

                <Field label="Moment category" error={errors.type}>
                  <select
                    className="brand-input"
                    onChange={(event) =>
                      updateField("type", event.target.value as FormState["type"])
                    }
                    value={form.type}
                  >
                    <option value="">Select category</option>
                    {momentCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Visibility" error={errors.visibility}>
                  <select
                    className="brand-input"
                    onChange={(event) =>
                      updateField(
                        "visibility",
                        event.target.value as MomentVisibility
                      )
                    }
                    value={form.visibility}
                  >
                    {visibilityOptions.map((visibility) => (
                      <option key={visibility} value={visibility}>
                        {visibility}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Caption" error={errors.caption}>
                <textarea
                  className="brand-input min-h-28"
                  onChange={(event) =>
                    updateField("caption", event.target.value)
                  }
                  value={form.caption}
                />
              </Field>

              <MomentMediaField
                items={form.media}
                coverMediaId={form.coverMediaId}
                onChange={(media, coverMediaId) =>
                  setForm((current) => ({ ...current, media, coverMediaId }))
                }
              />

              <div className="grid gap-3 md:grid-cols-2">
                <MomentCheckbox
                  checked={form.showOnPublicProfile}
                  description="Public memories appear in the Pet Memories gallery."
                  label="Show on Public Profile"
                  onChange={(value) =>
                    updateField("showOnPublicProfile", value)
                  }
                />
                <MomentCheckbox
                  checked={form.showInLifeTimeline}
                  description="Timeline moments appear in your pet's Life Timeline when visibility allows."
                  label="Show in Life Timeline"
                  onChange={(value) =>
                    updateField("showInLifeTimeline", value)
                  }
                />
              </div>

              {form.showInLifeTimeline ? (
                <Field label="Timeline note (optional)">
                  <input
                    className="brand-input"
                    onChange={(event) =>
                      updateField("timelineNote", event.target.value)
                    }
                    placeholder="A short milestone note for the timeline"
                    type="text"
                    value={form.timelineNote}
                  />
                </Field>
              ) : null}

              <div className="rounded-[1.25rem] border border-pet-border bg-white p-4 text-sm leading-6 text-pet-muted">
                {form.visibility === "Public" ? (
                  <>
                    Preview: this moment will appear where you selected it:
                    Pet Memories, Life Timeline, or both.
                  </>
                ) : (
                  <>
                    Private and family-only memories stay inside the owner
                    workspace until family access is available.
                  </>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                  onClick={() => setEditingMoment(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        confirmLabel="Delete memory"
        destructive
        message={
          deleteTarget
            ? `Delete this memory from ${pet.name}'s profile? This action cannot be undone.`
            : ""
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteTarget)}
        title="Delete memory?"
      />
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-xs font-bold text-[#a63c2e]">{error}</span>
      ) : null}
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
        <span className="mt-1 block text-xs font-semibold leading-5 text-pet-muted">
          {description}
        </span>
      </span>
      <input
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0 accent-pet-teal"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
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
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{2}) ([A-Za-z]{3}) (\d{4})$/);

  if (!match) {
    return "";
  }

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);

  if (monthIndex < 0) {
    return "";
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
}
