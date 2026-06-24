"use client";

import { useState } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import type { Pet, PublicPetProfile } from "@/types";

type PublicFinderProfileProps = {
  pet: PublicPetProfile;
};

export function PublicFinderProfile({ pet }: PublicFinderProfileProps) {
  const [locationStatus, setLocationStatus] = useState("");
  const visibility = mergeVisibility(pet.visibility);
  const message = encodeURIComponent(
    `Hi ${pet.owner.name}, I found ${pet.name} from the MyPetLink safety profile.`
  );
  const contactPreference = pet.contactPreference ?? "WhatsApp preferred";
  const whatsappNumber = normalizeWhatsappNumber(pet.owner.whatsapp);
  const phoneHref = normalizePhoneHref(pet.owner.phone);
  const whatsappBaseUrl = `https://wa.me/${whatsappNumber}`;

  function openWhatsappWithMessage(text: string) {
    window.location.href = `${whatsappBaseUrl}?text=${encodeURIComponent(text)}`;
  }

  function handleSendFoundLocation() {
    if (!whatsappNumber) {
      return;
    }

    setLocationStatus("Asking your browser for location permission...");

    if (!navigator.geolocation) {
      setLocationStatus(
        "Location is not available here. A WhatsApp message is ready for you to type the location."
      );
      openWhatsappWithMessage(
        `Hi ${pet.owner.name}, I found ${pet.name}. I can describe the found location here.`
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setLocationStatus("Location ready. Opening WhatsApp...");
        openWhatsappWithMessage(
          `Hi ${pet.owner.name}, I found ${pet.name}. Found location: ${mapsUrl}`
        );
      },
      () => {
        setLocationStatus(
          "Location was not shared. A WhatsApp message is ready for you to type the location."
        );
        openWhatsappWithMessage(
          `Hi ${pet.owner.name}, I found ${pet.name}. I can describe the found location here.`
        );
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  }

  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-5 sm:p-6">
      <div className="brand-blue-section rounded-[1.75rem] p-6 text-center">
        <PetAvatar pet={pet} size="xl" />
        <p className="mt-5 text-sm font-bold uppercase text-pet-teal">
          MyPetLink safety page
        </p>
        <h1 className="mt-2 text-4xl font-black text-pet-ink">
          Found {pet.name}?
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
          Please contact the owner directly using one of the options below.
        </p>
        <p className="mt-4 text-sm text-pet-muted">
          {pet.species} - {pet.breed} - {pet.color}
        </p>
        {visibility.showOwnerName ? (
          <p className="mt-2 text-sm font-bold text-pet-ink">
            Owner: {pet.owner.name}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3">
        {visibility.showWhatsapp && whatsappNumber ? (
          <CTAButton
            href={`${whatsappBaseUrl}?text=${message}`}
            icon="phone"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
            className="min-h-14 text-base"
          >
            WhatsApp Owner
          </CTAButton>
        ) : null}
        {visibility.showPhone && phoneHref ? (
          <CTAButton
            href={`tel:${phoneHref}`}
            icon="phone"
            variant="coral"
            fullWidth
            className="min-h-14 text-base"
          >
            Call Owner
          </CTAButton>
        ) : null}
        {visibility.showWhatsapp && whatsappNumber ? (
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
        <div className="rounded-[1.25rem] bg-pet-apricot p-4">
          <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
            <Icon name="shield" className="h-4 w-4 text-pet-coral" />
            Safety note
          </div>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {pet.safetyNote}
          </p>
        </div>
        {visibility.showEmergencyNote ? (
          <div className="rounded-[1.25rem] bg-pet-cream p-4">
            <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon name="record" className="h-4 w-4 text-pet-coral" />
              Emergency note
            </div>
            <p className="mt-2 text-sm leading-6 text-pet-muted">
              {pet.emergencyNote}
            </p>
          </div>
        ) : null}
        {visibility.showGeneralArea ? (
          <div className="rounded-[1.25rem] bg-[#e8f3ff] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
              <Icon name="pin" className="h-4 w-4 text-pet-teal" />
              General area
            </div>
            <p className="mt-2 text-sm text-pet-muted">{pet.generalArea}</p>
          </div>
        ) : null}
        <div className="rounded-[1.25rem] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
            <Icon name="phone" className="h-4 w-4 text-pet-teal" />
            Contact preference
          </div>
          <p className="mt-2 text-sm text-pet-muted">
            {contactPreference}
          </p>
        </div>
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

function normalizeWhatsappNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizePhoneHref(value: string) {
  return value.replace(/[^\d+]/g, "");
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
    showHealthSummary: false,
    ...visibility,
  };
}
