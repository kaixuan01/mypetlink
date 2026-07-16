"use client";

import { useEffect, useState } from "react";
import { LostModeFinderDetails } from "@/components/marketing/LostModeFinderDetails";
import { SafetyAllergies } from "@/components/marketing/SafetyAllergies";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetPhotoViewer } from "@/components/ui/PetPhotoViewer";
import {
  defaultOwnerSettings,
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import { getPetProfileTheme } from "@/lib/petProfileThemes";
import { getPetAgeLabel, getPetTypeLabel } from "@/lib/petDisplay";
import { isActivePet, isArchivedPet, isMemorialPet } from "@/lib/petLifecycle";
import {
  getCallLink,
  getWhatsAppLink,
  normalizeStoredPhone,
} from "@/lib/phone";
import type { Pet, PublicPetProfile } from "@/types";

type QrSafetyPageViewProps = {
  pet: PublicPetProfile;
};

export function QrSafetyPageView({ pet }: QrSafetyPageViewProps) {
  const [locationStatus, setLocationStatus] = useState("");
  const [ownerSettings, setOwnerSettings] =
    useState<OwnerSettings>(defaultOwnerSettings);
  const visibility = mergeVisibility(pet.visibility);
  const theme = getPetProfileTheme(pet.profileTheme);
  const effectiveContact = getEffectivePetContact(
    pet,
    ownerSettings || defaultOwnerSettings
  );
  const ownerDisplayName = visibility.showOwnerName
    ? getPublicOwnerName(effectiveContact.ownerDisplayName, pet.name)
    : `${pet.name}'s owner`;
  const isMemorial = isMemorialPet(pet);
  const isArchived = isArchivedPet(pet);
  const isLostMode = isActivePet(pet) && pet.lostModeEnabled;
  const lostMode = pet.lostMode;
  const introMessage = isLostMode
    ? `Hi, I found ${pet.name}. I saw the MyPetLink Lost Mode notice.`
    : `Hi, I found ${pet.name} from the MyPetLink safety profile.`;
  const whatsappE164 = normalizeStoredPhone(effectiveContact.whatsappNumber);
  const phoneE164 = normalizeStoredPhone(effectiveContact.phoneNumber);
  const safetySummary = [
    getPetTypeLabel(pet),
    [pet.breed, pet.color].find((value) => value && value !== "Not set"),
    getPetAgeLabel(pet),
  ]
    .filter(Boolean)
    .join(" - ");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOwnerSettings(readOwnerSettings());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (isMemorial || isArchived) {
    return (
      <article
        className="brand-card mx-auto max-w-xl rounded-[2rem] p-5 sm:p-6"
        data-profile-theme={theme.id}
        style={{ borderColor: theme.colors.border }}
      >
        <div
          className="brand-blue-section rounded-[1.75rem] p-6 text-center"
          style={{
            background: `linear-gradient(135deg, ${theme.colors.primarySoft}, #ffffff)`,
          }}
        >
          <div className="flex justify-center">
            <PetPhotoViewer pet={pet} size="xl" />
          </div>
          <p
            className="mt-5 text-sm font-bold uppercase text-pet-teal"
            style={{ color: theme.colors.primary }}
          >
            MyPetLink safety page
          </p>
          <h1 className="mt-2 text-3xl font-black text-pet-ink">
            {isMemorial
              ? `${pet.name}'s safety page is no longer active`
              : "This pet profile is archived"}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
            {isMemorial
              ? "This pet is marked as memorial. The profile and memories are kept for remembrance."
              : "This MyPetLink profile is not currently active."}
          </p>
          {isMemorial && pet.publicProfilePath ? (
            <CTAButton
              className="mt-5 min-h-12"
              href={pet.publicProfilePath}
              icon="heart"
              variant="secondary"
              fullWidth
            >
              View Memorial Profile
            </CTAButton>
          ) : null}
        </div>

        <p className="mt-5 rounded-[1.25rem] bg-pet-cream p-4 text-center text-xs font-semibold leading-5 text-pet-muted">
          Emergency finder contact actions are not shown for this profile.
        </p>
      </article>
    );
  }

  function openWhatsappWithMessage(text: string) {
    window.location.assign(getWhatsAppLink(whatsappE164, text));
  }

  function handleSendFoundLocation() {
    if (!whatsappE164) {
      return;
    }

    setLocationStatus("Asking your browser for location permission...");

    if (!navigator.geolocation) {
      setLocationStatus(
        "Location is not available here. A WhatsApp message is ready for you to type the location."
      );
      openWhatsappWithMessage(
        `Hi ${ownerDisplayName}, I found ${pet.name}. I can describe the found location here.`
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setLocationStatus("Location ready. Opening WhatsApp...");
        openWhatsappWithMessage(
          `Hi ${ownerDisplayName}, I found ${pet.name}. Found location: ${mapsUrl}`
        );
      },
      () => {
        setLocationStatus(
          "Location was not shared. A WhatsApp message is ready for you to type the location."
        );
        openWhatsappWithMessage(
          `Hi ${ownerDisplayName}, I found ${pet.name}. I can describe the found location here.`
        );
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  }

  return (
    <article
      className="brand-card mx-auto max-w-xl rounded-[2rem] p-5 sm:p-6"
      data-profile-theme={theme.id}
      style={{ borderColor: theme.colors.border }}
    >
      <div
        className="brand-blue-section rounded-[1.75rem] p-6 text-center"
        style={{
          background: `linear-gradient(135deg, ${theme.colors.primarySoft}, #ffffff)`,
        }}
      >
        <div className="flex justify-center">
          <PetPhotoViewer pet={pet} size="xl" />
        </div>
        <p
          className="mt-5 text-sm font-bold uppercase text-pet-teal"
          style={{ color: theme.colors.primary }}
        >
          MyPetLink safety page
        </p>
        <h1 className="mt-2 text-4xl font-black text-pet-ink">
          {isLostMode ? `${pet.name} is currently missing` : `Found ${pet.name}?`}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
          {isLostMode
            ? "If you have found this pet, please contact the owner immediately."
            : "Please contact the owner directly using one of the options below."}
        </p>
        <p className="mt-4 text-sm text-pet-muted">
          {safetySummary}
        </p>
        {visibility.showOwnerName ? (
          <p className="mt-2 text-sm font-bold text-pet-ink">
            Owner: {ownerDisplayName}
          </p>
        ) : null}
      </div>

      {isLostMode ? (
        <section className="mt-5 rounded-[1.5rem] border-2 border-pet-coral bg-[#fff1ee] p-4">
          <div className="flex items-center gap-2 text-sm font-black text-pet-coral">
            <Icon name="shield" className="h-4 w-4" />
            Lost Mode Active
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-pet-ink">
            {lostMode.lostMessage ||
              `If you have found ${pet.name}, please contact the owner immediately.`}
          </p>
          <LostModeFinderDetails className="mt-3" lostMode={lostMode} />
        </section>
      ) : null}

      {pet.allergies.length ? (
        <div className="mt-5">
          <SafetyAllergies allergies={pet.allergies} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {visibility.showWhatsapp && whatsappE164 ? (
          <CTAButton
            href={getWhatsAppLink(whatsappE164, introMessage)}
            icon="phone"
            target="_blank"
            rel="noopener noreferrer"
            variant={isLostMode ? "coral" : "primary"}
            fullWidth
            className="min-h-14 text-base"
          >
            WhatsApp Owner
          </CTAButton>
        ) : null}
        {visibility.showPhone && phoneE164 ? (
          <CTAButton
            href={getCallLink(phoneE164)}
            icon="phone"
            variant="coral"
            fullWidth
            className="min-h-14 text-base"
          >
            Call Owner
          </CTAButton>
        ) : null}
        {visibility.showWhatsapp && whatsappE164 ? (
          <CTAButton
            icon="pin"
            onClick={handleSendFoundLocation}
            variant="outline"
            fullWidth
            className="min-h-14 bg-white text-base"
          >
            Send Found Location
          </CTAButton>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3">
        <div
          className="rounded-[1.25rem] bg-pet-apricot p-4"
          style={{ background: theme.colors.accentSoft }}
        >
          <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
            <Icon
              name="shield"
              className="h-4 w-4 text-pet-coral"
              style={{ color: theme.colors.accent }}
            />
            Safety note
          </div>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {pet.safetyNote}
          </p>
        </div>
        {visibility.showEmergencyNote ? (
          <div
            className="rounded-[1.25rem] bg-pet-cream p-4"
            style={{ background: theme.colors.surfaceAlt }}
          >
            <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon
                name="record"
                className="h-4 w-4 text-pet-coral"
                style={{ color: theme.colors.accent }}
              />
              Emergency note
            </div>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              {pet.emergencyNote}
            </p>
          </div>
        ) : null}
        {visibility.showGeneralArea ? (
          <div
            className="rounded-[1.25rem] bg-[#e8f3ff] p-4"
            style={{ background: theme.colors.primarySoft }}
          >
            <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon
                name="pin"
                className="h-4 w-4 text-pet-teal"
                style={{ color: theme.colors.primary }}
              />
              General area
            </div>
            <p className="mt-2 text-sm text-pet-muted">
              {effectiveContact.generalArea}
            </p>
          </div>
        ) : null}
      </div>

      {locationStatus ? (
        <p className="mt-3 rounded-[1.25rem] bg-[#e8f3ff] p-4 text-center text-sm font-bold leading-6 text-pet-ink">
          {locationStatus}
        </p>
      ) : null}

      <p className="mt-5 rounded-[1.25rem] bg-pet-cream p-4 text-center text-xs font-semibold leading-5 text-pet-muted">
        For safety, this profile only shows selected public information. The
        owner&apos;s full address is not shared.
      </p>
    </article>
  );
}

function getPublicOwnerName(name: string, petName: string) {
  return name.trim() || `${petName}'s owner`;
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
