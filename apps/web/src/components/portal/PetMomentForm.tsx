"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { MomentMediaField } from "@/components/portal/MomentMediaField";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { getMemoryLimitState } from "@/lib/planLimits";
import { isArchivedPet } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import {
  createPetMoment,
  getFriendlyMomentErrorMessage,
  getPetMoments,
} from "@/services/momentService";
import type {
  MomentMedia,
  MomentType,
  MomentVisibility,
  Pet,
  PetMoment,
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

export function PetMomentForm({ pet }: { pet: Pet }) {
  const archivedPet = isArchivedPet(pet);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdMoment, setCreatedMoment] = useState<PetMoment | null>(null);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let active = true;

    getPetMoments(pet.id)
      .then((response) => {
        if (active) {
          setMemoryCount(response.data.length);
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError(getFriendlyMomentErrorMessage(caught));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (
      archivedPet ||
      (memoryCount !== null && !getMemoryLimitState(memoryCount).canCreate)
    ) {
      return;
    }

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createPetMoment(pet.id, {
        title: form.title,
        date: formatDisplayDate(form.date),
        type: form.type || "Other",
        caption: form.caption,
        media: form.media,
        coverMediaId: form.coverMediaId,
        visibility: form.visibility,
        showOnPublicProfile: form.showOnPublicProfile,
        showInLifeTimeline: form.showInLifeTimeline,
        timelineNote: form.timelineNote,
      });

      setCreatedMoment(response.data);
      setMemoryCount((current) => (current === null ? current : current + 1));
      setForm(emptyForm);
      setErrors({});
    } catch (caught) {
      setFormError(getFriendlyMomentErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (archivedPet) {
    return (
      <section className="brand-soft-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Archived profile
        </p>
        <h2 className="mt-3 text-2xl font-black text-pet-ink">
          Restore this profile before adding new memories.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          Existing memories stay safe with the archived profile, but new memory
          creation is paused while the profile is archived.
        </p>
        <CTAButton
          href={ownerRoutes.petMoments(pet.id)}
          icon="heart"
          className="mt-6"
        >
          View Existing Memories
        </CTAButton>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Could not check memories
        </p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          This pet&apos;s memory allowance is temporarily unavailable.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
          {loadError}
        </p>
      </section>
    );
  }

  if (memoryCount === null) {
    return (
      <div className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-semibold text-pet-muted">
          Checking this pet&apos;s memory allowance...
        </p>
      </div>
    );
  }

  const memoryLimit = getMemoryLimitState(memoryCount);

  if (!memoryLimit.canCreate && !createdMoment) {
    return (
      <section className="brand-soft-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Free memory limit
        </p>
        <h2 className="mt-3 text-2xl font-black text-pet-ink">
          More memories are coming with Premium.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          {memoryLimit.message}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton href={ownerRoutes.petMoments(pet.id)} icon="heart">
            View Existing Memories
          </CTAButton>
          <CTAButton href={ownerRoutes.petProfile(pet.id)} variant="secondary">
            Manage {pet.name}
          </CTAButton>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <form
        className="brand-card grid gap-5 rounded-[1.75rem] p-5 sm:p-6"
        onSubmit={handleSubmit}
      >
        {formError ? (
          <div className="rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]">
            {formError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title" error={errors.title}>
            <input
              className="brand-input"
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Birthday at the park"
              type="text"
              value={form.title}
            />
          </Field>

          <Field label="Date" error={errors.date}>
            <input
              className="brand-input"
              onChange={(event) => updateField("date", event.target.value)}
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
            onChange={(event) => updateField("caption", event.target.value)}
            placeholder={`What made this moment special for ${pet.name}?`}
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
              This moment will appear where you select it: Pet Memories,
              Life Timeline, or both.
            </>
          ) : (
            <>
              Private and family-only memories stay inside the owner workspace
              until family access is available.
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            href={ownerRoutes.petMoments(pet.id)}
          >
            Back to Moments
          </Link>
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting || !memoryLimit.canCreate}
            type="submit"
          >
            {isSubmitting
              ? "Saving..."
              : memoryLimit.canCreate
                ? "Save Moment"
                : "Memory Limit Reached"}
          </button>
        </div>
      </form>

      <aside className="grid content-start gap-5">
        {createdMoment ? (
          <>
            <div className="rounded-[1.5rem] border border-pet-mint bg-[#e8f8f0] p-5">
              <h2 className="text-xl font-black text-pet-ink">
                Moment saved
              </h2>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                Your memory has been added to {pet.name}&apos;s moments.
              </p>
              <CTAButton
                href={ownerRoutes.petMoments(pet.id)}
                className="mt-4"
                icon="heart"
              >
                View Moments
              </CTAButton>
            </div>
            <PetMomentCard moment={createdMoment} />
          </>
        ) : (
          <div className="brand-soft-card rounded-[1.5rem] p-5">
            <h2 className="text-xl font-black text-pet-ink">
              Premium albums are coming soon
            </h2>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              Your Free profile includes pet memories now. Richer albums and
              more memory space are planned for Premium.
            </p>
          </div>
        )}
      </aside>
    </div>
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
