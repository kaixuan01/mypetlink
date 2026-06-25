"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { PetAvatar } from "@/components/ui/PetAvatar";
import {
  getPetProfileTheme,
  petProfileThemes,
  type PetProfileTheme,
} from "@/lib/petProfileThemes";
import {
  createPet,
  getPetById,
  slugifyPetSlug,
  updatePet,
} from "@/services/petService";
import type {
  Pet,
  PetPayload,
  PetProfileThemeId,
  PetSpecies,
} from "@/types";

type PetProfileFormProps = {
  mode: "create" | "edit";
  initialPet?: Pet;
};

type FormState = {
  name: string;
  species: PetSpecies;
  breed: string;
  gender: string;
  color: string;
  birthdayDate: string;
  estimatedAge: string;
  profilePhotoLabel: string;
  coverPhotoLabel: string;
  profileTheme: PetProfileThemeId;
  bio: string;
  personalityTags: string;
  favoriteFood: string;
  favoriteToy: string;
  adoptionDate: string;
  slug: string;
  generalArea: string;
  safetyNote: string;
  emergencyNote: string;
  contactPreference: Pet["contactPreference"];
  ownerName: string;
  whatsapp: string;
  phone: string;
  showOwnerName: boolean;
  showGeneralArea: boolean;
  showWhatsapp: boolean;
  showPhone: boolean;
  showEmergencyNote: boolean;
  showCareBadges: boolean;
  showMoments: boolean;
  showTimeline: boolean;
  showBirthdayOnTimeline: boolean;
  showAdoptionDayOnTimeline: boolean;
  showHealthSummary: boolean;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const speciesOptions: PetSpecies[] = ["Dog", "Cat", "Rabbit", "Bird", "Other"];
const contactPreferenceOptions: Pet["contactPreference"][] = [
  "WhatsApp preferred",
  "Call preferred",
  "WhatsApp or call",
];

const emptyForm: FormState = {
  name: "",
  species: "Dog",
  breed: "",
  gender: "",
  color: "",
  birthdayDate: "",
  estimatedAge: "",
  profilePhotoLabel: "",
  coverPhotoLabel: "",
  profileTheme: "default",
  bio: "",
  personalityTags: "",
  favoriteFood: "",
  favoriteToy: "",
  adoptionDate: "",
  slug: "",
  generalArea: "",
  safetyNote: "",
  emergencyNote: "",
  contactPreference: "WhatsApp preferred",
  ownerName: "",
  whatsapp: "",
  phone: "",
  showOwnerName: true,
  showGeneralArea: true,
  showWhatsapp: true,
  showPhone: true,
  showEmergencyNote: true,
  showCareBadges: true,
  showMoments: true,
  showTimeline: true,
  showBirthdayOnTimeline: true,
  showAdoptionDayOnTimeline: true,
  showHealthSummary: false,
};

export function PetProfileForm({ mode, initialPet }: PetProfileFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initialPet));
  const [currentPet, setCurrentPet] = useState<Pet | null>(initialPet ?? null);
  const [createdPet, setCreatedPet] = useState<Pet | null>(null);
  const [savedPet, setSavedPet] = useState<Pet | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !initialPet?.id) {
      return;
    }

    let active = true;

    getPetById(initialPet.id).then((response) => {
      if (!active || !response.data) {
        return;
      }

      setCurrentPet(response.data);
      setForm(toFormState(response.data));
    });

    return () => {
      active = false;
    };
  }, [initialPet?.id, mode]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSuccess("");
  }

  function handleNameChange(value: string) {
    setForm((current) => {
      const previousSlug = slugifyPetSlug(current.name);
      const shouldRefreshSlug = !current.slug || current.slug === previousSlug;

      return {
        ...current,
        name: value,
        slug: shouldRefreshSlug ? slugifyPetSlug(value) : current.slug,
      };
    });
    setErrors((current) => ({ ...current, name: undefined, slug: undefined }));
    setSuccess("");
  }

  function handleFileLabel(
    key: "profilePhotoLabel" | "coverPhotoLabel",
    event: ChangeEvent<HTMLInputElement>
  ) {
    const fileName = event.target.files?.[0]?.name;

    if (fileName) {
      updateField(key, fileName);
    }
  }

  function validate() {
    const nextErrors: FormErrors = {};
    const slug = slugifyPetSlug(form.slug);

    checkRequired(nextErrors, "name", form.name, "Pet name is required.");
    checkRequired(nextErrors, "species", form.species, "Pet type is required.");
    checkRequired(nextErrors, "slug", form.slug, "Public profile slug is required.");

    if (form.slug && form.slug !== slug) {
      nextErrors.slug =
        "Use lowercase letters, numbers, and hyphens only, like milo-the-dog.";
    }

    if (form.whatsapp && !isValidPhone(form.whatsapp)) {
      nextErrors.whatsapp = "Add a valid WhatsApp number.";
    }

    if (form.phone && !isValidPhone(form.phone)) {
      nextErrors.phone = "Add a valid phone number.";
    }

    if (form.birthdayDate && !isValidDate(form.birthdayDate)) {
      nextErrors.birthdayDate = "Choose a valid birthday.";
    }

    if (form.adoptionDate && !isValidDate(form.adoptionDate)) {
      nextErrors.adoptionDate = "Choose a valid adoption day.";
    }

    enforceMax(nextErrors, "name", form.name, 60);
    enforceMax(nextErrors, "breed", form.breed, 80);
    enforceMax(nextErrors, "gender", form.gender, 40);
    enforceMax(nextErrors, "color", form.color, 80);
    enforceMax(nextErrors, "estimatedAge", form.estimatedAge, 60);
    enforceMax(nextErrors, "generalArea", form.generalArea, 120);
    enforceMax(nextErrors, "bio", form.bio, 320);
    enforceMax(nextErrors, "safetyNote", form.safetyNote, 260);
    enforceMax(nextErrors, "emergencyNote", form.emergencyNote, 260);
    enforceMax(nextErrors, "personalityTags", form.personalityTags, 160);
    enforceMax(nextErrors, "favoriteFood", form.favoriteFood, 80);
    enforceMax(nextErrors, "favoriteToy", form.favoriteToy, 80);
    enforceMax(nextErrors, "ownerName", form.ownerName, 80);
    enforceMax(nextErrors, "profilePhotoLabel", form.profilePhotoLabel, 120);
    enforceMax(nextErrors, "coverPhotoLabel", form.coverPhotoLabel, 120);

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setSuccess("");

    const payload = buildPayload(form);

    try {
      if (mode === "create") {
        const response = await createPet(payload);
        setCreatedPet(response.data);
        setCurrentPet(response.data);
        setForm(toFormState(response.data));
      } else if (currentPet) {
        const response = await updatePet(currentPet.id, payload);

        if (response.data) {
          setCurrentPet(response.data);
          setSavedPet(response.data);
          setForm(toFormState(response.data));
          setSuccess("Changes saved. Your public profile preview is updated.");
          router.refresh();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdPet) {
    return (
      <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm">
        <p className="text-sm font-bold uppercase text-pet-sage">
          Profile ready
        </p>
        <h2 className="mt-3 text-3xl font-black text-pet-ink">
          {createdPet.name}&apos;s profile is ready.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          You can keep adding care records, moments, and QR safety details from
          the owner portal.
        </p>
        <ShareProfileLink
          className="mt-5"
          path={createdPet.publicProfileUrl}
          petName={createdPet.name}
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton href={createdPet.publicProfileUrl} icon="heart">
            View Public Profile
          </CTAButton>
          <CTAButton
            href={createdPet.finderProfileUrl}
            icon="qr"
            variant="secondary"
          >
            View QR Safety Page
          </CTAButton>
          <CTAButton
            href={`/pets/${createdPet.id}/tags/order`}
            icon="tag"
            variant="outline"
          >
            Preview Tag Options
          </CTAButton>
          <CTAButton href="/dashboard" variant="outline">
            Go to Dashboard
          </CTAButton>
        </div>
      </section>
    );
  }

  const previewPet = currentPet
    ? {
        ...currentPet,
        name: form.name || currentPet.name,
        species: form.species,
        photoInitial: getInitial(form.name || currentPet.name),
        profileTheme: form.profileTheme,
      }
    : {
        species: form.species,
        photoInitial: getInitial(form.name),
        photoTone: "apricot" as const,
        profileTheme: form.profileTheme,
      };
  const profilePath = `/${["p", slugifyPetSlug(form.slug) || "pet-profile"].join("/")}`;
  const selectedTheme = getPetProfileTheme(form.profileTheme);
  const saveLabel = mode === "create" ? "Save Pet" : "Save Changes";

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      {success ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage">
          {success}
        </div>
      ) : null}

      <FormSection
        title="Basic Info"
        description="These details help friends, family, and finders recognize your pet quickly."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            error={errors.name}
            helper="Use the name people normally call your pet."
            label="Pet name"
          >
            <input
              className="brand-input"
              maxLength={60}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Milo"
              type="text"
              value={form.name}
            />
          </Field>

          <Field error={errors.species} label="Pet type">
            <select
              className="brand-input"
              onChange={(event) =>
                updateField("species", event.target.value as PetSpecies)
              }
              value={form.species}
            >
              {speciesOptions.map((species) => (
                <option key={species} value={species}>
                  {species}
                </option>
              ))}
            </select>
          </Field>

          <TextInput
            error={errors.breed}
            label="Breed"
            maxLength={80}
            onChange={(value) => updateField("breed", value)}
            placeholder="Mixed breed"
            value={form.breed}
          />

          <TextInput
            error={errors.gender}
            label="Gender"
            maxLength={40}
            onChange={(value) => updateField("gender", value)}
            placeholder="Male, female, unknown"
            value={form.gender}
          />

          <TextInput
            error={errors.color}
            label="Color"
            maxLength={80}
            onChange={(value) => updateField("color", value)}
            placeholder="Brown and white"
            value={form.color}
          />

          <Field
            error={errors.birthdayDate}
            helper="Leave this blank if you only know an estimated age."
            label="Birthday"
          >
            <input
              className="brand-input"
              onChange={(event) => updateField("birthdayDate", event.target.value)}
              type="date"
              value={form.birthdayDate}
            />
          </Field>

          <TextInput
            error={errors.estimatedAge}
            helper="Example: Estimated 5 years."
            label="Estimated age"
            maxLength={60}
            onChange={(value) => updateField("estimatedAge", value)}
            placeholder="Estimated 5 years"
            value={form.estimatedAge}
          />
        </div>
      </FormSection>

      <FormSection
        title="Photos"
        description="Add the pet photos you want saved with this profile. Profile Theme controls the public page colors."
      >
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="brand-soft-card rounded-[1.5rem] p-5">
            <p className="text-sm font-black text-pet-ink">Profile preview</p>
            <div className="mt-5 flex items-center gap-4">
              <PetAvatar pet={previewPet} size="lg" />
              <div>
                <p className="font-black text-pet-ink">
                  {form.name || "Your pet"}
                </p>
                <p className="mt-1 text-sm text-pet-muted">
                  {form.profilePhotoLabel ? "Portrait ready" : "Add a portrait when you are ready"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              error={errors.profilePhotoLabel}
              helper="Choose the portrait you want to use for this pet."
              label="Profile photo"
            >
              <input
                accept="image/*"
                className="brand-input"
                onChange={(event) => handleFileLabel("profilePhotoLabel", event)}
                type="file"
              />
            </Field>

            <Field
              error={errors.coverPhotoLabel}
              helper="Choose a warm cover photo when you are ready."
              label="Cover photo"
            >
              <input
                accept="image/*"
                className="brand-input"
                onChange={(event) => handleFileLabel("coverPhotoLabel", event)}
                type="file"
              />
            </Field>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Profile Theme"
        description="Used on your pet's public share profile and QR safety page."
      >
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-pet-muted">
            Choose the color style used for your pet&apos;s public profile and
            QR safety page.
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {petProfileThemes.map((theme) => (
              <ThemeOptionCard
                key={theme.id}
                name={form.name || "Milo"}
                onSelect={() => updateField("profileTheme", theme.id)}
                selected={form.profileTheme === theme.id}
                theme={theme}
              />
            ))}
          </div>

          <ThemePreviewPanel
            petName={form.name || "Your pet"}
            theme={selectedTheme}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <CTAButton href={profilePath} icon="heart" variant="secondary">
              Preview Public Profile
            </CTAButton>
            {mode === "edit" && currentPet ? (
              <CTAButton
                href={currentPet.finderProfileUrl}
                icon="qr"
                variant="outline"
              >
                Preview QR Safety Page
              </CTAButton>
            ) : null}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Public Share Profile"
        description="Add a short intro so friends and family can know your pet better."
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Field
            error={errors.bio}
            helper="A few friendly details make the page feel personal."
            label="Short bio / about"
          >
            <textarea
              className="brand-input min-h-32"
              maxLength={320}
              onChange={(event) => updateField("bio", event.target.value)}
              placeholder="Milo is gentle, snack-loving, and happiest after evening walks."
              value={form.bio}
            />
          </Field>

          <div className="grid gap-4">
            <TextInput
              error={errors.personalityTags}
              helper="Personality tags make your pet profile feel more personal."
              label="Personality tags"
              maxLength={160}
              onChange={(value) => updateField("personalityTags", value)}
              placeholder="Gentle, loyal, playful"
              value={form.personalityTags}
            />
            <TextInput
              error={errors.favoriteFood}
              label="Favourite food"
              maxLength={80}
              onChange={(value) => updateField("favoriteFood", value)}
              placeholder="Beef treats"
              value={form.favoriteFood}
            />
            <TextInput
              error={errors.favoriteToy}
              label="Favourite toy"
              maxLength={80}
              onChange={(value) => updateField("favoriteToy", value)}
              placeholder="Blue squeaky ball"
              value={form.favoriteToy}
            />
          </div>

          <Field error={errors.adoptionDate} label="Adoption day">
            <input
              className="brand-input"
              onChange={(event) => updateField("adoptionDate", event.target.value)}
              type="date"
              value={form.adoptionDate}
            />
          </Field>

          <Field
            error={errors.slug}
            helper="This becomes the public page address."
            label="Public profile slug"
          >
            <input
              className="brand-input"
              maxLength={70}
              onChange={(event) =>
                updateField("slug", slugifyPetSlug(event.target.value))
              }
              placeholder="milo"
              type="text"
              value={form.slug}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="QR Safety Page"
        description="Contact details, safety notes, emergency note, and general area for finders. Your full address is not shown publicly."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <TextInput
            error={errors.generalArea}
            helper="Example: Petaling Jaya, Selangor."
            label="General area"
            maxLength={120}
            onChange={(value) => updateField("generalArea", value)}
            placeholder="Petaling Jaya, Selangor"
            value={form.generalArea}
          />

          <Field label="Contact preference">
            <select
              className="brand-input"
              onChange={(event) =>
                updateField(
                  "contactPreference",
                  event.target.value as Pet["contactPreference"]
                )
              }
              value={form.contactPreference}
            >
              {contactPreferenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field
            error={errors.safetyNote}
            helper="Helpful for anyone who finds your pet outside."
            label="Safety note"
          >
            <textarea
              className="brand-input min-h-28"
              maxLength={260}
              onChange={(event) => updateField("safetyNote", event.target.value)}
              placeholder="Friendly but nervous around traffic."
              value={form.safetyNote}
            />
          </Field>

          <Field
            error={errors.emergencyNote}
            helper="Add anything urgent a finder should know before contacting you."
            label="Emergency note"
          >
            <textarea
              className="brand-input min-h-28"
              maxLength={260}
              onChange={(event) => updateField("emergencyNote", event.target.value)}
              placeholder="Keep shaded and contact owner first."
              value={form.emergencyNote}
            />
          </Field>

          <TextInput
            error={errors.ownerName}
            label="Owner display name"
            maxLength={80}
            onChange={(value) => updateField("ownerName", value)}
            placeholder={`${form.name || "Your pet"}'s owner`}
            value={form.ownerName}
          />
          <TextInput
            error={errors.whatsapp}
            helper="Optional, but useful for quick finder contact."
            label="WhatsApp number"
            maxLength={24}
            onChange={(value) => updateField("whatsapp", value)}
            placeholder="60123456789"
            value={form.whatsapp}
          />
          <TextInput
            error={errors.phone}
            helper="Optional. Add country code when possible."
            label="Phone number"
            maxLength={24}
            onChange={(value) => updateField("phone", value)}
            placeholder="+60123456789"
            value={form.phone}
          />
        </div>
      </FormSection>

      <FormSection
        title="Privacy"
        description="Choose which owner-approved details appear on the public profile and QR safety page."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Checkbox
            checked={form.showOwnerName}
            label="Show owner display name publicly"
            onChange={(value) => updateField("showOwnerName", value)}
          />
          <Checkbox
            checked={form.showGeneralArea}
            label="Show general area"
            onChange={(value) => updateField("showGeneralArea", value)}
          />
          <Checkbox
            checked={form.showWhatsapp}
            label="Show WhatsApp contact"
            onChange={(value) => updateField("showWhatsapp", value)}
          />
          <Checkbox
            checked={form.showPhone}
            label="Show call contact"
            onChange={(value) => updateField("showPhone", value)}
          />
          <Checkbox
            checked={form.showEmergencyNote}
            label="Show emergency note"
            onChange={(value) => updateField("showEmergencyNote", value)}
          />
          <Checkbox
            checked={form.showCareBadges}
            label="Show care badges"
            onChange={(value) => updateField("showCareBadges", value)}
          />
          <Checkbox
            checked={form.showMoments}
            label="Show public memories"
            onChange={(value) => updateField("showMoments", value)}
          />
          <Checkbox
            checked={form.showTimeline}
            label="Show Life Timeline"
            onChange={(value) => updateField("showTimeline", value)}
          />
          <Checkbox
            checked={form.showBirthdayOnTimeline}
            label="Show birthday in Life Timeline"
            onChange={(value) => updateField("showBirthdayOnTimeline", value)}
          />
          <Checkbox
            checked={form.showAdoptionDayOnTimeline}
            label="Show adoption day in Life Timeline"
            onChange={(value) => updateField("showAdoptionDayOnTimeline", value)}
          />
          <Checkbox
            checked={form.showHealthSummary}
            label="Allow public care record details"
            onChange={(value) => updateField("showHealthSummary", value)}
          />
        </div>
      </FormSection>

      {mode === "edit" && currentPet ? (
        <section className="brand-card rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-pet-ink">
                Related owner tools
              </h2>
              <p className="mt-1 text-sm leading-6 text-pet-muted">
                Keep moments, care records, and QR safety details connected to
                this public profile.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <CTAButton
                href={`/pets/${currentPet.id}/records`}
                icon="record"
                variant="secondary"
              >
                Manage Care Records
              </CTAButton>
              <CTAButton
                href={`/pets/${currentPet.id}/moments/new`}
                icon="plus"
                variant="secondary"
              >
                Add Pet Moment
              </CTAButton>
              <CTAButton href={`/pets/${currentPet.id}/qr`} icon="qr">
                Manage QR / Safety Profile
              </CTAButton>
            </div>
          </div>
        </section>
      ) : null}

      <div className="brand-card flex flex-col gap-4 rounded-[1.5rem] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-pet-ink">
            Share profile preview
          </p>
          <p className="mt-1 break-words text-sm text-pet-muted">
            {profilePath}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {mode === "edit" && currentPet ? (
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              href={`/pets/${currentPet.id}`}
            >
              Cancel
            </Link>
          ) : (
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              href="/pets"
            >
              Cancel
            </Link>
          )}
          <CTAButton href={profilePath} icon="heart" variant="secondary">
            Preview Public Profile
          </CTAButton>
          {mode === "edit" && currentPet ? (
            <CTAButton
              href={currentPet.finderProfileUrl}
              icon="qr"
              variant="outline"
            >
              Preview QR Safety Page
            </CTAButton>
          ) : null}
          <CTAButton disabled={isSubmitting} type="submit" variant="coral">
            {isSubmitting ? "Saving..." : saveLabel}
          </CTAButton>
        </div>
      </div>

      {savedPet ? (
        <ShareProfileLink
          path={savedPet.publicProfileUrl}
          petName={savedPet.name}
        />
      ) : null}
    </form>
  );
}

function toFormState(pet?: Pet): FormState {
  if (!pet) {
    return emptyForm;
  }

  const visibility = mergeVisibility(pet.visibility);

  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    gender: pet.gender,
    color: pet.color,
    birthdayDate: parseDisplayDate(pet.birthday),
    estimatedAge: pet.ageLabel === "Age not set" ? "" : pet.ageLabel,
    profilePhotoLabel: cleanMediaLabel(pet.profilePhotoLabel),
    coverPhotoLabel: cleanMediaLabel(pet.coverPhotoLabel),
    profileTheme: pet.profileTheme ?? "default",
    bio: pet.bio,
    personalityTags: pet.personalityTags.join(", "),
    favoriteFood: pet.favoriteFood === "Not set" ? "" : pet.favoriteFood,
    favoriteToy: pet.favoriteToy === "Not set" ? "" : pet.favoriteToy,
    adoptionDate: parseDisplayDate(pet.adoptionDay),
    slug: pet.slug,
    generalArea: pet.generalArea,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    contactPreference: pet.contactPreference ?? "WhatsApp preferred",
    ownerName: pet.owner.name,
    whatsapp: pet.owner.whatsapp,
    phone: pet.owner.phone,
    showOwnerName: visibility.showOwnerName,
    showGeneralArea: visibility.showGeneralArea,
    showWhatsapp: visibility.showWhatsapp,
    showPhone: visibility.showPhone,
    showEmergencyNote: visibility.showEmergencyNote,
    showCareBadges: visibility.showCareBadges,
    showMoments: visibility.showMoments,
    showTimeline: visibility.showTimeline,
    showBirthdayOnTimeline: visibility.showBirthdayOnTimeline,
    showAdoptionDayOnTimeline: visibility.showAdoptionDayOnTimeline,
    showHealthSummary: visibility.showHealthSummary,
  };
}

function buildPayload(form: FormState): PetPayload {
  const name = form.name.trim();
  const birthday = form.birthdayDate
    ? formatDisplayDate(form.birthdayDate)
    : "Not set";
  const ageLabel =
    form.estimatedAge.trim() ||
    (form.birthdayDate ? buildAgeLabel(form.birthdayDate) : "Age not set");

  return {
    name,
    slug: slugifyPetSlug(form.slug),
    species: form.species,
    breed: form.breed.trim() || "Mixed breed",
    gender: form.gender.trim() || "Not set",
    color: form.color.trim() || "Not set",
    birthday,
    ageLabel,
    adoptionDay: form.adoptionDate ? formatDisplayDate(form.adoptionDate) : "Not set",
    generalArea: form.generalArea.trim() || "Malaysia",
    photoInitial: getInitial(name),
    photoTone: form.species === "Cat" ? "mint" : "apricot",
    profilePhotoLabel: form.profilePhotoLabel.trim(),
    coverPhotoLabel: form.coverPhotoLabel.trim(),
    profileTheme: form.profileTheme,
    bio:
      form.bio.trim() ||
      `${name} is loved dearly and has a safe profile for family and friends.`,
    personalityTags: splitTags(form.personalityTags),
    favoriteFood: form.favoriteFood.trim() || "Not set",
    favoriteToy: form.favoriteToy.trim() || "Not set",
    safetyNote:
      form.safetyNote.trim() || "Please contact the owner if this pet is found.",
    emergencyNote:
      form.emergencyNote.trim() || "Keep calm and contact the owner first.",
    contactPreference: form.contactPreference,
    owner: {
      name: form.ownerName.trim() || `${name}'s owner`,
      whatsapp: form.whatsapp.trim(),
      phone: form.phone.trim(),
      emergencyContact: form.phone.trim() || form.whatsapp.trim(),
    },
    visibility: {
      showOwnerName: form.showOwnerName,
      showGeneralArea: form.showGeneralArea,
      showWhatsapp: form.showWhatsapp,
      showPhone: form.showPhone,
      showEmergencyNote: form.showEmergencyNote,
      showCareBadges: form.showCareBadges,
      showMoments: form.showMoments,
      showTimeline: form.showTimeline,
      showBirthdayOnTimeline: form.showBirthdayOnTimeline,
      showAdoptionDayOnTimeline: form.showAdoptionDayOnTimeline,
      showHealthSummary: form.showHealthSummary,
    },
  };
}

function TextInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  helper,
  maxLength,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  maxLength?: number;
}) {
  return (
    <Field error={error} helper={helper} label={label}>
      <input
        className="brand-input"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </Field>
  );
}

