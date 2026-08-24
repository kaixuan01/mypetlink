"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { MobileFormActionBar } from "@/components/portal/MobileFormActionBar";
import { PetCreationSuccess } from "@/components/portal/PetCreationSuccess";
import { CTAButton } from "@/components/ui/CTAButton";
import { AppearanceSection } from "@/components/portal/petForm/AppearanceSection";
import { BasicInfoSection } from "@/components/portal/petForm/BasicInfoSection";
import { ContactSafetySection } from "@/components/portal/petForm/ContactSafetySection";
import { CreatePetDetailsSection } from "@/components/portal/petForm/CreatePetDetailsSection";
import {
  getInitial,
  normalizeTagList,
} from "@/components/portal/petForm/PetFormControls";
import type {
  FormErrors,
  FormState,
} from "@/components/portal/petForm/PetFormTypes";
import { SharingPrivacySection } from "@/components/portal/petForm/SharingPrivacySection";
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import { getPetProfileTheme } from "@/lib/petProfileThemes";
import type { CoverCropMetrics } from "@/lib/coverCrop";
import {
  defaultOwnerSettings,
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import {
  applyPetAgeMode,
  calculatePetAge,
  getPetAgeMode,
  MINIMUM_PET_BIRTH_YEAR,
  type PetAgeMode,
} from "@/lib/petAge";
import {
  mergeConservativePetVisibility,
  newPetVisibilityDefaults,
} from "@/lib/petVisibility";
import { getPetSuggestions } from "@/lib/petSuggestions";
import { getSafetyProfileStatusView } from "@/lib/safetyProfile";
import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
  smartTagsEnabled,
} from "@/lib/features";
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
import { getOwnerProfileSettings } from "@/services/ownerProfileService";
import type {
  Pet,
  PetPayload,
  PetSpecies,
} from "@/types";

export type { FormState } from "@/components/portal/petForm/PetFormTypes";

type PetProfileFormProps = {
  mode: "create" | "edit";
  initialPet?: Pet;
  returnToSmartTagOrder?: boolean;
};


function toOwnerVisibilityFormState(visibility: Pet["visibility"]) {
  return {
    showOwnerName: visibility.showOwnerName,
    showGeneralArea: visibility.showGeneralArea,
    showWhatsapp: visibility.showWhatsapp,
    showPhone: visibility.showPhone,
    showEmergencyNote: visibility.showEmergencyNote,
    showCareBadges: visibility.showCareBadges,
    showMoments: visibility.showMoments,
    showTimeline: visibility.showTimeline,
    showBirthdayOnTimeline: visibility.showBirthdayOnTimeline,
    showAdoptionDayOnTimeline: false,
    showAllergiesOnPublicProfile: visibility.showAllergiesOnPublicProfile,
  };
}

type EditTab = "basic" | "appearance" | "public" | "contact";

// Former tab ids that may still arrive via saved links or login redirects.
const legacyEditTabAliases: Record<string, EditTab> = {
  photos: "appearance",
  theme: "appearance",
};
type EditPetLoadState = "checking" | "ready" | "not-found" | "error";

const editTabs: (SegmentedTab & { id: EditTab })[] = [
  { id: "basic", label: "Basic Info", mobileLabel: "Info" },
  { id: "appearance", label: "Appearance", mobileLabel: "Style" },
  { id: "public", label: "Sharing & Privacy", mobileLabel: "Sharing" },
  { id: "contact", label: "Contact & Safety", mobileLabel: "Safety" },
];

const MAX_ALLERGIES = 8;

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
  photoUrl: "appearance",
  coverUrl: "appearance",
  coverPositionX: "appearance",
  coverPositionY: "appearance",
  profileTheme: "appearance",
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
  showOwnerName: "contact",
  showCareBadges: "public",
  showMoments: "public",
  showTimeline: "public",
  showBirthdayOnTimeline: "public",
  showAdoptionDayOnTimeline: "public",
  showAllergiesOnPublicProfile: "contact",
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
  ...toOwnerVisibilityFormState(newPetVisibilityDefaults),
};

