"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { createPetMoment } from "@/services/momentService";
import type {
  MomentType,
  MomentVisibility,
  Pet,
  PetMoment,
  PetMomentPayload,
} from "@/types";

const momentTypes: MomentType[] = [
  "Photo",
  "Video",
  "Birthday",
  "Adoption Day",
  "First Day Home",
  "Grooming Day",
  "Vet Visit",
  "Funny Moment",
  "Achievement",
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
  mediaKind: PetMomentPayload["mediaKind"];
  visibility: MomentVisibility;
  showOnTimeline: boolean;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  title: "",
  date: "",
  type: "",
  caption: "",
  mediaKind: "Image",
  visibility: "Public",
  showOnTimeline: true,
};

export function PetMomentForm({ pet }: { pet: Pet }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdMoment, setCreatedMoment] = useState<PetMoment | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
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
      nextErrors.type = "Choose a moment type.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    const response = await createPetMoment(pet.id, {
      title: form.title,
      date: formatDisplayDate(form.date),
      type: form.type || "Other",
      caption: form.caption,
      mediaKind: form.mediaKind,
      mediaLabel:
        form.mediaKind === "Video"
          ? "Memory clip"
          : form.mediaKind === "Image"
            ? "Photo moment"
            : "Memory note",
      visibility: form.visibility,
      showOnTimeline: form.showOnTimeline,
    });

    setCreatedMoment(response.data);
    setForm(emptyForm);
    setErrors({});
    setIsSubmitting(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <form
        className="brand-card grid gap-5 rounded-[1.75rem] p-5 sm:p-6"
        onSubmit={handleSubmit}
      >
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

          <Field label="Moment type" error={errors.type}>
            <select
              className="brand-input"
              onChange={(event) =>
                updateField("type", event.target.value as FormState["type"])
              }
              value={form.type}
            >
              <option value="">Select type</option>
              {momentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
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

        <fieldset className="rounded-[1.25rem] bg-pet-cream p-4">
          <legend className="text-sm font-bold text-pet-ink">
            Moment media
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(["Image", "Video", "None"] as const).map((mediaKind) => (
              <button
                className={`min-h-24 rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                  form.mediaKind === mediaKind
                    ? "border-pet-coral bg-white text-pet-coral"
                    : "border-pet-border bg-white text-pet-muted"
                }`}
                key={mediaKind}
                onClick={() => updateField("mediaKind", mediaKind)}
                type="button"
              >
                <Icon
                  name={mediaKind === "Video" ? "record" : "heart"}
                  className="mx-auto mb-2 h-5 w-5"
                />
                {mediaKind === "Video"
                  ? "Memory clip"
                  : mediaKind === "Image"
                    ? "Photo moment"
                    : "Note only"}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start justify-between gap-4 rounded-[1.25rem] bg-pet-cream p-4 text-sm font-bold text-pet-ink">
          <span>
            <span className="block">Show this moment in Life Timeline</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-pet-muted">
              Only public moments with this checked appear on the public pet
              profile.
            </span>
          </span>
          <input
            checked={form.showOnTimeline}
            className="mt-1 h-4 w-4 shrink-0 accent-pet-teal"
            onChange={(event) =>
              updateField("showOnTimeline", event.target.checked)
            }
            type="checkbox"
          />
        </label>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            href={`/pets/${pet.id}/moments`}
          >
            Back to Moments
          </Link>
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Saving..." : "Save Moment"}
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
                href={`/pets/${pet.id}/moments`}
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
              More pets, more memories
            </h2>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              Public memories can also be shown in {pet.name}&apos;s Life
              Timeline when you choose.
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
