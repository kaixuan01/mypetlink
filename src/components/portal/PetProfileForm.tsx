"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ImageUploadField } from "@/components/portal/ImageUploadField";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { CTAButton } from "@/components/ui/CTAButton";
import { FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import {
  getPetProfileTheme,
  petProfileThemes,
  type PetProfileTheme,
} from "@/lib/petProfileThemes";
import {
  defaultOwnerSettings,
  getDefaultPetVisibility,
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { ownerRoutes, publicProfilePath } from "@/lib/routes";
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
  photoUrl: string;
  coverUrl: string;
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
  ownerName: string;
  whatsapp: string;
  phone: string;
  useOwnerDefaults: boolean;
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

type EditTab = "basic" | "photos" | "theme" | "public" | "contact";

const editTabs: (SegmentedTab & { id: EditTab })[] = [
  { id: "basic", label: "Basic Info", mobileLabel: "Info" },
  { id: "photos", label: "Photos" },
  { id: "theme", label: "Theme" },
  { id: "public", label: "Public Profile", mobileLabel: "Public" },
  { id: "contact", label: "Contact & Safety", mobileLabel: "Safety" },
];

// Which tab each field lives on, so a validation error can pull the owner to
// the right tab instead of failing silently on a hidden one.
const fieldTab: Record<keyof FormState, EditTab> = {
  name: "basic",
  species: "basic",
  breed: "basic",
  gender: "basic",
  color: "basic",
  birthdayDate: "basic",
  estimatedAge: "basic",
  bio: "basic",
  personalityTags: "basic",
  favoriteFood: "basic",
  favoriteToy: "basic",
  photoUrl: "photos",
  coverUrl: "photos",
  profileTheme: "theme",
  slug: "public",
  adoptionDate: "public",
  generalArea: "contact",
  safetyNote: "contact",
  emergencyNote: "contact",
  ownerName: "contact",
  whatsapp: "contact",
  phone: "contact",
  useOwnerDefaults: "contact",
  showOwnerName: "public",
  showCareBadges: "public",
  showMoments: "public",
  showTimeline: "public",
  showBirthdayOnTimeline: "public",
  showAdoptionDayOnTimeline: "public",
  showHealthSummary: "public",
  showGeneralArea: "contact",
  showWhatsapp: "contact",
  showPhone: "contact",
  showEmergencyNote: "contact",
};

const speciesOptions: PetSpecies[] = ["Dog", "Cat", "Rabbit", "Bird", "Other"];

const emptyForm: FormState = {
  name: "",
  species: "Dog",
  breed: "",
  gender: "",
  color: "",
  birthdayDate: "",
  estimatedAge: "",
  photoUrl: "",
  coverUrl: "",
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
  ownerName: "",
  whatsapp: "",
  phone: "",
  useOwnerDefaults: true,
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
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const [form, setForm] = useState<FormState>(() =>
    toFormState(initialPet, defaultOwnerSettings)
  );
  const [currentPet, setCurrentPet] = useState<Pet | null>(initialPet ?? null);
  const [createdPet, setCreatedPet] = useState<Pet | null>(null);
  const [savedPet, setSavedPet] = useState<Pet | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const [tab, setTab] = useState<EditTab>("basic");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const settings = readOwnerSettings();
      setOwnerSettings(settings);

      if (mode === "create") {
        setForm(toFormState(undefined, settings));
      } else if (initialPet) {
        setForm(toFormState(initialPet, settings));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialPet, mode]);

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
      setForm(toFormState(response.data, readOwnerSettings()));
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

  function setUseOwnerDefaults(useDefaults: boolean) {
    setForm((current) => ({
      ...current,
      useOwnerDefaults: useDefaults,
      ownerName: useDefaults
        ? ownerSettings.ownerDisplayName
        : current.ownerName || ownerSettings.ownerDisplayName,
      whatsapp: useDefaults
        ? ownerSettings.whatsappNumber
        : current.whatsapp || ownerSettings.whatsappNumber,
      phone: useDefaults
        ? ownerSettings.phoneNumber
        : current.phone || ownerSettings.phoneNumber,
      generalArea: useDefaults
        ? ownerSettings.defaultGeneralArea
        : current.generalArea || ownerSettings.defaultGeneralArea,
    }));
    setErrors((current) => ({
      ...current,
      ownerName: undefined,
      whatsapp: undefined,
      phone: undefined,
      generalArea: undefined,
    }));
    setSuccess("");
  }

  function collectErrors() {
    const nextErrors: FormErrors = {};
    const slug = slugifyPetSlug(form.slug);

    checkRequired(nextErrors, "name", form.name, "Pet name is required.");
    checkRequired(nextErrors, "species", form.species, "Pet type is required.");
    checkRequired(nextErrors, "slug", form.slug, "Public profile slug is required.");

    if (form.slug && form.slug !== slug) {
      nextErrors.slug =
        "Use lowercase letters, numbers, and hyphens only, like milo-the-dog.";
    }

    if (form.whatsapp && !isValidE164(form.whatsapp)) {
      nextErrors.whatsapp = "Please enter a valid WhatsApp number.";
    }

    if (form.phone && !isValidE164(form.phone)) {
      nextErrors.phone = "Please enter a valid phone number.";
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

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = collectErrors();
    setErrors(nextErrors);

    const firstErrorKey = Object.keys(nextErrors)[0] as
      | keyof FormState
      | undefined;

    if (firstErrorKey) {
      setTab(fieldTab[firstErrorKey]);
      return;
    }

    setIsSubmitting(true);
    setSuccess("");

    const payload = buildPayload(form, ownerSettings);

    try {
      if (mode === "create") {
        const response = await createPet(payload);
        setCreatedPet(response.data);
        setCurrentPet(response.data);
        setForm(toFormState(response.data, ownerSettings));
      } else if (currentPet) {
        const response = await updatePet(currentPet.id, payload);

        if (response.data) {
          setCurrentPet(response.data);
          setSavedPet(response.data);
          setForm(toFormState(response.data, ownerSettings));
          setSuccess("Changes saved. Public profile and QR safety page are updated.");
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
          path={createdPet.publicProfilePath}
          petName={createdPet.name}
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <CTAButton
            href={createdPet.publicProfilePath}
            icon="heart"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Public Profile
          </CTAButton>
          <CTAButton
            href={createdPet.qrSafetyPath}
            icon="qr"
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            View QR Safety Page
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petTagOrder(createdPet.id)}
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
        photoUrl: form.photoUrl,
        profileTheme: form.profileTheme,
      }
    : {
        species: form.species,
        photoInitial: getInitial(form.name),
        photoTone: "apricot" as const,
        photoUrl: form.photoUrl,
        profileTheme: form.profileTheme,
      };
  const profileSlug = slugifyPetSlug(form.slug) || "pet-profile";
  // Public profiles are addressed by {slug}-{publicCode}; the publicCode is
  // generated on save, so a live preview link only exists when editing.
  const profilePath = currentPet
    ? publicProfilePath(profileSlug, currentPet.publicCode)
    : "";
  const publicProfileFullUrl =
    profilePath && origin ? `${origin}${profilePath}` : profilePath;
  const finderFullUrl =
    origin && currentPet
      ? `${origin}${currentPet.qrSafetyPath}`
      : currentPet?.qrSafetyPath ?? "";
  const selectedTheme = getPetProfileTheme(form.profileTheme);
  const saveLabel = mode === "create" ? "Save Pet" : "Save Changes";
  const cancelHref =
    mode === "edit" && currentPet ? ownerRoutes.petProfile(currentPet.id) : "/pets";
  const hasUnsavedThemeChange =
    mode === "edit" &&
    currentPet &&
    form.profileTheme !== currentPet.profileTheme;

  return (
    <form className="grid min-w-0 gap-5" onSubmit={handleSubmit}>
      {success ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage">
          {success}
        </div>
      ) : null}

      <SegmentedTabs
        ariaLabel="Edit pet sections"
        activeId={tab}
        onChange={(id) => setTab(id as EditTab)}
        tabs={editTabs}
      />

      {tab === "basic" ? (
        <FormSection
          title="Basic Info"
          description="These details help friends, family, and finders recognize your pet quickly."
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
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
                onChange={(event) =>
                  updateField("birthdayDate", event.target.value)
                }
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

          <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Field
              error={errors.bio}
              helper="A few friendly details make the page feel personal."
              label="Short bio / description"
            >
              <textarea
                className="brand-input min-h-32"
                maxLength={320}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Milo is gentle, snack-loving, and happiest after evening walks."
                value={form.bio}
              />
            </Field>

            <div className="grid min-w-0 gap-4">
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
          </div>
        </FormSection>
      ) : null}

      {tab === "photos" ? (
        <FormSection
          title="Photos"
          description="Add the pet photos you want saved with this profile. The Theme tab controls the public page colors."
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="brand-soft-card min-w-0 rounded-[1.5rem] p-5">
              <p className="text-sm font-black text-pet-ink">Profile preview</p>
              <div className="mt-5 flex items-center gap-4">
                <PetAvatar pet={previewPet} size="lg" />
                <div>
                  <p className="font-black text-pet-ink">
                    {form.name || "Your pet"}
                  </p>
                  <p className="mt-1 text-sm text-pet-muted">
                    {form.photoUrl
                      ? "Portrait ready"
                      : "Add a portrait when you are ready"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <ImageUploadField
                label="Profile photo"
                helper="Used for this pet's avatar across the portal and public pages."
                shape="square"
                value={form.photoUrl}
                onChange={(dataUrl) => updateField("photoUrl", dataUrl)}
                emptyIcon={<Icon name="paw" className="h-5 w-5" />}
              />

              <ImageUploadField
                label="Cover photo"
                helper="A warm wide banner for the public profile."
                value={form.coverUrl}
                onChange={(dataUrl) => updateField("coverUrl", dataUrl)}
              />
            </div>
          </div>
        </FormSection>
      ) : null}

      {tab === "theme" ? (
        <FormSection
          title="Profile Theme"
          description={`Applied to both ${
            form.name || "your pet"
          }'s public share profile and QR safety page.`}
        >
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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

            {hasUnsavedThemeChange ? (
              <p className="rounded-[1rem] bg-[#fffbea] px-4 py-3 text-xs font-bold text-[#856a00]">
                Save changes to update {form.name || "your pet"}&apos;s public
                profile and QR safety page.
              </p>
            ) : null}

            <ThemePreviewPanel
              petName={form.name || "Your pet"}
              theme={selectedTheme}
            />
          </div>
        </FormSection>
      ) : null}

      {tab === "public" ? (
        <FormSection
          title="Public Profile"
          description="Settings for the shareable profile at /p/{slug}-{publicCode}. This is the friendly page you share with friends and family."
        >
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
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

              <Field error={errors.adoptionDate} label="Adoption day">
                <input
                  className="brand-input"
                  onChange={(event) =>
                    updateField("adoptionDate", event.target.value)
                  }
                  type="date"
                  value={form.adoptionDate}
                />
              </Field>
            </div>

            <PrivacyGroup title="What appears on the public profile">
              <Checkbox
                checked={form.showOwnerName}
                label="Show owner display name"
                onChange={(value) => updateField("showOwnerName", value)}
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
                onChange={(value) =>
                  updateField("showBirthdayOnTimeline", value)
                }
              />
              <Checkbox
                checked={form.showAdoptionDayOnTimeline}
                label="Show adoption day in Life Timeline"
                onChange={(value) =>
                  updateField("showAdoptionDayOnTimeline", value)
                }
              />
            </PrivacyGroup>

            <details className="rounded-[1.5rem] border border-pet-border bg-white">
              <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-pet-muted select-none">
                Advanced
              </summary>
              <div className="grid gap-3 px-5 pb-5">
                <Checkbox
                  checked={form.showHealthSummary}
                  label="Allow public care record details"
                  onChange={(value) => updateField("showHealthSummary", value)}
                />
              </div>
            </details>

            <div className="brand-card min-w-0 rounded-[1.5rem] p-5">
              {publicProfileFullUrl ? (
                <UrlDisplay label="Public Profile URL" url={publicProfileFullUrl} />
              ) : (
                <p className="text-sm font-semibold leading-6 text-pet-muted">
                  Your public profile link will be ready right after you save
                  this pet.
                </p>
              )}
            </div>
          </div>
        </FormSection>
      ) : null}

      {tab === "contact" ? (
        <FormSection
          title="Contact & Safety"
          description="Choose what finders see on your pet's QR Safety Page. Your full address is never shown."
        >
          <div className="grid min-w-0 gap-4">
            <p className="rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
              Lost Mode tells finders your pet is missing and shows urgent
              instructions on the QR Safety Page.
            </p>
            {mode === "edit" && currentPet ? (
              <div className="flex flex-col gap-3 rounded-[1.25rem] border border-pet-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-pet-ink">
                    Lost Mode status
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                    {currentPet.lostModeEnabled
                      ? `${currentPet.name} is currently marked missing.`
                      : `Mark ${currentPet.name} as missing from the pet management page if needed.`}
                  </p>
                </div>
                <CTAButton
                  href={ownerRoutes.petProfile(currentPet.id)}
                  icon="shield"
                  variant="outline"
                  className="sm:w-auto"
                  fullWidth
                >
                  Manage Lost Mode
                </CTAButton>
              </div>
            ) : null}

            <div className="rounded-[1.5rem] border border-pet-border bg-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-black text-pet-ink">
                    Contact details for this pet
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-pet-muted">
                    {form.useOwnerDefaults
                      ? "Using your account contact details from Settings."
                      : `Using different contact details for ${
                          form.name || "this pet"
                        }.`}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-pet-muted">
                    These settings only apply to {form.name || "this pet"}.
                    Account defaults are managed in Settings.
                  </p>
                </div>
                <CTAButton href={ownerRoutes.settings} variant="outline">
                  Edit account settings
                </CTAButton>
              </div>

              <ContactSummary
                generalArea={form.generalArea}
                ownerName={form.ownerName}
                phone={form.phone}
                whatsapp={form.whatsapp}
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    form.useOwnerDefaults
                      ? "border-pet-teal bg-[#e8f3ff] text-pet-teal"
                      : "border-pet-border bg-white text-pet-muted hover:bg-pet-cream"
                  }`}
                  onClick={() => setUseOwnerDefaults(true)}
                  type="button"
                >
                  Use account contact details
                </button>
                <button
                  className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    !form.useOwnerDefaults
                      ? "border-pet-teal bg-[#e8f3ff] text-pet-teal"
                      : "border-pet-border bg-white text-pet-muted hover:bg-pet-cream"
                  }`}
                  onClick={() => setUseOwnerDefaults(false)}
                  type="button"
                >
                  Use different contact details for this pet
                </button>
              </div>
            </div>

            {!form.useOwnerDefaults ? (
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <TextInput
                  error={errors.ownerName}
                  label="Owner display name"
                  maxLength={80}
                  onChange={(value) => updateField("ownerName", value)}
                  placeholder={`${form.name || "Your pet"}'s owner`}
                  value={form.ownerName}
                />
                <TextInput
                  error={errors.generalArea}
                  helper="Example: Petaling Jaya, Selangor."
                  label="General area"
                  maxLength={120}
                  onChange={(value) => updateField("generalArea", value)}
                  placeholder="Petaling Jaya, Selangor"
                  value={form.generalArea}
                />
                <PhoneNumberInput
                  error={errors.whatsapp}
                  helper="Optional, but useful for quick finder contact."
                  label="WhatsApp number"
                  onChange={(value) => updateField("whatsapp", value)}
                  value={form.whatsapp}
                />
                <PhoneNumberInput
                  error={errors.phone}
                  helper="Optional. Used for the call button on the safety page."
                  label="Phone number"
                  onChange={(value) => updateField("phone", value)}
                  value={form.phone}
                />
              </div>
            ) : null}

            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <Field
                error={errors.safetyNote}
                helper="Helpful for anyone who finds your pet outside."
                label="Safety note / handling instructions"
              >
                <textarea
                  className="brand-input min-h-28"
                  maxLength={260}
                  onChange={(event) =>
                    updateField("safetyNote", event.target.value)
                  }
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
                  onChange={(event) =>
                    updateField("emergencyNote", event.target.value)
                  }
                  placeholder="Keep shaded and contact owner first."
                  value={form.emergencyNote}
                />
              </Field>
            </div>

            <p className="rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted">
              Privacy settings here only affect {form.name || "this pet"}&apos;s
              public profile and QR safety page.
            </p>

            <PrivacyGroup title="What the finder safety page shows">
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
                checked={form.showGeneralArea}
                label="Show general area"
                onChange={(value) => updateField("showGeneralArea", value)}
              />
            </PrivacyGroup>

            {mode === "edit" && currentPet ? (
              <div className="brand-card min-w-0 rounded-[1.5rem] p-5">
                {finderFullUrl ? (
                  <UrlDisplay label="QR Safety Page URL" url={finderFullUrl} />
                ) : null}
              </div>
            ) : (
              <p className="rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold text-pet-muted">
                The QR safety page link will be ready after you save this pet.
              </p>
            )}
          </div>
        </FormSection>
      ) : null}

      {mode === "edit" && currentPet ? (
        <div className="brand-card flex min-w-0 flex-col gap-3 rounded-[1.5rem] p-5">
          <p className="text-sm font-black text-pet-ink">
            Manage {form.name || currentPet.name}&apos;s content
          </p>
          <p className="-mt-1 text-xs leading-5 text-pet-muted">
            Records, memories, and smart tags are managed on their own pages.
          </p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <CTAButton
              href={ownerRoutes.petRecords(currentPet.id)}
              icon="record"
              variant="outline"
              fullWidth
            >
              Manage Care Records
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petMomentNew(currentPet.id)}
              icon="heart"
              variant="outline"
              fullWidth
            >
              Add Pet Moment
            </CTAButton>
            <CTAButton
              href={ownerRoutes.petTags(currentPet.id)}
              icon="tag"
              variant="outline"
              fullWidth
            >
              Manage Smart Tags
            </CTAButton>
          </div>
        </div>
      ) : null}

      {/* Desktop action bar. On mobile the sticky bar below handles Save/Cancel. */}
      <div className="hidden rounded-[1.5rem] p-5 brand-card lg:flex lg:flex-row lg:items-center lg:justify-between">
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
          href={cancelHref}
        >
          Cancel
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {mode === "edit" && currentPet ? (
            <>
              <CTAButton
                href={profilePath}
                icon="heart"
                variant="secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Public Profile
              </CTAButton>
              <CTAButton
                href={currentPet.qrSafetyPath}
                icon="qr"
                variant="outline"
                target="_blank"
                rel="noopener noreferrer"
              >
                View QR Safety Page
              </CTAButton>
            </>
          ) : null}
          <CTAButton disabled={isSubmitting} type="submit" variant="coral">
            {isSubmitting ? "Saving..." : saveLabel}
          </CTAButton>
        </div>
      </div>

      {savedPet ? (
        <ShareProfileLink
          path={savedPet.publicProfilePath}
          petName={savedPet.name}
        />
      ) : null}

      {/* Spacer so the last fields clear the fixed mobile action bar. */}
      <div aria-hidden="true" className="h-28 lg:hidden" />

      {/* Sticky mobile action bar, kept above the bottom navigation. */}
      <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 max-w-[calc(100vw-1.5rem)] lg:hidden">
        <div className="brand-card flex min-w-0 items-center gap-2 rounded-full p-2">
          <Link
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            href={cancelHref}
          >
            Cancel
          </Link>
          <button
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-pet-coral px-4 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function UrlDisplay({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-pet-ink">{url}</p>
      </div>
      <button
        className="shrink-0 rounded-full border border-pet-border bg-white px-3 py-1.5 text-xs font-bold text-pet-muted transition hover:bg-pet-cream"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function ContactSummary({
  ownerName,
  whatsapp,
  phone,
  generalArea,
}: {
  ownerName: string;
  whatsapp: string;
  phone: string;
  generalArea: string;
}) {
  const items = [
    ["Owner display name", ownerName || "Not set"],
    ["WhatsApp number", whatsapp || "Not set"],
    ["Phone number", phone || "Not set"],
    ["General area", generalArea || "Malaysia"],
  ];

  return (
    <dl className="mt-4 grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="rounded-[1rem] bg-pet-cream p-3" key={label}>
          <dt className="text-xs font-bold uppercase text-pet-muted">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm font-black text-pet-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function toFormState(
  pet?: Pet,
  ownerSettings: OwnerSettings = defaultOwnerSettings
): FormState {
  if (!pet) {
    const visibility = getDefaultPetVisibility(ownerSettings);

    return {
      ...emptyForm,
      generalArea: ownerSettings.defaultGeneralArea,
      ownerName: ownerSettings.ownerDisplayName,
      whatsapp: ownerSettings.whatsappNumber,
      phone: ownerSettings.phoneNumber,
      useOwnerDefaults: true,
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

  const visibility = mergeVisibility(pet.visibility);
  const contact = getEffectivePetContact(pet, ownerSettings);

  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    gender: pet.gender,
    color: pet.color,
    birthdayDate: parseDisplayDate(pet.birthday),
    estimatedAge: pet.ageLabel === "Age not set" ? "" : pet.ageLabel,
    photoUrl: pet.photoUrl ?? "",
    coverUrl: pet.coverUrl ?? "",
    profileTheme: pet.profileTheme ?? "default",
    bio: pet.bio,
    personalityTags: pet.personalityTags.join(", "),
    favoriteFood: pet.favoriteFood === "Not set" ? "" : pet.favoriteFood,
    favoriteToy: pet.favoriteToy === "Not set" ? "" : pet.favoriteToy,
    adoptionDate: parseDisplayDate(pet.adoptionDay),
    slug: pet.slug,
    generalArea: contact.generalArea,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    ownerName: contact.ownerDisplayName,
    whatsapp: contact.whatsappNumber,
    phone: contact.phoneNumber,
    useOwnerDefaults: contact.useOwnerDefaults,
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

function buildPayload(
  form: FormState,
  ownerSettings: OwnerSettings = defaultOwnerSettings
): PetPayload {
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
    generalArea:
      form.generalArea.trim() || ownerSettings.defaultGeneralArea || "Malaysia",
    photoInitial: getInitial(name),
    photoTone: form.species === "Cat" ? "mint" : "apricot",
    photoUrl: form.photoUrl,
    coverUrl: form.coverUrl,
    profilePhotoLabel: form.photoUrl ? "Profile photo added" : "",
    coverPhotoLabel: form.coverUrl ? "Cover photo added" : "",
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
    owner: {
      name: form.ownerName.trim() || `${name}'s owner`,
      whatsapp: normalizeStoredPhone(form.whatsapp),
      phone: normalizeStoredPhone(form.phone),
      emergencyContact:
        normalizeStoredPhone(form.phone) || normalizeStoredPhone(form.whatsapp),
    },
    contactOverride: form.useOwnerDefaults
      ? { useOwnerDefaults: true }
      : {
          useOwnerDefaults: false,
          ownerDisplayName: form.ownerName.trim(),
          whatsappNumber: normalizeStoredPhone(form.whatsapp),
          phoneNumber: normalizeStoredPhone(form.phone),
          generalArea:
            form.generalArea.trim() ||
            ownerSettings.defaultGeneralArea ||
            "Malaysia",
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
    <label className="grid min-w-0 gap-2">
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
    <label className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-pet-cream p-4 text-sm font-bold text-pet-ink">
      <span className="min-w-0">{label}</span>
      <input
        checked={checked}
        className="h-4 w-4 accent-pet-teal"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function PrivacyGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[1.5rem] border border-pet-border bg-white p-5">
      <p className="mb-3 text-sm font-black text-pet-ink">{title}</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">{children}</div>
    </div>
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
      className={`min-h-[220px] min-w-0 rounded-[1.25rem] border p-4 text-left transition ${
        selected
          ? "shadow-lg shadow-[#0d1b3d]/10"
          : "border-pet-border bg-white hover:-translate-y-0.5 hover:shadow-md"
      }`}
      onClick={onSelect}
      style={
        selected
          ? {
              background: theme.colors.surface,
              borderColor: theme.colors.primary,
              boxShadow: `0 4px 20px ${theme.colors.primary}22`,
            }
          : undefined
      }
      type="button"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-black text-pet-ink">{theme.name}</p>
        {selected ? (
          <span
            className="rounded-full px-2 py-1 text-[10px] font-black uppercase"
            style={{
              background: theme.colors.primarySoft,
              color: theme.colors.primary,
            }}
          >
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
      className="min-w-0 overflow-hidden rounded-[1.5rem] border"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div
        className="grid min-w-0 gap-5 p-5 lg:grid-cols-[0.9fr_1.1fr]"
        style={{ background: theme.gradients.page }}
      >
        <div>
          <p
            className="text-sm font-black"
            style={{ color: theme.colors.text }}
          >
            How {petName}&apos;s public profile will look
          </p>
          <p
            className="mt-2 text-sm leading-6"
            style={{ color: theme.colors.mutedText }}
          >
            {theme.description}
          </p>
        </div>

        <div
          className="min-w-0 rounded-[1.25rem] border p-3"
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
          <div className="grid min-w-0 gap-3 pt-4 sm:grid-cols-[88px_1fr]">
            <div
              className="grid h-20 w-20 place-items-center rounded-[1.25rem] text-xl font-black"
              style={{
                background: theme.colors.accentSoft,
                color: theme.colors.accent,
              }}
            >
              {getInitial(petName)}
            </div>
            <div className="min-w-0">
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

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return "";
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
