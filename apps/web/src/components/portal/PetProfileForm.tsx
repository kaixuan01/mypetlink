"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ImageUploadField } from "@/components/portal/ImageUploadField";
import { LostModeControl } from "@/components/portal/LostModeControl";
import { MobileFormActionBar } from "@/components/portal/MobileFormActionBar";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CoverPhoto } from "@/components/ui/CoverPhoto";
import { DateInput } from "@/components/ui/DateInput";
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
import type { CoverCropMetrics } from "@/lib/coverCrop";
import {
  defaultOwnerSettings,
  getDefaultPetVisibility,
  getEffectivePetContact,
  hasUsableOwnerContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { OwnerContactSetupCard } from "@/components/portal/OwnerContactSetupCard";
import {
  applyPetAgeMode,
  calculatePetAge,
  getEstimatedBirthYearOptions,
  getPetAgeMode,
  MINIMUM_PET_BIRTH_YEAR,
  type PetAgeMode,
} from "@/lib/petAge";
import { PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import { isActivePet } from "@/lib/petLifecycle";
import {
  getBioTemplates,
  getPetSuggestions,
  MAX_PERSONALITY_TAGS,
} from "@/lib/petSuggestions";
import { getPublicProfileShareVersion } from "@/lib/publicProfileSocial";
import { getSafetyProfileStatusView } from "@/lib/safetyProfile";
import { smartTagOrderingEnabled } from "@/lib/features";
import {
  getCurrentLocalDestination,
  ownerLoginPath,
} from "@/lib/authRedirect";
import { ownerRoutes, publicProfilePath } from "@/lib/routes";
import {
  createPet,
  getFriendlyApiErrorMessage,
  getPetById,
  slugifyPetSlug,
  updatePet,
  updatePetLifecycle,
} from "@/services/petService";
import { canUseApi } from "@/services/apiConfig";
import { isApiClientError } from "@/services/apiClient";
import { logoutOwner } from "@/services/authService";
import { deleteMedia, uploadMediaFile } from "@/services/mediaService";
import type {
  Pet,
  PetLifecycleStatus,
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
  customSpecies: string;
  breed: string;
  gender: string;
  color: string;
  ageInformationMode: PetAgeMode;
  birthdayDate: string;
  estimatedBirthYear: string;
  photoUrl: string;
  coverUrl: string;
  coverPositionX: number;
  coverPositionY: number;
  profileTheme: PetProfileThemeId;
  lifecycleStatus: PetLifecycleStatus;
  passedAwayDate: string;
  memorialMessage: string;
  showMemorialOnPublicProfile: boolean;
  bio: string;
  personalityTags: string[];
  favoriteFoods: string[];
  favoriteToys: string[];
  allergies: string[];
  adoptionDate: string;
  slug: string;
  generalArea: string;
  safetyNote: string;
  emergencyNote: string;
  ownerName: string;
  whatsapp: string;
  phone: string;
  useOwnerDefaults: boolean;
  qrSafetyEnabled: boolean;
  publicProfileEnabled: boolean;
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
  showAllergiesOnPublicProfile: boolean;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

type EditTab = "basic" | "photos" | "theme" | "public" | "contact";
type EditPetLoadState = "checking" | "ready" | "not-found" | "error";

const editTabs: (SegmentedTab & { id: EditTab })[] = [
  { id: "basic", label: "Basic Info", mobileLabel: "Info" },
  { id: "photos", label: "Photos" },
  { id: "theme", label: "Theme" },
  { id: "public", label: "Public Profile", mobileLabel: "Public" },
  { id: "contact", label: "Contact & Safety", mobileLabel: "Safety" },
];

const MAX_ALLERGIES = 8;
const MAX_ALLERGY_LENGTH = 80;
const allergySuggestions = [
  "Chicken",
  "Beef",
  "Dairy",
  "Eggs",
  "Fish",
  "Penicillin",
  "Flea bites",
  "Pollen",
];

const lifecycleOptions: {
  status: PetLifecycleStatus;
  description: string;
}[] = [
  {
    status: "Active",
    description: "Your pet profile is visible and works normally.",
  },
  {
    status: "Memorial",
    description: "Keep this profile as a gentle place for memories.",
  },
  {
    status: "Archived",
    description:
      "Hide this pet from your active list and public pages. You can restore it later.",
  },
];

// Which tab each field lives on, so a validation error can pull the owner to
// the right tab instead of failing silently on a hidden one.
const fieldTab: Record<keyof FormState, EditTab> = {
  name: "basic",
  species: "basic",
  customSpecies: "basic",
  breed: "basic",
  gender: "basic",
  color: "basic",
  ageInformationMode: "basic",
  birthdayDate: "basic",
  estimatedBirthYear: "basic",
  bio: "basic",
  personalityTags: "basic",
  favoriteFoods: "basic",
  favoriteToys: "basic",
  allergies: "contact",
  photoUrl: "photos",
  coverUrl: "photos",
  coverPositionX: "photos",
  coverPositionY: "photos",
  profileTheme: "theme",
  lifecycleStatus: "public",
  passedAwayDate: "public",
  memorialMessage: "public",
  showMemorialOnPublicProfile: "public",
  slug: "public",
  adoptionDate: "public",
  generalArea: "contact",
  safetyNote: "contact",
  emergencyNote: "contact",
  ownerName: "contact",
  whatsapp: "contact",
  phone: "contact",
  useOwnerDefaults: "contact",
  qrSafetyEnabled: "contact",
  publicProfileEnabled: "public",
  showOwnerName: "public",
  showCareBadges: "public",
  showMoments: "public",
  showTimeline: "public",
  showBirthdayOnTimeline: "public",
  showAdoptionDayOnTimeline: "public",
  showHealthSummary: "public",
  showAllergiesOnPublicProfile: "public",
  showGeneralArea: "contact",
  showWhatsapp: "contact",
  showPhone: "contact",
  showEmergencyNote: "contact",
};

const emptyForm: FormState = {
  name: "",
  species: "Dog",
  customSpecies: "",
  breed: "",
  gender: "",
  color: "",
  ageInformationMode: "Unknown",
  birthdayDate: "",
  estimatedBirthYear: "",
  photoUrl: "",
  coverUrl: "",
  coverPositionX: 50,
  coverPositionY: 50,
  profileTheme: "default",
  lifecycleStatus: "Active",
  passedAwayDate: "",
  memorialMessage: "",
  showMemorialOnPublicProfile: true,
  bio: "",
  personalityTags: [],
  favoriteFoods: [],
  favoriteToys: [],
  allergies: [],
  adoptionDate: "",
  slug: "",
  generalArea: "",
  safetyNote: "",
  emergencyNote: "",
  ownerName: "",
  whatsapp: "",
  phone: "",
  useOwnerDefaults: true,
  qrSafetyEnabled: true,
  publicProfileEnabled: true,
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
  showAllergiesOnPublicProfile: false,
};

export function PetProfileForm({ mode, initialPet }: PetProfileFormProps) {
  const router = useRouter();
  const initialPetId = initialPet?.id;
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const [form, setForm] = useState<FormState>(() =>
    toFormState(initialPet, defaultOwnerSettings)
  );
  const [currentPet, setCurrentPet] = useState<Pet | null>(initialPet ?? null);
  const [createdPet, setCreatedPet] = useState<Pet | null>(null);
  const [savedPet, setSavedPet] = useState<Pet | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | undefined>();
  const [coverPhotoFile, setCoverPhotoFile] = useState<File | undefined>();
  const [coverCropMetrics, setCoverCropMetrics] =
    useState<CoverCropMetrics | null>(null);
  const [success, setSuccess] = useState("");
  const [editPetLoadState, setEditPetLoadState] = useState<EditPetLoadState>(
    mode === "edit" ? "checking" : "ready"
  );
  const [editPetLoadError, setEditPetLoadError] = useState("");
  const [statusAction, setStatusAction] = useState<
    "active" | "memorial" | "archive" | null
  >(null);
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const [tab, setTab] = useState<EditTab>("basic");
  const [bioSheetOpen, setBioSheetOpen] = useState(false);
  const contactLostModeRef = useRef<HTMLDivElement | null>(null);
  const petContactSectionRef = useRef<HTMLDivElement | null>(null);

  // "Update Contact" for a pet with its own contact details: bring the
  // Emergency Contact section into view and move focus into it so the owner
  // lands directly on the editable fields.
  function focusPetContactSection() {
    const section = petContactSectionRef.current;

    if (!section) {
      return;
    }

    section.scrollIntoView({ block: "start", behavior: "smooth" });
    section
      .querySelector<HTMLElement>("input, button, a")
      ?.focus({ preventScroll: true });
  }

  // Deep links (e.g. the pet hub's Update Contact action) can open a specific
  // tab with ?tab=contact so owners never land on the wrong section. Applied
  // after hydration so the server-rendered markup stays stable.
  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get("tab");

    if (requested && editTabs.some((item) => item.id === requested)) {
      queueMicrotask(() => setTab(requested as EditTab));
    }
  }, []);

  useEffect(() => {
    if (mode !== "edit" || tab !== "contact") {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      if (window.innerWidth < 1024) {
        contactLostModeRef.current?.scrollIntoView({ block: "start" });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mode, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const settings = readOwnerSettings();
      setOwnerSettings(settings);

      if (mode === "create") {
        setForm(toFormState(undefined, settings));
      } else if (initialPet) {
        setForm(toFormState(initialPet, settings));
      }

      setProfilePhotoFile(undefined);
      setCoverPhotoFile(undefined);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialPet, mode]);

  useEffect(() => {
    if (mode !== "edit" || !initialPetId) {
      return;
    }

    let active = true;
    const petId = initialPetId;

    async function loadPet() {
      try {
        setEditPetLoadState("checking");
        setEditPetLoadError("");
        const response = await getPetById(petId);

        if (!active) {
          return;
        }

        if (!response.data) {
          setCurrentPet(null);
          setEditPetLoadState("not-found");
          return;
        }

        setCurrentPet(response.data);
        setForm(toFormState(response.data, readOwnerSettings()));
        setEditPetLoadState("ready");
      } catch (caught) {
        if (!active) {
          return;
        }

        if (isExpiredSessionError(caught)) {
          logoutOwner();
          router.replace(
            ownerLoginPath(
              getCurrentLocalDestination(ownerRoutes.petEdit(petId))
            )
          );
          return;
        }

        setEditPetLoadError(getFriendlyApiErrorMessage(caught));
        setEditPetLoadState("error");
      }
    }

    void loadPet();

    return () => {
      active = false;
    };
  }, [initialPetId, mode, router]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError("");
    setSuccess("");
  }

  function updateSpecies(species: PetSpecies) {
    setForm((current) => ({
      ...current,
      species,
      customSpecies: species === "Other" ? current.customSpecies : "",
    }));
    setErrors((current) => ({
      ...current,
      species: undefined,
      customSpecies: undefined,
    }));
    setFormError("");
    setSuccess("");
  }

  function updateBirthday(value: string) {
    setForm((current) => ({
      ...current,
      birthdayDate: value,
      estimatedBirthYear: "",
    }));
    setErrors((current) => ({
      ...current,
      birthdayDate: undefined,
      estimatedBirthYear: undefined,
    }));
    setFormError("");
    setSuccess("");
  }

  function updateAgeInformationMode(ageInformationMode: PetAgeMode) {
    setForm((current) => ({
      ...current,
      ageInformationMode,
      ...applyPetAgeMode(ageInformationMode, current),
    }));
    setErrors((current) => ({
      ...current,
      ageInformationMode: undefined,
      birthdayDate: undefined,
      estimatedBirthYear: undefined,
    }));
    setFormError("");
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
    setFormError("");
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
    setFormError("");
    setSuccess("");
  }

  function collectErrors() {
    const nextErrors: FormErrors = {};
    const slug = slugifyPetSlug(form.slug);

    checkRequired(nextErrors, "name", form.name, "Pet name is required.");
    checkRequired(nextErrors, "species", form.species, "Pet type is required.");
    checkRequired(nextErrors, "slug", form.slug, "Public profile slug is required.");

    if (form.species === "Other" && !form.customSpecies.trim()) {
      nextErrors.customSpecies = "Enter your pet type.";
    }

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

    if (form.ageInformationMode === "ExactBirthday") {
      if (!form.birthdayDate) {
        nextErrors.birthdayDate = "Choose your pet's birthday.";
      } else if (!isValidDate(form.birthdayDate)) {
        nextErrors.birthdayDate = "Choose a valid birthday.";
      } else if (new Date(`${form.birthdayDate}T00:00:00`) > new Date()) {
        nextErrors.birthdayDate = "Birthday cannot be in the future.";
      } else if (Number(form.birthdayDate.slice(0, 4)) < MINIMUM_PET_BIRTH_YEAR) {
        nextErrors.birthdayDate = `Birthday must be in ${MINIMUM_PET_BIRTH_YEAR} or later.`;
      }
    }

    if (form.ageInformationMode === "EstimatedBirthYear") {
      const estimatedBirthYear = Number(form.estimatedBirthYear);
      const currentYear = new Date().getUTCFullYear();

      if (!form.estimatedBirthYear) {
        nextErrors.estimatedBirthYear = "Choose an estimated birth year.";
      } else if (
        !Number.isInteger(estimatedBirthYear) ||
        estimatedBirthYear < MINIMUM_PET_BIRTH_YEAR ||
        estimatedBirthYear > currentYear
      ) {
        nextErrors.estimatedBirthYear = `Choose a year from ${MINIMUM_PET_BIRTH_YEAR} to ${currentYear}.`;
      }
    }

    if (form.adoptionDate && !isValidDate(form.adoptionDate)) {
      nextErrors.adoptionDate = "Choose a valid adoption day.";
    }

    if (form.passedAwayDate) {
      if (!isValidDate(form.passedAwayDate)) {
        nextErrors.passedAwayDate = "Choose a valid date.";
      } else if (new Date(`${form.passedAwayDate}T00:00:00`) > new Date()) {
        nextErrors.passedAwayDate = "Passed away date cannot be in the future.";
      }
    }

    enforceMax(nextErrors, "name", form.name, 60);
    enforceMax(nextErrors, "breed", form.breed, 80);
    enforceMax(nextErrors, "customSpecies", form.customSpecies, 60);
    enforceMax(nextErrors, "gender", form.gender, 40);
    enforceMax(nextErrors, "color", form.color, 80);
    enforceMax(nextErrors, "generalArea", form.generalArea, 120);
    enforceMax(nextErrors, "bio", form.bio, 320);
    enforceMax(nextErrors, "safetyNote", form.safetyNote, 260);
    enforceMax(nextErrors, "emergencyNote", form.emergencyNote, 260);
    // Multi-value fields are length- and count-capped at entry time by their
    // shared picker, so no separate free-text length check is needed here.
    enforceMax(nextErrors, "ownerName", form.ownerName, 80);
    enforceMax(nextErrors, "memorialMessage", form.memorialMessage, 240);

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

    if (
      mode === "edit" &&
      currentPet &&
      form.lifecycleStatus !== currentPet.lifecycleStatus
    ) {
      if (
        currentPet.lifecycleStatus === "Archived" &&
        form.lifecycleStatus === "Memorial"
      ) {
        setFormError(
          "Restore this profile to Active before moving it to Memorial."
        );
        return;
      }

      setStatusAction(
        form.lifecycleStatus === "Memorial"
          ? "memorial"
          : form.lifecycleStatus === "Archived"
            ? "archive"
            : "active"
      );
      return;
    }

    await saveChanges();
  }

  async function saveChanges() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSuccess("");
    setFormError("");

    const payload = buildPayload(form, ownerSettings);

    try {
      if (mode === "create") {
        const response = await createPet(payload);
        let savedPet = response.data;

        try {
          savedPet = await syncPetMedia(savedPet, null);
          setProfilePhotoFile(undefined);
          setCoverPhotoFile(undefined);
        } catch (mediaError) {
          if (
            redirectAfterExpiredSession(
              mediaError,
              router,
              ownerRoutes.petEdit(savedPet.id)
            )
          ) {
            return;
          }

          setFormError(getMediaUploadErrorMessage(mediaError));
        }

        setCreatedPet(savedPet);
        setCurrentPet(savedPet);
        setForm(toFormState(savedPet, ownerSettings));
      } else if (currentPet) {
        const previousPet = currentPet;
        // Lifecycle changes use the dedicated, owner-authorized endpoints. Keep
        // the ordinary profile update pinned to the saved lifecycle so local
        // demo mode follows the same contract as the API.
        const response = await updatePet(currentPet.id, {
          ...payload,
          lifecycleStatus: currentPet.lifecycleStatus,
          previousLifecycleStatus: currentPet.previousLifecycleStatus,
          memorial: currentPet.memorial,
        });

        if (response.data) {
          let savedPet = response.data;

          if (
            form.lifecycleStatus !== previousPet.lifecycleStatus ||
            form.lifecycleStatus === "Memorial"
          ) {
            const lifecycleResponse = await updatePetLifecycle(
              currentPet.id,
              form.lifecycleStatus,
              {
                passedAwayDate: form.passedAwayDate
                  ? formatDisplayDate(form.passedAwayDate)
                  : previousPet.memorial.passedAwayDate,
                memorialMessage: form.memorialMessage.trim(),
                showMemorialOnPublicProfile:
                  form.showMemorialOnPublicProfile,
              }
            );

            if (!lifecycleResponse.data) {
              throw new Error("We could not update this pet profile.");
            }

            savedPet = lifecycleResponse.data;
          }

          try {
            savedPet = await syncPetMedia(savedPet, previousPet);
            setProfilePhotoFile(undefined);
            setCoverPhotoFile(undefined);
            setSuccess(
              "Changes saved. Public Profile and Safety Profile are updated."
            );
          } catch (mediaError) {
            if (
              redirectAfterExpiredSession(
                mediaError,
                router,
                ownerRoutes.petEdit(previousPet.id)
              )
            ) {
              return;
            }

            setFormError(getMediaUploadErrorMessage(mediaError));
          }

          setCurrentPet(savedPet);
          setSavedPet(savedPet);
          setForm(toFormState(savedPet, ownerSettings));
        } else {
          setFormError(
            "We could not find this pet profile. Please return to My Pets and try again."
          );
        }
      }
    } catch (caught) {
      const fallback = currentPet
        ? ownerRoutes.petEdit(currentPet.id)
        : ownerRoutes.petNew;

      if (redirectAfterExpiredSession(caught, router, fallback)) {
        return;
      }

      setFormError(getFriendlyApiErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
      setStatusAction(null);
    }
  }

  async function syncPetMedia(savedPet: Pet, previousPet: Pet | null) {
    if (!canUseApi()) {
      return savedPet;
    }

    let nextPet = savedPet;

    if (profilePhotoFile) {
      const uploaded = await uploadMediaFile({
        file: profilePhotoFile,
        category: "PetProfilePhoto",
        petId: savedPet.id,
      });

      nextPet = {
        ...nextPet,
        profileMediaId: uploaded.mediaId,
        photoUrl: uploaded.publicUrl ?? nextPet.photoUrl,
      };
    } else if (!form.photoUrl && previousPet?.profileMediaId) {
      await deleteMedia(previousPet.profileMediaId);
      nextPet = { ...nextPet, profileMediaId: undefined, photoUrl: "" };
    }

    if (coverPhotoFile) {
      const uploaded = await uploadMediaFile({
        file: coverPhotoFile,
        category: "PetCoverPhoto",
        petId: savedPet.id,
      });

      nextPet = {
        ...nextPet,
        coverMediaId: uploaded.mediaId,
        coverUrl: uploaded.publicUrl ?? nextPet.coverUrl,
      };
    } else if (!form.coverUrl && previousPet?.coverMediaId) {
      await deleteMedia(previousPet.coverMediaId);
      nextPet = { ...nextPet, coverMediaId: undefined, coverUrl: "" };
    }

    return nextPet;
  }

  if (mode === "edit" && editPetLoadState === "checking") {
    return (
      <section className="brand-card rounded-[1.75rem] p-6" role="status">
        <p className="text-sm font-semibold text-pet-muted">
          Loading this pet profile...
        </p>
      </section>
    );
  }

  if (mode === "edit" && editPetLoadState === "not-found") {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">Pet not found</p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          We couldn&rsquo;t find this pet profile.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
          It may have been removed, or it may not belong to this account.
        </p>
        <CTAButton className="mt-5" href={ownerRoutes.pets} variant="secondary">
          Back to My Pets
        </CTAButton>
      </section>
    );
  }

  if (mode === "edit" && editPetLoadState === "error") {
    return (
      <section className="brand-card rounded-[1.75rem] p-6">
        <p className="text-sm font-bold uppercase text-pet-teal">
          Could not load pet
        </p>
        <h2 className="mt-2 text-2xl font-black text-pet-ink">
          This pet profile is temporarily unavailable.
        </h2>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
          {editPetLoadError}
        </p>
        <button
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try Again
        </button>
      </section>
    );
  }

  if (createdPet) {
    return (
      <div className="grid gap-5">
      {!hasUsableOwnerContact(ownerSettings) ? <OwnerContactSetupCard /> : null}
      <section className="rounded-[1.75rem] border border-pet-mint bg-[#e8f8f0] p-6 shadow-sm">
        <p className="text-sm font-bold uppercase text-pet-sage">
          Profile ready
        </p>
        <h2 className="mt-3 text-3xl font-black text-pet-ink">
          {createdPet.name}&apos;s profile is ready.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted">
          You can keep adding care records, moments, and safety details from
          the owner portal.
        </p>
        <ShareProfileLink
          className="mt-5"
          path={createdPet.publicProfilePath}
          petName={createdPet.name}
          shareVersion={getPublicProfileShareVersion(createdPet)}
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
            View Safety Profile
          </CTAButton>
          {isActivePet(createdPet) && smartTagOrderingEnabled ? (
            <CTAButton
              href={ownerRoutes.petTagOrder(createdPet.id)}
              icon="tag"
              variant="outline"
            >
              Order Physical Tag
            </CTAButton>
          ) : null}
          <CTAButton
            href={ownerRoutes.petProfile(createdPet.id)}
            icon="pets"
            variant="outline"
          >
            Manage {createdPet.name}
          </CTAButton>
          <CTAButton href={ownerRoutes.dashboard} icon="home" variant="outline">
            Go to Dashboard
          </CTAButton>
        </div>
      </section>
      </div>
    );
  }

  const previewPet = currentPet
    ? {
        ...currentPet,
        name: form.name || currentPet.name,
        species: form.species,
        customSpecies: form.customSpecies,
        photoInitial: getInitial(form.name || currentPet.name),
        photoUrl: form.photoUrl,
        profileTheme: form.profileTheme,
      }
    : {
        species: form.species,
        customSpecies: form.customSpecies,
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
  const finderFullUrl =
    origin && currentPet
      ? `${origin}${currentPet.qrSafetyPath}`
      : currentPet?.qrSafetyPath ?? "";
  const shareProfilePet = savedPet ?? currentPet;
  // Live Safety Profile status preview: reflects unsaved toggles and contact
  // edits so the owner sees the status their save would produce.
  const safetyStatusView = getSafetyProfileStatusView({
    lifecycleStatus: form.lifecycleStatus,
    qrSafetyEnabled: form.qrSafetyEnabled,
    visibility: {
      showPhone: form.showPhone,
      showWhatsapp: form.showWhatsapp,
    },
    owner: {
      phone: form.phone,
      whatsapp: form.whatsapp,
    },
  });
  const selectedTheme = getPetProfileTheme(form.profileTheme);
  // Species-aware field suggestions (personality, foods, toys, breeds).
  const suggestions = getPetSuggestions(form.species);
  const saveLabel = mode === "create" ? "Save Pet" : "Save Changes";
  const cancelHref =
    mode === "edit" && currentPet ? ownerRoutes.petProfile(currentPet.id) : "/pets";
  const hasUnsavedThemeChange =
    mode === "edit" &&
    currentPet &&
    form.profileTheme !== currentPet.profileTheme;
  const hasUnsavedCoverPositionChange =
    mode === "edit" &&
    currentPet &&
    (form.coverPositionX !== currentPet.coverPositionX ||
      form.coverPositionY !== currentPet.coverPositionY);

  return (
    <form
      className="mx-auto grid w-full min-w-0 max-w-[1140px] gap-5 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0"
      onSubmit={handleSubmit}
    >
      {success ? (
        <div className="rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage">
          {success}
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]">
          {formError}
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
              <PetTypeSelector
                onChange={updateSpecies}
                value={form.species}
              />
            </Field>

            {form.species === "Other" ? (
              <TextInput
                error={errors.customSpecies}
                helper="This is what people will see on the Public Profile and Safety Profile."
                label="Enter pet type"
                maxLength={60}
                onChange={(value) => updateField("customSpecies", value)}
                placeholder="Example: Axolotl"
                value={form.customSpecies}
              />
            ) : null}

            <Field error={errors.breed} label="Breed">
              <BreedSelector
                breeds={suggestions.breeds}
                onChange={(value) => updateField("breed", value)}
                value={form.breed}
              />
            </Field>

            <Field error={errors.gender} label="Gender">
              <GenderSegmentedControl
                onChange={(value) => updateField("gender", value)}
                value={form.gender}
              />
            </Field>

            <TextInput
              error={errors.color}
              label="Color"
              maxLength={80}
              onChange={(value) => updateField("color", value)}
              placeholder="Brown and white"
              value={form.color}
            />

            <Field label="Age information">
              <select
                className="brand-input brand-select"
                onChange={(event) =>
                  updateAgeInformationMode(event.target.value as PetAgeMode)
                }
                value={form.ageInformationMode}
              >
                <option value="ExactBirthday">Exact birthday</option>
                <option value="EstimatedBirthYear">Estimated birth year</option>
                <option value="Unknown">Unknown</option>
              </select>
              {/* Compact calculated-age summary; intentionally not styled like
                  an input because it is not editable. */}
              <span className="text-xs font-semibold leading-5 text-pet-muted">
                Age shown on profiles:{" "}
                <span className="font-black text-pet-ink">
                  {
                    calculatePetAge({
                      birthday:
                        form.ageInformationMode === "ExactBirthday"
                          ? form.birthdayDate
                          : null,
                      estimatedBirthYear:
                        form.ageInformationMode === "EstimatedBirthYear"
                          ? Number(form.estimatedBirthYear) || null
                          : null,
                    }).displayLabel
                  }
                </span>
              </span>
            </Field>

            {form.ageInformationMode === "ExactBirthday" ? (
              <Field
                error={errors.birthdayDate}
                helper="Use this when you know your pet's full birth date."
                label="Exact birthday"
              >
                <DateInput
                  max={new Date().toISOString().slice(0, 10)}
                  min={`${MINIMUM_PET_BIRTH_YEAR}-01-01`}
                  onChange={(event) => updateBirthday(event.target.value)}
                  value={form.birthdayDate}
                />
              </Field>
            ) : null}

            {form.ageInformationMode === "EstimatedBirthYear" ? (
              <Field
                error={errors.estimatedBirthYear}
                helper="Use this when you only know approximately which year your pet was born. Their age will update automatically."
                label="Estimated birth year"
              >
                <select
                  className="brand-input brand-select"
                  onChange={(event) =>
                    updateField("estimatedBirthYear", event.target.value)
                  }
                  value={form.estimatedBirthYear}
                >
                  <option value="">Choose a year</option>
                  {getEstimatedBirthYearOptions().map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {form.ageInformationMode === "Unknown" ? (
              <div className="rounded-[1.25rem] bg-pet-cream px-4 py-3 text-sm leading-6 text-pet-muted">
                Choose this when the birth date and estimated year are not known.
              </div>
            ) : null}
          </div>

          {/* About your pet: the bio spans the full content width so desktop
              never shows a lopsided half-empty column. */}
          <div className="mt-6 grid min-w-0 gap-2">
            <h3 className="text-base font-black text-pet-ink">
              About your pet
            </h3>
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
            <button
              className="justify-self-start text-sm font-bold text-pet-teal underline-offset-2 hover:underline"
              onClick={() => setBioSheetOpen(true)}
              type="button"
            >
              Need inspiration?
            </button>
          </div>

          {/* Tag pickers continue the About your pet section: one balanced
              column per picker on wide screens, two on tablet, one on mobile. */}
          <div className="mt-5 min-w-0">
            <div className="grid min-w-0 content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
              <TagListInput
                error={errors.personalityTags}
                label="Personality tags"
                max={MAX_PERSONALITY_TAGS}
                maxLength={30}
                onChange={(values) => updateField("personalityTags", values)}
                placeholder="Add your own tag"
                suggestions={suggestions.personality}
                values={form.personalityTags}
              />
              <TagListInput
                error={errors.favoriteFoods}
                label="Favourite foods"
                max={3}
                onChange={(values) => updateField("favoriteFoods", values)}
                placeholder="Add a food"
                suggestions={suggestions.foods}
                values={form.favoriteFoods}
              />
              <TagListInput
                error={errors.favoriteToys}
                label="Favourite toys"
                max={3}
                onChange={(values) => updateField("favoriteToys", values)}
                placeholder="Add a toy"
                suggestions={suggestions.toys}
                values={form.favoriteToys}
              />
            </div>
          </div>

          <BioTemplateSheet
            onClose={() => setBioSheetOpen(false)}
            onPick={(template) => {
              updateField("bio", template);
              setBioSheetOpen(false);
            }}
            open={bioSheetOpen}
            petName={form.name}
          />
        </FormSection>
      ) : null}

      {tab === "photos" ? (
        <FormSection
          title="Photos"
          description="Add the pet photos you want saved with this profile. The Theme tab controls the public page colors."
        >
          <div className="grid min-w-0 gap-5">
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <ImageUploadField
                label="Profile photo"
                helper="Used for this pet's avatar across the portal and public pages."
                shape="square"
                value={form.photoUrl}
                onChange={(dataUrl) => updateField("photoUrl", dataUrl)}
                onFileSelected={setProfilePhotoFile}
                emptyIcon={<Icon name="paw" className="h-5 w-5" />}
              />

              <ImageUploadField
                label="Cover photo"
                helper="A warm wide banner for the public profile."
                value={form.coverUrl}
                onChange={(dataUrl) => {
                  updateField("coverUrl", dataUrl);
                  if (dataUrl !== form.coverUrl) {
                    updateField("coverPositionX", 50);
                    updateField("coverPositionY", 50);
                  }
                }}
                onFileSelected={setCoverPhotoFile}
              />
            </div>

            <section
              aria-labelledby="cover-preview-heading"
              className="grid min-w-0 gap-4 rounded-[1.5rem] border border-pet-border bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3
                    className="text-base font-black text-pet-ink"
                    id="cover-preview-heading"
                  >
                    Cover preview &amp; position
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                    Adjust the same cover view that appears on the Public Share
                    Profile.
                  </p>
                </div>
                {form.coverUrl ? (
                  <button
                    className="min-h-11 rounded-full border border-pet-border bg-white px-4 text-xs font-black text-pet-ink transition hover:border-pet-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
                    onClick={() => {
                      updateField("coverPositionX", 50);
                      updateField("coverPositionY", 50);
                    }}
                    type="button"
                  >
                    Reset to Centre
                  </button>
                ) : null}
              </div>

              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] lg:items-start">
                <div className="brand-soft-card min-w-0 overflow-hidden rounded-[1.5rem]">
                  <CoverPhoto
                    alt={`${form.name || "Your pet"} public profile cover preview`}
                    fallbackStyle={{ background: selectedTheme.gradients.cover }}
                    onCropMetricsChange={setCoverCropMetrics}
                    positionX={form.coverPositionX}
                    positionY={form.coverPositionY}
                    src={form.coverUrl}
                  />
                  <div className="px-5 pb-5 text-center">
                    <div className="-mt-12 flex justify-center">
                      <span className="rounded-full border-4 border-white">
                        <PetAvatar pet={previewPet} size="lg" />
                      </span>
                    </div>
                    <p className="mt-3 font-black text-pet-ink">
                      {form.name || "Your pet"}
                    </p>
                    <p className="mt-1 text-sm text-pet-muted">
                      Public Share Profile preview
                    </p>
                  </div>
                </div>

                {form.coverUrl ? (
                  <fieldset className="grid min-w-0 gap-4 rounded-[1.25rem] border border-pet-border bg-pet-cream p-4">
                    <legend className="px-1 text-sm font-black text-pet-ink">
                      Adjust cover position
                    </legend>
                    <p className="text-xs font-semibold leading-5 text-pet-muted">
                      Move the focus until your pet sits naturally in the banner.
                    </p>
                    <CoverPositionControl
                      axis="Horizontal"
                      description={getCoverAxisDescription(
                        coverCropMetrics,
                        "Horizontal"
                      )}
                      disabled={!coverCropMetrics?.canMoveX}
                      onChange={(value) => updateField("coverPositionX", value)}
                      value={form.coverPositionX}
                    />
                    <CoverPositionControl
                      axis="Vertical"
                      description={getCoverAxisDescription(
                        coverCropMetrics,
                        "Vertical"
                      )}
                      disabled={!coverCropMetrics?.canMoveY}
                      onChange={(value) => updateField("coverPositionY", value)}
                      value={form.coverPositionY}
                    />
                    {hasUnsavedCoverPositionChange ? (
                      <p className="rounded-[1rem] bg-[#fffbea] px-3 py-2 text-xs font-bold leading-5 text-[#856a00]">
                        Save changes to keep this cover position.
                      </p>
                    ) : null}
                  </fieldset>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-pet-border bg-pet-cream p-4 text-sm font-semibold leading-6 text-pet-muted">
                    Add a cover photo to adjust its horizontal and vertical
                    position.
                  </div>
                )}
              </div>
            </section>
          </div>
        </FormSection>
      ) : null}

      {tab === "theme" ? (
        <FormSection
          title="Profile Theme"
          description={`Applied to both ${
            form.name || "your pet"
          }'s Public Share Profile and Safety Profile.`}
        >
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {petProfileThemes.map((theme) => (
                <ThemeOptionCard
                  key={theme.id}
                  name={form.name || "Your pet"}
                  onSelect={() => updateField("profileTheme", theme.id)}
                  selected={form.profileTheme === theme.id}
                  theme={theme}
                />
              ))}
            </div>

            {hasUnsavedThemeChange ? (
              <p className="rounded-[1rem] bg-[#fffbea] px-4 py-3 text-xs font-bold text-[#856a00]">
                Save changes to update {form.name || "your pet"}&apos;s public
                profile and Safety Profile.
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
          description="Share your pet's profile, photos, memories, and life timeline with friends and family."
        >
          <div className="grid min-w-0 gap-4">
            {mode === "edit" && currentPet ? (
            <div className="rounded-[1.5rem] border border-pet-border bg-white p-5">
              <fieldset aria-describedby="profile-status-help profile-status-pending">
                <legend className="text-lg font-black text-pet-ink">
                  Profile status &amp; visibility
                </legend>
                <p className="mt-2 text-sm font-bold text-pet-ink">
                  Currently {currentPet.lifecycleStatus}
                </p>
                <p id="profile-status-help" className="mt-1 text-sm leading-6 text-pet-muted">
                  Choose the profile state you want, then use Save Changes to apply it.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {lifecycleOptions.map((option) => {
                    const selected = form.lifecycleStatus === option.status;
                    const current = currentPet.lifecycleStatus === option.status;
                    const disabled =
                      currentPet.lifecycleStatus === "Archived" &&
                      option.status === "Memorial";

                    return (
                      <label
                        className={`relative flex min-h-36 cursor-pointer flex-col rounded-[1.25rem] border p-4 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pet-teal ${
                          selected
                            ? "border-pet-teal bg-[#e8f3ff]"
                            : "border-pet-border bg-white hover:bg-pet-cream"
                        } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
                        key={option.status}
                      >
                        <input
                          checked={selected}
                          className="sr-only"
                          disabled={disabled}
                          name="lifecycleStatus"
                          onChange={() => updateField("lifecycleStatus", option.status)}
                          type="radio"
                          value={option.status}
                        />
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-pet-ink">{option.status}</span>
                          {current ? (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide text-pet-teal">
                              Current
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-3 text-xs font-semibold leading-5 text-pet-muted">
                          {option.description}
                        </span>
                        {disabled ? (
                          <span className="mt-auto pt-2 text-xs font-bold text-pet-muted">
                            Restore to Active first.
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>

                {form.lifecycleStatus !== currentPet.lifecycleStatus ? (
                  <p
                    aria-live="polite"
                    className="mt-4 rounded-[1rem] bg-[#fffbea] px-4 py-3 text-xs font-bold text-[#856a00]"
                    id="profile-status-pending"
                    role="status"
                  >
                    Status will change to {form.lifecycleStatus} when you save.
                  </p>
                ) : (
                  <span id="profile-status-pending" />
                )}
              </fieldset>

              {form.lifecycleStatus === "Memorial" ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <Field
                    error={errors.passedAwayDate}
                    helper="Optional. Share this only if it feels right for you."
                    label="Date of passing, optional"
                  >
                    <DateInput
                      onChange={(event) =>
                        updateField("passedAwayDate", event.target.value)
                      }
                      value={form.passedAwayDate}
                    />
                  </Field>
                  <Field
                    error={errors.memorialMessage}
                    helper="A gentle note for friends and family. Maximum 240 characters."
                    label="Memorial message, optional"
                  >
                    <textarea
                      className="brand-input min-h-28"
                      maxLength={240}
                      onChange={(event) =>
                        updateField("memorialMessage", event.target.value)
                      }
                      placeholder={`${form.name || "This pet"} is lovingly remembered.`}
                      value={form.memorialMessage}
                    />
                  </Field>
                  <div className="lg:col-span-2">
                    <Checkbox
                      checked={form.showMemorialOnPublicProfile}
                      label="Show this memorial on the public profile"
                      onChange={(value) =>
                        updateField("showMemorialOnPublicProfile", value)
                      }
                    />
                  </div>
                </div>
              ) : null}

            </div>
            ) : null}

            <div className="rounded-[1.5rem] border border-pet-border bg-white p-5">
              <ToggleRow
                checked={form.publicProfileEnabled}
                helper="When off, the shareable page is hidden. Your Safety Profile stays available for finders."
                label="Public Profile enabled"
                onChange={(value) => updateField("publicProfileEnabled", value)}
              />
              {!form.publicProfileEnabled ? (
                <p
                  className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted"
                  role="status"
                >
                  The Public Profile page is hidden from visitors. This does not
                  affect the Safety Profile finders see.
                </p>
              ) : null}
            </div>

            <Field error={errors.adoptionDate} label="Adoption day">
              <DateInput
                onChange={(event) =>
                  updateField("adoptionDate", event.target.value)
                }
                value={form.adoptionDate}
              />
            </Field>

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
            </PrivacyGroup>

            <details className="rounded-[1.5rem] border border-pet-border bg-white">
              <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-pet-muted select-none">
                Advanced
              </summary>
              <div className="grid gap-3 px-5 pb-5">
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
                <div className="grid gap-1">
                  <Checkbox
                    checked={form.showAllergiesOnPublicProfile}
                    label="Show allergies on Public Profile"
                    onChange={(value) =>
                      updateField("showAllergiesOnPublicProfile", value)
                    }
                  />
                  <p className="pl-9 text-xs font-semibold leading-5 text-pet-muted">
                    Allergies are always shown on the Safety Profile for pet
                    safety. Choose whether to also show them on the regular
                    Public Profile.
                  </p>
                </div>
                <Checkbox
                  checked={form.showHealthSummary}
                  label="Allow public health and care details"
                  onChange={(value) => updateField("showHealthSummary", value)}
                />
              </div>
            </details>

            {shareProfilePet ? (
              <ShareProfileLink
                copyButtonFullWidth
                path={shareProfilePet.publicProfilePath}
                petName={shareProfilePet.name}
                shareVersion={getPublicProfileShareVersion(shareProfilePet)}
              />
            ) : (
              <div className="brand-card min-w-0 rounded-[1.5rem] p-5">
                <p className="text-sm font-semibold leading-6 text-pet-muted">
                  Your public profile link will be ready right after you save
                  this pet.
                </p>
              </div>
            )}

            <details
              className="rounded-[1.5rem] border border-pet-border bg-white"
              open={Boolean(errors.slug) || undefined}
            >
              <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-pet-muted select-none">
                Customize link
              </summary>
              <div className="grid gap-3 px-5 pb-5">
                <Field
                  error={errors.slug}
                  helper="This becomes the public page address."
                  label="Custom public profile link name"
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
            </details>
          </div>
        </FormSection>
      ) : null}

      {tab === "contact" ? (
        <FormSection
          title="Contact & Safety"
          description="Help finders contact you if your pet is lost. Your full address is never shown."
        >
          <div className="grid min-w-0 gap-4">
            {mode === "edit" && currentPet ? (
              <div className="scroll-mt-24" ref={contactLostModeRef}>
                <LostModeControl
                  onPetChange={setCurrentPet}
                  pet={currentPet}
                  variant="compact"
                />
              </div>
            ) : null}

            <div className="rounded-[1.5rem] border border-pet-border bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-pet-ink">
                  Safety Profile
                </h2>
                <Badge tone={safetyStatusView.tone}>
                  {safetyStatusView.label}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                Help finders contact you if your pet is lost. This profile can
                be opened through a QR code, NFC tag, or direct link.
              </p>
              <div className="mt-4">
                <ToggleRow
                  checked={form.qrSafetyEnabled}
                  helper="When off, the Safety Profile stops showing your contact details to finders."
                  label="Safety Profile enabled"
                  onChange={(value) => updateField("qrSafetyEnabled", value)}
                />
              </div>
              {safetyStatusView.status === "contact-update-needed" ? (
                <section
                  aria-labelledby="safety-contact-warning-title"
                  className="mt-3 rounded-[1.25rem] border border-[#f0dfae] bg-[#fffbea] p-4"
                  role="status"
                >
                  <h3
                    className="text-sm font-black text-[#6b5500]"
                    id="safety-contact-warning-title"
                  >
                    Update your contact details
                  </h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#856a00]">
                    Add a phone or WhatsApp number so finders can contact you
                    if your pet goes missing. Then make sure WhatsApp or phone
                    call is turned on under &quot;What finders can see&quot;.
                  </p>
                  <div className="mt-3">
                    {form.useOwnerDefaults ? (
                      <CTAButton
                        href={ownerRoutes.settingsOwnerContact}
                        icon="phone"
                        variant="secondary"
                      >
                        Update Contact
                      </CTAButton>
                    ) : (
                      <CTAButton
                        icon="phone"
                        onClick={focusPetContactSection}
                        variant="secondary"
                      >
                        Update Contact
                      </CTAButton>
                    )}
                  </div>
                </section>
              ) : null}
              {safetyStatusView.status === "off" ? (
                <p
                  className="mt-3 rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold leading-5 text-pet-muted"
                  role="status"
                >
                  {safetyStatusView.description}
                </p>
              ) : null}
              <div className="mt-4">
                {mode === "edit" && currentPet && finderFullUrl ? (
                  <UrlDisplay label="Safety Profile link" url={finderFullUrl} />
                ) : mode === "create" ? (
                  <p className="rounded-[1rem] bg-pet-cream px-4 py-3 text-xs font-bold text-pet-muted">
                    The Safety Profile link will be ready after you save this
                    pet.
                  </p>
                ) : null}
              </div>
            </div>

            <div
              className="scroll-mt-24 rounded-[1.5rem] border border-pet-border bg-white p-5"
              ref={petContactSectionRef}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black text-pet-ink">
                      Emergency Contact
                    </h2>
                    <Badge tone={form.useOwnerDefaults ? "teal" : "warm"}>
                      {form.useOwnerDefaults
                        ? "Owner defaults"
                        : "Custom for this pet"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-pet-muted">
                    {form.useOwnerDefaults
                      ? "Using your owner contact details from Owner Profile & Contact."
                      : `Using different contact details for ${
                          form.name || "this pet"
                        }.`}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-pet-muted">
                    These settings only apply to {form.name || "this pet"}.
                    Owner defaults are managed in Owner Profile &amp; Contact.
                  </p>
                </div>
                {form.useOwnerDefaults ? (
                  <CTAButton
                    href={ownerRoutes.settingsOwnerContact}
                    icon="phone"
                    variant="outline"
                  >
                    Edit contact details
                  </CTAButton>
                ) : (
                  <CTAButton href={ownerRoutes.settings} variant="outline">
                    Owner Profile &amp; Contact
                  </CTAButton>
                )}
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
                  helper="Optional. Used for the call button on the Safety Profile."
                  label="Phone number"
                  onChange={(value) => updateField("phone", value)}
                  value={form.phone}
                />
              </div>
            ) : null}

            <div className="min-w-0 rounded-[1.5rem] border border-pet-border bg-white p-5">
              <p className="text-sm font-black text-pet-ink">
                What finders can see
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-pet-muted">
                These settings only affect {form.name || "this pet"}&apos;s
                Safety Profile.
              </p>
              <div className="mt-3 grid min-w-0 gap-2">
                <ToggleRow
                  checked={form.showWhatsapp}
                  label="WhatsApp"
                  onChange={(value) => updateField("showWhatsapp", value)}
                />
                <ToggleRow
                  checked={form.showPhone}
                  label="Phone call"
                  onChange={(value) => updateField("showPhone", value)}
                />
                <ToggleRow
                  checked={form.showGeneralArea}
                  label="General area"
                  onChange={(value) => updateField("showGeneralArea", value)}
                />
                <ToggleRow
                  checked={form.showEmergencyNote}
                  label="Emergency note"
                  onChange={(value) => updateField("showEmergencyNote", value)}
                />
              </div>
            </div>

            <div className="min-w-0 rounded-[1.5rem] border border-pet-border bg-white p-5">
              <p className="text-sm font-black text-pet-ink">
                Safety information
              </p>
              <div className="mt-3 grid min-w-0 gap-4">
                <TagListInput
                  deferSuggestions
                  error={errors.allergies}
                  helper="Add anything finders, carers, or vets should avoid."
                  label="Allergies"
                  max={MAX_ALLERGIES}
                  maxLength={MAX_ALLERGY_LENGTH}
                  onChange={(values) => updateField("allergies", values)}
                  placeholder="Add a known allergy"
                  suggestions={allergySuggestions}
                  values={form.allergies}
                />

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
              </div>
            </div>
          </div>
        </FormSection>
      ) : null}

      {/* Shown on the Info tab only so the other edit tabs stay focused on
          their own content instead of repeating these shortcuts. */}
      {mode === "edit" && currentPet && tab === "basic" ? (
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
              Add Moment
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

      {/* Desktop actions: a compact right-aligned row (no full-width card).
          On mobile the sticky bar below handles Save/Cancel. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-end lg:gap-3">
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
              View Safety Profile
            </CTAButton>
          </>
        ) : null}
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
          href={cancelHref}
        >
          Cancel
        </Link>
        <CTAButton disabled={isSubmitting} type="submit" variant="coral">
          {isSubmitting ? "Saving..." : saveLabel}
        </CTAButton>
      </div>

      <MobileFormActionBar
        disabled={isSubmitting}
        pending={isSubmitting}
        primaryLabel={saveLabel}
        secondaryAction={
          <Link
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
            href={cancelHref}
          >
            Cancel
          </Link>
        }
      />

      {statusAction ? (
        <ConfirmDialog
          cancelLabel={getStatusActionCopy(statusAction, form.name).cancelLabel}
          confirmLabel={getStatusActionCopy(statusAction, form.name).confirmLabel}
          destructive={statusAction === "archive"}
          message={getStatusActionCopy(statusAction, form.name).message}
          onCancel={() => setStatusAction(null)}
          onConfirm={() => {
            setStatusAction(null);
            void saveChanges();
          }}
          open={Boolean(statusAction)}
          title={getStatusActionCopy(statusAction, form.name).title}
        />
      ) : null}
    </form>
  );
}

function getStatusActionCopy(
  action: "active" | "memorial" | "archive",
  petName: string
) {
  const name = petName || "this pet";

  if (action === "active") {
    return {
      title: "Restore to Active?",
      message: `This will show ${name} in active pet pages again and use the pet's Safety Profile settings for finder contact actions.`,
      confirmLabel: "Restore to Active",
      cancelLabel: "Keep Current Status",
    };
  }

  if (action === "memorial") {
    return {
      title: "Move this profile to Memorial?",
      message: "This will turn the profile into a gentle place for memories. You can review the memorial details before saving.",
      confirmLabel: "Continue to Memorial",
      cancelLabel: "Cancel",
    };
  }

  if (action === "archive") {
    return {
      title: "Archive this pet profile?",
      message: "This pet will be hidden from your active pet list and public pages. You can restore it later.",
      confirmLabel: "Archive Profile",
      cancelLabel: "Keep Active",
    };
  }

  return { title: "", message: "", confirmLabel: "", cancelLabel: "Cancel" };
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

const DROPDOWN_TRIGGER_CLASS_NAME =
  "brand-input flex min-h-12 items-center justify-between gap-4 text-left";
const DROPDOWN_VALUE_CLASS_NAME = "min-w-0 truncate";
const DROPDOWN_CHEVRON_CLASS_NAME =
  "pointer-events-none h-4 w-4 shrink-0 text-pet-muted transition-transform duration-150";

function PetTypeSelector({
  onChange,
  value,
}: {
  onChange: (value: PetSpecies) => void;
  value: PetSpecies;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = PET_TYPE_OPTIONS.filter((option) =>
    option.toLowerCase().includes(normalizedQuery)
  );
  const options = visibleOptions.length ? visibleOptions : ["Other" as PetSpecies];

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectOption(option: PetSpecies) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={DROPDOWN_TRIGGER_CLASS_NAME}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={DROPDOWN_VALUE_CLASS_NAME}>{value}</span>
        <Icon
          name="chevron"
          className={`${DROPDOWN_CHEVRON_CLASS_NAME} ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-2 shadow-xl shadow-[#0d1b3d]/12">
          <input
            aria-label="Search pet type"
            autoFocus
            className="brand-input min-h-11"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pet type"
            type="search"
            value={query}
          />
          <div className="mt-2 max-h-64 overflow-y-auto pr-1">
            {options.map((option) => {
              const selected = option === value;

              return (
                <button
                  className={`flex min-h-11 w-full items-center justify-between rounded-2xl px-4 py-2 text-left text-sm font-bold transition ${
                    selected
                      ? "bg-[#e8f3ff] text-pet-teal"
                      : "text-pet-ink hover:bg-pet-cream"
                  }`}
                  key={option}
                  onClick={() => selectOption(option)}
                  type="button"
                >
                  <span>{option}</span>
                  {selected ? (
                    <span className="text-xs text-pet-teal">Selected</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getMediaUploadErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `Profile details were saved, but the photo upload needs another try. ${error.message}`;
  }

  return `Profile details were saved, but the photo upload needs another try. ${getFriendlyApiErrorMessage(
    error
  )}`;
}

function isExpiredSessionError(error: unknown) {
  return isApiClientError(error) && error.status === 401;
}

function redirectAfterExpiredSession(
  error: unknown,
  router: { replace: (href: string) => void },
  fallback: string
) {
  if (!isExpiredSessionError(error)) {
    return false;
  }

  logoutOwner();
  router.replace(
    ownerLoginPath(getCurrentLocalDestination(fallback))
  );
  return true;
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
      showAllergiesOnPublicProfile:
        visibility.showAllergiesOnPublicProfile,
    };
  }

  const visibility = mergeVisibility(pet.visibility);
  const contact = getEffectivePetContact(pet, ownerSettings);
  const ageInformationMode = getPetAgeMode(pet);

  return {
    name: pet.name,
    species: pet.species,
    customSpecies: pet.customSpecies ?? "",
    breed: pet.breed,
    gender: pet.gender,
    color: pet.color,
    ageInformationMode,
    birthdayDate:
      ageInformationMode === "ExactBirthday"
        ? parseDisplayDate(pet.birthday)
        : "",
    estimatedBirthYear:
      ageInformationMode === "EstimatedBirthYear" && pet.estimatedBirthYear
        ? String(pet.estimatedBirthYear)
        : "",
    photoUrl: pet.photoUrl ?? "",
    coverUrl: pet.coverUrl ?? "",
    coverPositionX: pet.coverPositionX ?? 50,
    coverPositionY: pet.coverPositionY ?? 50,
    profileTheme: pet.profileTheme ?? "default",
    lifecycleStatus: pet.lifecycleStatus ?? "Active",
    passedAwayDate: parseDisplayDate(pet.memorial?.passedAwayDate ?? ""),
    memorialMessage: pet.memorial?.memorialMessage ?? "",
    showMemorialOnPublicProfile:
      pet.memorial?.showMemorialOnPublicProfile ?? true,
    bio: pet.bio,
    personalityTags: [...pet.personalityTags],
    favoriteFoods: [...pet.favoriteFoods],
    favoriteToys: [...pet.favoriteToys],
    allergies: [...pet.allergies],
    adoptionDate: parseDisplayDate(pet.adoptionDay),
    slug: pet.slug,
    generalArea: contact.generalArea,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    ownerName: contact.ownerDisplayName,
    whatsapp: contact.whatsappNumber,
    phone: contact.phoneNumber,
    useOwnerDefaults: contact.useOwnerDefaults,
    qrSafetyEnabled: pet.qrSafetyEnabled,
    publicProfileEnabled: pet.publicProfileEnabled,
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
    showAllergiesOnPublicProfile:
      visibility.showAllergiesOnPublicProfile,
  };
}

function buildPayload(
  form: FormState,
  ownerSettings: OwnerSettings = defaultOwnerSettings
): PetPayload {
  const name = form.name.trim();
  const birthday =
    form.ageInformationMode === "ExactBirthday" && form.birthdayDate
      ? formatDisplayDate(form.birthdayDate)
      : "Not set";
  const estimatedBirthYear =
    form.ageInformationMode === "EstimatedBirthYear"
      ? Number(form.estimatedBirthYear) || undefined
      : undefined;
  const ageLabel = calculatePetAge({
    birthday,
    estimatedBirthYear,
  }).displayLabel;

  return {
    name,
    slug: slugifyPetSlug(form.slug),
    species: form.species,
    customSpecies:
      form.species === "Other" ? form.customSpecies.trim() : "",
    breed: form.breed.trim() || "Mixed breed",
    gender: form.gender.trim() || "Not set",
    color: form.color.trim() || "Not set",
    ageInformationMode: form.ageInformationMode,
    estimatedBirthYear,
    birthday,
    ageLabel,
    adoptionDay: form.adoptionDate ? formatDisplayDate(form.adoptionDate) : "Not set",
    generalArea:
      form.generalArea.trim() || ownerSettings.defaultGeneralArea || "Malaysia",
    photoInitial: getInitial(name),
    photoTone: form.species === "Cat" ? "mint" : "apricot",
    photoUrl: form.photoUrl,
    coverUrl: form.coverUrl,
    coverPositionX: form.coverPositionX,
    coverPositionY: form.coverPositionY,
    profilePhotoLabel: form.photoUrl ? "Profile photo added" : "",
    coverPhotoLabel: form.coverUrl ? "Cover photo added" : "",
    profileTheme: form.profileTheme,
    lifecycleStatus: form.lifecycleStatus,
    previousLifecycleStatus:
      form.lifecycleStatus === "Memorial" ? "Memorial" : undefined,
    memorial: {
      passedAwayDate: form.passedAwayDate
        ? formatDisplayDate(form.passedAwayDate)
        : "",
      memorialMessage: form.memorialMessage.trim(),
      showMemorialOnPublicProfile: form.showMemorialOnPublicProfile,
    },
    bio:
      form.bio.trim() ||
      `${name} is loved dearly and has a safe profile for family and friends.`,
    personalityTags: normalizeTagList(form.personalityTags, 12),
    // Empty lists are intentional clear operations; omitted fields remain
    // unchanged for partial updates.
    favoriteFoods: normalizeTagList(form.favoriteFoods, 3),
    favoriteToys: normalizeTagList(form.favoriteToys, 3),
    allergies: normalizeTagList(form.allergies, MAX_ALLERGIES),
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
    qrSafetyEnabled: form.qrSafetyEnabled,
    publicProfileEnabled: form.publicProfileEnabled,
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
      showAllergiesOnPublicProfile: form.showAllergiesOnPublicProfile,
    },
  };
}

// A wrapping row of tappable suggestion chips. Suggestions only fill or toggle
// a value — custom input always stays available in the field itself.
// Shared multi-value chip field: removable selected chips, species-aware
// suggestions (a short initial row with "More suggestions"), and custom input.
// Duplicates are blocked case-insensitively and values are trimmed.
const INITIAL_SUGGESTION_COUNT = 6;

function normalizeTagList(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();

    if (!value || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);

    if (result.length >= max) {
      break;
    }
  }

  return result;
}

function TagListInput({
  label,
  values,
  onChange,
  suggestions,
  max,
  placeholder,
  error,
  helper,
  maxLength = 80,
  deferSuggestions = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  max: number;
  placeholder: string;
  error?: string;
  helper?: string;
  maxLength?: number;
  /**
   * When true, suggestion chips stay hidden until the owner focuses the input
   * or asks for them, so small screens are not flooded with chips up front.
   */
  deferSuggestions?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [suggestionsRevealed, setSuggestionsRevealed] = useState(
    !deferSuggestions
  );
  const selectedKeys = new Set(values.map((value) => value.toLowerCase()));
  const canAdd = values.length < max;
  const remainingSuggestions = suggestions.filter(
    (suggestion) => !selectedKeys.has(suggestion.toLowerCase())
  );
  const visibleSuggestions = showAllSuggestions
    ? remainingSuggestions
    : remainingSuggestions.slice(0, INITIAL_SUGGESTION_COUNT);
  const hiddenCount = remainingSuggestions.length - visibleSuggestions.length;

  function addValue(raw: string) {
    const value = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();

    if (!value || !canAdd || selectedKeys.has(value.toLowerCase())) {
      return;
    }

    onChange([...values, value]);
    setDraft("");
  }

  function removeValue(value: string) {
    onChange(values.filter((current) => current !== value));
  }

  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-pet-ink">{label}</span>
        <span className="text-xs font-bold text-pet-muted">
          {values.length}/{max}
        </span>
      </span>

      {helper ? (
        <span className="text-xs font-semibold leading-5 text-pet-muted">
          {helper}
        </span>
      ) : null}

      {values.length ? (
        <div className="flex min-w-0 flex-wrap gap-2">
          {values.map((value) => (
            <button
              aria-label={`Remove ${value}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-pet-teal bg-[#e8f3ff] px-3 py-1.5 text-xs font-bold text-pet-teal transition hover:bg-[#d8edff]"
              key={value}
              onClick={() => removeValue(value)}
              type="button"
            >
              {value}
              <Icon name="plus" className="h-3 w-3 rotate-45" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 gap-2">
        <input
          aria-label={`${label}: add your own`}
          className="brand-input min-w-0 flex-1"
          disabled={!canAdd}
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setSuggestionsRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue(draft);
            }
          }}
          placeholder={canAdd ? placeholder : `Limit of ${max} reached`}
          type="text"
          value={draft}
        />
        <button
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canAdd || !draft.trim()}
          onClick={() => addValue(draft)}
          type="button"
        >
          Add
        </button>
      </div>

      {!suggestionsRevealed && remainingSuggestions.length ? (
        <button
          aria-expanded={false}
          className="inline-flex min-h-9 items-center self-start rounded-full px-3 py-1.5 text-xs font-bold text-pet-teal transition hover:underline"
          onClick={() => setSuggestionsRevealed(true)}
          type="button"
        >
          Show suggestions ({remainingSuggestions.length})
        </button>
      ) : null}

      {suggestionsRevealed && visibleSuggestions.length ? (
        <div aria-label={`Suggested ${label.toLowerCase()}`} role="group">
          <div className="flex min-w-0 flex-wrap gap-2">
            {visibleSuggestions.map((option) => (
              <button
                className="inline-flex min-h-9 items-center rounded-full border border-pet-border bg-white px-3 py-1.5 text-xs font-bold text-pet-muted transition hover:border-pet-teal hover:text-pet-teal disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAdd}
                key={option}
                onClick={() => addValue(option)}
                type="button"
              >
                {option}
              </button>
            ))}
            {hiddenCount > 0 ? (
              <button
                className="inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-xs font-bold text-pet-teal transition hover:underline"
                onClick={() => setShowAllSuggestions(true)}
                type="button"
              >
                More suggestions ({hiddenCount})
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <span className="text-xs font-bold text-[#a63c2e]">{error}</span>
      ) : null}
    </div>
  );
}

// Single segmented control for gender. A legacy custom value (e.g. "Male
// (neutered)") keeps its saved text and highlights the matching option until
// the owner picks one.
function GenderSegmentedControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = value.trim().toLowerCase();

  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-full border border-pet-border bg-white p-1"
      role="radiogroup"
      aria-label="Gender"
    >
      {(["Male", "Female", "Unknown"] as const).map((option) => {
        const selected =
          normalized === option.toLowerCase() ||
          (option !== "Unknown" && normalized.startsWith(option.toLowerCase()));

        return (
          <button
            aria-checked={selected}
            className={`min-h-10 rounded-full px-2 text-sm font-bold transition ${
              selected
                ? "bg-[#e8f3ff] text-pet-teal"
                : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
            }`}
            key={option}
            onClick={() => onChange(option)}
            role="radio"
            type="button"
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// Searchable breed dropdown (same interaction and chevron as Pet Type).
// Always offers Mixed breed, Unknown, and Other; Other reveals custom input.
function BreedSelector({
  breeds,
  value,
  onChange,
}: {
  breeds: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const option of [...breeds, "Mixed breed", "Unknown", "Other"]) {
      const key = option.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(option);
      }
    }

    return merged;
  }, [breeds]);
  // Custom mode: explicit "Other" selection, or an existing saved breed that
  // is not one of the offered options.
  const [customMode, setCustomMode] = useState(
    () => Boolean(value) && !options.some((option) => option === value)
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = options.filter((option) =>
    option.toLowerCase().includes(normalizedQuery)
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectOption(option: string) {
    if (option === "Other") {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(option);
    }

    setQuery("");
    setOpen(false);
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="relative" ref={wrapperRef}>
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          className={DROPDOWN_TRIGGER_CLASS_NAME}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span
            className={`${DROPDOWN_VALUE_CLASS_NAME} ${
              value || customMode ? "" : "text-pet-muted"
            }`}
          >
            {customMode ? "Other" : value || "Select breed"}
          </span>
          <Icon
            name="chevron"
            className={`${DROPDOWN_CHEVRON_CLASS_NAME} ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-2 shadow-xl shadow-[#0d1b3d]/12">
            <input
              aria-label="Search breed"
              autoFocus
              className="brand-input min-h-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search breed"
              type="search"
              value={query}
            />
            <div className="mt-2 max-h-64 overflow-y-auto pr-1">
              {(visibleOptions.length ? visibleOptions : ["Other"]).map(
                (option) => {
                  const selected = customMode
                    ? option === "Other"
                    : option === value;

                  return (
                    <button
                      className={`flex min-h-11 w-full items-center justify-between rounded-2xl px-4 py-2 text-left text-sm font-bold transition ${
                        selected
                          ? "bg-[#e8f3ff] text-pet-teal"
                          : "text-pet-ink hover:bg-pet-cream"
                      }`}
                      key={option}
                      onClick={() => selectOption(option)}
                      type="button"
                    >
                      <span>{option}</span>
                      {selected ? (
                        <span className="text-xs text-pet-teal">Selected</span>
                      ) : null}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        ) : null}
      </div>

      {customMode ? (
        <input
          aria-label="Enter breed"
          className="brand-input"
          maxLength={80}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter breed"
          type="text"
          value={value}
        />
      ) : null}
    </div>
  );
}

// Bio starter templates in a bottom sheet, opened only on request so the main
// form stays compact. Selecting one fills the textarea with editable text.
function BioTemplateSheet({
  open,
  petName,
  onPick,
  onClose,
}: {
  open: boolean;
  petName: string;
  onPick: (template: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-label="Bio starters"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="Close bio starters"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="relative w-full max-w-lg rounded-t-[2rem] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-pet-ink">
              Need a starting point?
            </h2>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              Tap one and edit it to match your pet.
            </p>
          </div>
          <button
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pet-cream text-pet-muted transition hover:text-pet-ink"
            onClick={onClose}
            type="button"
          >
            <Icon name="plus" className="h-5 w-5 rotate-45" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {getBioTemplates(petName).map((template) => (
            <button
              className="rounded-[1.25rem] border border-pet-border bg-pet-cream px-4 py-3 text-left text-sm font-semibold leading-6 text-pet-ink transition hover:border-pet-teal hover:bg-white"
              key={template}
              onClick={() => onPick(template)}
              type="button"
            >
              {template}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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

function CoverPositionControl({
  axis,
  description,
  disabled,
  onChange,
  value,
}: {
  axis: "Horizontal" | "Vertical";
  description?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="flex items-center justify-between gap-3 text-xs font-bold text-pet-ink">
        {axis} position
        <span className="text-pet-muted">{value}%</span>
      </span>
      <input
        aria-label={`${axis} cover position`}
        className="w-full accent-pet-teal disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
      {description ? (
        <span className="text-xs font-semibold leading-5 text-pet-muted">
          {description}
        </span>
      ) : null}
    </label>
  );
}

function getCoverAxisDescription(
  metrics: CoverCropMetrics | null,
  axis: "Horizontal" | "Vertical"
) {
  if (!metrics) {
    return "Checking how this photo fits in the cover area.";
  }

  const canMove = axis === "Horizontal" ? metrics.canMoveX : metrics.canMoveY;
  return canMove
    ? undefined
    : `This photo already fits ${axis.toLowerCase()}ly in the cover area.`;
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

// Accessible switch row: one full-width tappable row per setting, so the
// mobile layout stays single-column and touch-friendly. Status is conveyed by
// the switch state text, never by colour alone.
function ToggleRow({
  checked,
  label,
  helper,
  onChange,
}: {
  checked: boolean;
  label: string;
  helper?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-2xl bg-pet-cream p-4 text-left transition hover:bg-[#f4ecdf]"
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-pet-ink">{label}</span>
        {helper ? (
          <span className="mt-0.5 block text-xs font-semibold leading-5 text-pet-muted">
            {helper}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-pet-teal" : "bg-[#cfd6e4]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
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
    showAllergiesOnPublicProfile: false,
    ...visibility,
  };
}