function Field({
  label,
  error,
  helper,
  children,
}: {
  label: string;
  error?: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>
      {children}
      {helper ? <span className="text-xs leading-5 text-pet-muted">{helper}</span> : null}
      {error ? (
        <span className="text-xs font-bold text-[#a63c2e]">{error}</span>
      ) : null}
    </label>
  );
}

function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink">
      <span>{label}</span>
      <input
        checked={checked}
        className="h-4 w-4 accent-pet-teal"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function ThemeOptionCard({
  name,
  onSelect,
  selected,
  theme,
}: {
  name: string;
  onSelect: () => void;
  selected: boolean;
  theme: PetProfileTheme;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`min-h-[220px] rounded-[1.25rem] border p-4 text-left transition ${
        selected
          ? "border-pet-coral bg-white shadow-lg shadow-[#0d1b3d]/10"
          : "border-pet-border bg-white hover:-translate-y-0.5 hover:shadow-md"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-pet-ink">{theme.name}</p>
        {selected ? (
          <span className="rounded-full bg-[#e8f8f0] px-2 py-1 text-[10px] font-black uppercase text-pet-sage">
            Selected
          </span>
        ) : null}
      </div>
      <p className="mt-2 min-h-10 text-xs leading-5 text-pet-muted">
        {theme.description}
      </p>
      <div className="mt-3 flex gap-1.5">
        {theme.swatches.map((swatch) => (
          <span
            aria-hidden="true"
            className="h-5 w-5 rounded-full border border-white shadow-sm"
            key={swatch}
            style={{ background: swatch }}
          />
        ))}
      </div>
      <div
        className="mt-4 overflow-hidden rounded-2xl border"
        style={{
          background: theme.gradients.cover,
          borderColor: theme.colors.border,
        }}
      >
        <div className="p-3">
          <div
            className="h-8 rounded-xl"
            style={{ background: theme.gradients.decorative }}
          />
          <div className="-mt-3 grid place-items-center">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl border-2 text-xs font-black"
              style={{
                background: theme.colors.accentSoft,
                borderColor: theme.colors.surface,
                color: theme.colors.accent,
              }}
            >
              {getInitial(name)}
            </span>
          </div>
          <div className="mt-2 text-center">
            <p
              className="truncate text-xs font-black"
              style={{ color: theme.colors.text }}
            >
              {name}
            </p>
            <span
              className="mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black"
              style={{
                background: theme.colors.badgeBackground,
                color: theme.colors.primary,
              }}
            >
              Gentle
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ThemePreviewPanel({
  petName,
  theme,
}: {
  petName: string;
  theme: PetProfileTheme;
}) {
  return (
    <div
      className="overflow-hidden rounded-[1.5rem] border"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div
        className="grid gap-5 p-5 lg:grid-cols-[0.9fr_1.1fr]"
        style={{ background: theme.gradients.page }}
      >
        <div>
          <p
            className="text-sm font-black text-pet-ink"
            style={{ color: theme.colors.text }}
          >
            Preview how {petName}&apos;s public profile will look
          </p>
          <p
            className="mt-2 text-sm leading-6 text-pet-muted"
            style={{ color: theme.colors.mutedText }}
          >
            {theme.description}
          </p>
          <button
            className="mt-4 inline-flex min-h-10 items-center rounded-full px-4 py-2 text-sm font-black"
            style={{
              background: theme.colors.buttonBackground,
              color: theme.colors.buttonText,
            }}
            type="button"
          >
            View profile
          </button>
        </div>

        <div
          className="rounded-[1.25rem] border p-3"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <div
            className="relative h-24 rounded-2xl"
            style={{ background: theme.gradients.cover }}
          >
            <span
              className="absolute bottom-3 left-3 h-3 w-3 rounded-full"
              style={{ background: theme.colors.timelineDot }}
            />
            <span
              className="absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-black"
              style={{
                background: theme.colors.badgeBackground,
                color: theme.colors.primary,
              }}
            >
              Gentle
            </span>
          </div>
          <div className="grid gap-3 pt-4 sm:grid-cols-[88px_1fr]">
            <div
              className="grid h-20 w-20 place-items-center rounded-[1.25rem] text-xl font-black"
              style={{
                background: theme.colors.accentSoft,
                color: theme.colors.accent,
              }}
            >
              {getInitial(petName)}
            </div>
            <div>
              <p
                className="text-lg font-black"
                style={{ color: theme.colors.text }}
              >
                {petName}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className="h-10 w-2 rounded-full"
                  style={{ background: theme.colors.timelineLine }}
                />
                <div
                  className="rounded-2xl p-3 text-sm"
                  style={{
                    background: theme.colors.surfaceAlt,
                    color: theme.colors.mutedText,
                  }}
                >
                  First day home
                </div>
              </div>
            </div>
          </div>
          <div
            className="mt-3 rounded-2xl p-4"
            style={{ background: theme.colors.surfaceAlt }}
          >
            <p
              className="text-xs font-black uppercase"
              style={{ color: theme.colors.accent }}
            >
              Pet Memory
            </p>
            <p
              className="mt-1 text-sm font-black"
              style={{ color: theme.colors.text }}
            >
              Park walk after breakfast
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function checkRequired<K extends keyof FormState>(
  errors: FormErrors,
  key: K,
  value: FormState[K],
  message: string
) {
  if (typeof value === "string" && !value.trim()) {
    errors[key] = message;
  }
}

function enforceMax<K extends keyof FormState>(
  errors: FormErrors,
  key: K,
  value: FormState[K],
  maxLength: number
) {
  if (typeof value === "string" && value.length > maxLength) {
    errors[key] = `Keep this under ${maxLength} characters.`;
  }
}

function isValidPhone(value: string) {
  return /^\+?[0-9][0-9\s-]{6,22}$/.test(value.trim());
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
  if (!value || value === "Not set" || value.startsWith("Estimated")) {
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

function buildAgeLabel(value: string) {
  const birthDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    years -= 1;
  }

  if (years <= 0) {
    return "Under 1 year";
  }

  return years === 1 ? "1 year" : `${years} years`;
}

function splitTags(value: string) {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);

  return tags.length ? tags : ["Loved", "Family pet"];
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}

function cleanMediaLabel(value: string) {
  if (!value || /not added/i.test(value)) {
    return "";
  }

  return value;
}

function mergeVisibility(
  visibility?: Partial<Pet["visibility"]>
): Pet["visibility"] {
  return {
    showOwnerName: true,
    showGeneralArea: true,
    showPhone: true,
    showWhatsapp: true,
    showEmergencyNote: true,
    showCareBadges: true,
    showMoments: true,
    showTimeline: true,
    showBirthdayOnTimeline: true,
    showAdoptionDayOnTimeline: true,
    showHealthSummary: false,
    ...visibility,
  };
}