export function PetProfileForm({
  mode,
  initialPet,
  returnToSmartTagOrder = false,
}: PetProfileFormProps) {
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
  const [creationWarning, setCreationWarning] = useState("");
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
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const [tab, setTab] = useState<EditTab>("basic");
  const [bioSheetOpen, setBioSheetOpen] = useState(false);
  const contactLostModeRef = useRef<HTMLDivElement | null>(null);
  const petContactSectionRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const createStartedRef = useRef(false);

  function trackCreateStarted() {
    if (mode !== "create" || createStartedRef.current) return;
    createStartedRef.current = true;
    trackEvent(AnalyticsEvent.PetCreateStarted, { source: "owner_portal" });
  }

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
  // tab with ?tab=contact so owners never land on the wrong section. Retired
  // tab ids (photos, theme) map to their replacement so old links keep
  // working. Applied after hydration so the server-rendered markup stays
  // stable.
  useEffect(() => {
    if (mode !== "edit") {
      return;
    }

    const requested = new URL(window.location.href).searchParams.get("tab");

    if (!requested) {
      return;
    }

    const resolved =
      legacyEditTabAliases[requested] ??
      (editTabs.some((item) => item.id === requested)
        ? (requested as EditTab)
        : null);

    if (resolved) {
      queueMicrotask(() => setTab(resolved));
    }
  }, [mode]);

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
    let active = true;

    async function loadOwnerDefaults() {
      let settings: OwnerSettings;

      try {
        settings = canUseApi()
          ? (await getOwnerProfileSettings()).data
          : readOwnerSettings();
      } catch {
        // readOwnerSettings contains the last successfully loaded API-backed
        // profile, or the same neutral privacy defaults as the backend.
        settings = readOwnerSettings();
      }

      if (!active) {
        return;
      }

      setOwnerSettings(settings);

      if (mode === "create") {
        setForm(toFormState(undefined, settings));
      } else if (initialPet) {
        setForm(toFormState(initialPet, settings));
      }

      setProfilePhotoFile(undefined);
      setCoverPhotoFile(undefined);
    }

    void loadOwnerDefaults();

    return () => {
      active = false;
    };
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
    trackCreateStarted();
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

    if (mode === "create") {
      checkRequired(nextErrors, "name", form.name, "Pet name is required.");
      checkRequired(nextErrors, "species", form.species, "Pet type is required.");

      if (form.species === "Other" && !form.customSpecies.trim()) {
        nextErrors.customSpecies = "Enter your pet type.";
      }

      enforceMax(nextErrors, "name", form.name, 60);
      enforceMax(nextErrors, "customSpecies", form.customSpecies, 60);
      enforceMax(nextErrors, "breed", form.breed, 80);

      validatePetAgeInformation(nextErrors, form);

      return nextErrors;
    }

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

    validatePetAgeInformation(nextErrors, form);

    if (currentPet?.lifecycleStatus === "Memorial") {
      if (form.passedAwayDate) {
        if (!isValidDate(form.passedAwayDate)) {
          nextErrors.passedAwayDate = "Choose a valid date.";
        } else if (new Date(`${form.passedAwayDate}T00:00:00`) > new Date()) {
          nextErrors.passedAwayDate =
            "Passed away date cannot be in the future.";
        }
      }

      enforceMax(nextErrors, "memorialMessage", form.memorialMessage, 240);
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

    return nextErrors;
  }

  function focusCreateField(field: keyof FormState) {
    const fieldContainer = formRef.current?.querySelector<HTMLElement>(
      `[data-create-field="${field}"]`
    );

    fieldContainer?.scrollIntoView?.({
      block: "center",
      behavior: "smooth",
    });
    fieldContainer
      ?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, button, textarea'
      )
      ?.focus({ preventScroll: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = collectErrors();
    setErrors(nextErrors);

    const firstErrorKey = Object.keys(nextErrors)[0] as
      | keyof FormState
      | undefined;

    if (firstErrorKey) {
      if (mode === "create") {
        focusCreateField(firstErrorKey);
      } else {
        setTab(fieldTab[firstErrorKey]);
      }
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
    setCreationWarning("");

    const payload = buildPayload(form, {
      includeVisibility: mode === "edit",
      includeAccessSwitches: mode === "edit",
    });

    try {
      if (mode === "create") {
        const response = await createPet(payload);
        trackEvent(AnalyticsEvent.PetCreated, { source: "owner_portal" });
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

          const petName = savedPet.name.trim() || "Your pet";
          setCreationWarning(
            `${petName} was created, but the photo couldn't be uploaded. You can add it again from Edit Pet.`
          );
        }

        setCurrentPet(savedPet);
        setForm(toFormState(savedPet, ownerSettings));

        if (returnToSmartTagOrder) {
          router.replace(ownerRoutes.tagOrder({ petId: savedPet.id }));
          return;
        }

        setCreatedPet(savedPet);
      } else if (currentPet) {
        const previousPet = currentPet;
        // Lifecycle state is intentionally absent from the ordinary profile
        // update. Dedicated lifecycle endpoints own every state transition.
        const response = await updatePet(
          currentPet.id,
          payload,
          { completeProfile: true }
        );

        if (response.data) {
          let savedPet = response.data;

          if (previousPet.lifecycleStatus === "Memorial") {
            const lifecycleResponse = await updatePetLifecycle(
              currentPet.id,
              "Memorial",
              {
                passedAwayDate: form.passedAwayDate
                  ? formatDisplayDate(form.passedAwayDate)
                  : "",
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
            setSuccess("Changes saved.");
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
      <PetCreationSuccess
        canViewPublicProfile={
          publicProfilesEnabled && createdPet.publicProfileEnabled
        }
        pet={createdPet}
        warning={creationWarning}
      />
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
    lifecycleStatus: currentPet?.lifecycleStatus ?? "Active",
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
    // Bottom clearance on mobile comes from one place only: the action bar's
    // reserved spacer (plus the app shell's bottom-nav padding). Stacking a
    // third padding here previously left a large dead zone under the fixed
    // Save bar.
    <form
      className="mx-auto grid w-full min-w-0 max-w-[1140px] gap-5"
      onChangeCapture={trackCreateStarted}
      onSubmit={handleSubmit}
      ref={formRef}
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

      {mode === "edit" ? (
        <SegmentedTabs
          ariaLabel="Edit pet sections"
          activeId={tab}
          className="[&_button]:px-3"
          onChange={(id) => setTab(id as EditTab)}
          tabs={editTabs}
        />
      ) : null}

      {mode === "create" ? (
        <CreatePetDetailsSection
          breeds={suggestions.breeds}
          errors={errors}
          form={form}
          handleNameChange={handleNameChange}
          setProfilePhotoFile={setProfilePhotoFile}
          updateAgeInformationMode={updateAgeInformationMode}
          updateBirthday={updateBirthday}
          updateField={updateField}
          updateSpecies={updateSpecies}
        />
      ) : null}

      {mode === "edit" && tab === "basic" ? (
        <BasicInfoSection
          bioSheetOpen={bioSheetOpen}
          breeds={suggestions.breeds}
          errors={errors}
          foodSuggestions={suggestions.foods}
          form={form}
          handleNameChange={handleNameChange}
          personalitySuggestions={suggestions.personality}
          setBioSheetOpen={setBioSheetOpen}
          toySuggestions={suggestions.toys}
          updateAgeInformationMode={updateAgeInformationMode}
          updateBirthday={updateBirthday}
          updateField={updateField}
          updateSpecies={updateSpecies}
        />
      ) : null}

      {mode === "edit" && tab === "appearance" ? (
        <AppearanceSection
          coverCropMetrics={coverCropMetrics}
          form={form}
          hasUnsavedCoverPositionChange={Boolean(
            hasUnsavedCoverPositionChange
          )}
          hasUnsavedThemeChange={Boolean(hasUnsavedThemeChange)}
          previewPet={previewPet}
          selectedTheme={selectedTheme}
          setCoverCropMetrics={setCoverCropMetrics}
          setCoverPhotoFile={setCoverPhotoFile}
          setProfilePhotoFile={setProfilePhotoFile}
          updateField={updateField}
        />
      ) : null}

      {mode === "edit" && tab === "public" ? (
        <SharingPrivacySection
          currentPet={currentPet}
          errors={errors}
          form={form}
          mode={mode}
          shareProfilePet={shareProfilePet}
          updateField={updateField}
        />
      ) : null}

      {mode === "edit" && tab === "contact" ? (
        <ContactSafetySection
          contactLostModeRef={contactLostModeRef}
          currentPet={currentPet}
          errors={errors}
          finderFullUrl={finderFullUrl}
          focusPetContactSection={focusPetContactSection}
          form={form}
          mode={mode}
          petContactSectionRef={petContactSectionRef}
          safetyStatusView={safetyStatusView}
          setCurrentPet={setCurrentPet}
          setUseOwnerDefaults={setUseOwnerDefaults}
          updateField={updateField}
        />
      ) : null}

      {/* Shown on the Info tab only so the other edit tabs stay focused on
          their own content instead of repeating these shortcuts. */}
      {mode === "edit" && currentPet && tab === "basic" ? (
        <div className="brand-card flex min-w-0 flex-col gap-3 rounded-[1.5rem] p-5">
          <p className="text-sm font-black text-pet-ink">
            Manage {form.name || currentPet.name}&apos;s content
          </p>
          <p className="-mt-1 text-xs leading-5 text-pet-muted">
            Records and memories are managed on their own pages. Add life
            events such as Adoption Day as a Moment.
          </p>
          <div
            className={`grid min-w-0 gap-3 ${
              smartTagsEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
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
            {smartTagsEnabled ? (
              <CTAButton
                href={ownerRoutes.petTags(currentPet.id)}
                icon="tag"
                variant="outline"
                fullWidth
              >
                Manage Smart Tags
              </CTAButton>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Desktop actions: a compact right-aligned row (no full-width card).
          On mobile the sticky bar below handles Save/Cancel. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-end lg:gap-3">
        {mode === "edit" && currentPet ? (
          <>
            {publicProfilesEnabled && currentPet.publicProfileEnabled ? (
              <CTAButton
                href={profilePath}
                icon="heart"
                variant="secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Public Profile
              </CTAButton>
            ) : null}
            {safetyProfilesOwnerUiEnabled ? (
              <CTAButton
                href={currentPet.qrSafetyPath}
                icon="qr"
                variant="outline"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Safety Profile
              </CTAButton>
            ) : null}
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

    </form>
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

export function toFormState(
  pet?: Pet,
  ownerSettings: OwnerSettings = defaultOwnerSettings
): FormState {
  if (!pet) {
    return {
      ...emptyForm,
      generalArea: ownerSettings.defaultGeneralArea,
      ownerName: ownerSettings.ownerDisplayName,
      whatsapp: ownerSettings.whatsappNumber,
      phone: ownerSettings.phoneNumber,
      useOwnerDefaults: true,
      ...toOwnerVisibilityFormState(newPetVisibilityDefaults),
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
    showAdoptionDayOnTimeline: false,
    showAllergiesOnPublicProfile:
      visibility.showAllergiesOnPublicProfile,
  };
}

export function buildPayload(
  form: FormState,
  options: {
    includeVisibility?: boolean;
    includeAccessSwitches?: boolean;
  } = {}
): PetPayload {
  const name = form.name.trim();
  const birthday =
    form.ageInformationMode === "ExactBirthday" && form.birthdayDate
      ? formatDisplayDate(form.birthdayDate)
      : "";
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
    breed: form.breed.trim(),
    gender: form.gender.trim(),
    color: form.color.trim(),
    ageInformationMode: form.ageInformationMode,
    estimatedBirthYear,
    birthday,
    ageLabel,
    adoptionDay: form.adoptionDate ? formatDisplayDate(form.adoptionDate) : "",
    // Owner defaults are resolved live; do not copy the current default into
    // the pet row and later present it as a pet-specific value.
    generalArea: form.useOwnerDefaults ? "" : form.generalArea.trim(),
    photoInitial: getInitial(name),
    photoTone: form.species === "Cat" ? "mint" : "apricot",
    photoUrl: form.photoUrl,
    coverUrl: form.coverUrl,
    coverPositionX: form.coverPositionX,
    coverPositionY: form.coverPositionY,
    profilePhotoLabel: form.photoUrl ? "Profile photo added" : "",
    coverPhotoLabel: form.coverUrl ? "Cover photo added" : "",
    profileTheme: form.profileTheme,
    bio: form.bio.trim(),
    personalityTags: normalizeTagList(form.personalityTags, 12),
    // Empty lists are intentional clear operations; omitted fields remain
    // unchanged for partial updates.
    favoriteFoods: normalizeTagList(form.favoriteFoods, 3),
    favoriteToys: normalizeTagList(form.favoriteToys, 3),
    allergies: normalizeTagList(form.allergies, MAX_ALLERGIES),
    safetyNote: form.safetyNote.trim(),
    emergencyNote: form.emergencyNote.trim(),
    owner: {
      name: form.ownerName.trim(),
      whatsapp: normalizeStoredPhone(form.whatsapp),
      phone: normalizeStoredPhone(form.phone),
      emergencyContact:
        normalizeStoredPhone(form.phone) || normalizeStoredPhone(form.whatsapp),
    },
    ...(options.includeAccessSwitches !== false
      ? {
          qrSafetyEnabled: form.qrSafetyEnabled,
          publicProfileEnabled: form.publicProfileEnabled,
        }
      : {}),
    contactOverride: form.useOwnerDefaults
      ? { useOwnerDefaults: true }
      : {
          useOwnerDefaults: false,
          ownerDisplayName: form.ownerName.trim(),
          whatsappNumber: normalizeStoredPhone(form.whatsapp),
          phoneNumber: normalizeStoredPhone(form.phone),
          generalArea: form.generalArea.trim(),
        },
    ...(options.includeVisibility !== false
      ? {
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
            showAdoptionDayOnTimeline: false,
            showAllergiesOnPublicProfile:
              form.showAllergiesOnPublicProfile,
          },
        }
      : {}),
  };
}

// A wrapping row of tappable suggestion chips. Suggestions only fill or toggle
// a value — custom input always stays available in the field itself.
// Shared multi-value chip field: removable selected chips, species-aware
// suggestions (a short initial row with "More suggestions"), and custom input.
// Duplicates are blocked case-insensitively and values are trimmed.

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

function validatePetAgeInformation(errors: FormErrors, form: FormState) {
  if (form.ageInformationMode === "ExactBirthday") {
    if (!form.birthdayDate) {
      errors.birthdayDate = "Choose your pet's birthday.";
    } else if (!isValidDate(form.birthdayDate)) {
      errors.birthdayDate = "Choose a valid birthday.";
    } else if (new Date(`${form.birthdayDate}T00:00:00`) > new Date()) {
      errors.birthdayDate = "Birthday cannot be in the future.";
    } else if (
      Number(form.birthdayDate.slice(0, 4)) < MINIMUM_PET_BIRTH_YEAR
    ) {
      errors.birthdayDate = `Birthday must be in ${MINIMUM_PET_BIRTH_YEAR} or later.`;
    }
  }

  if (form.ageInformationMode === "EstimatedBirthYear") {
    const estimatedBirthYear = Number(form.estimatedBirthYear);
    const currentYear = new Date().getUTCFullYear();

    if (!form.estimatedBirthYear) {
      errors.estimatedBirthYear = "Choose an estimated birth year.";
    } else if (
      !Number.isInteger(estimatedBirthYear) ||
      estimatedBirthYear < MINIMUM_PET_BIRTH_YEAR ||
      estimatedBirthYear > currentYear
    ) {
      errors.estimatedBirthYear = `Choose a year from ${MINIMUM_PET_BIRTH_YEAR} to ${currentYear}.`;
    }
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

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);

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
  ].indexOf(`${month.slice(0, 1).toUpperCase()}${month.slice(1, 3).toLowerCase()}`);

  if (monthIndex < 0) {
    return "";
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}


function mergeVisibility(
  visibility?: Partial<Pet["visibility"]>
): Pet["visibility"] {
  return mergeConservativePetVisibility(visibility);
}
