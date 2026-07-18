import {
  getEffectivePetContact,
  readOwnerSettings,
  type OwnerSettings,
} from "@/lib/ownerSettings";
import {
  isArchivedPet,
  isMemorialPet,
  type PetLifecycleLike,
} from "@/lib/petLifecycle";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import type { Pet } from "@/types";

/**
 * The single source of truth for Safety Profile status.
 *
 * A pet's Safety Profile is the public safety page a finder reaches through a
 * QR code, an NFC tag, or a direct link. Its status never depends on moment,
 * record, or memory counts, and never on whether a physical Smart Tag is
 * linked — tag linkage is reported separately (see lib/tagStatus.ts).
 */
export type SafetyProfileStatus = "active" | "contact-update-needed" | "off";

export type SafetyProfilePetInput = PetLifecycleLike & {
  name?: string;
  generalArea?: string;
  qrSafetyEnabled?: boolean;
  hasUsableSafetyContact?: boolean;
  visibility?: Pick<Pet["visibility"], "showPhone" | "showWhatsapp">;
  owner?: Pick<Pet["owner"], "phone" | "whatsapp"> & { name?: string };
  contactOverride?: Pet["contactOverride"];
};

// A usable number must pass the app's shared phone validation (a full E.164
// value), so empty, whitespace-only, placeholder, or incomplete country-code
// values never count as a reachable contact.
function isUsableNumber(value: string | undefined) {
  if (!value) {
    return false;
  }

  return isValidE164(normalizeStoredPhone(value));
}

/**
 * Resolves the numbers a finder would actually be offered. Pets that follow
 * owner defaults read the live owner settings, so updating the owner's contact
 * once updates every pet that uses the defaults — nothing is copied into pets.
 */
function resolveContactNumbers(
  pet: SafetyProfilePetInput,
  ownerSettings?: OwnerSettings
): { phone: string; whatsapp: string } {
  if (pet.contactOverride && pet.owner) {
    const contact = getEffectivePetContact(
      {
        name: pet.name ?? "",
        generalArea: pet.generalArea ?? "",
        owner: {
          name: pet.owner.name ?? "",
          phone: pet.owner.phone ?? "",
          whatsapp: pet.owner.whatsapp ?? "",
          emergencyContact: "",
        },
        contactOverride: pet.contactOverride,
      },
      ownerSettings ?? readOwnerSettings()
    );

    return { phone: contact.phoneNumber, whatsapp: contact.whatsappNumber };
  }

  return {
    phone: pet.owner?.phone ?? "",
    whatsapp: pet.owner?.whatsapp ?? "",
  };
}

/**
 * True when a finder can currently reach the owner from the Safety Profile:
 * at least one contact method is both switched on and has a valid number.
 * Prefers the server-computed flag when present; otherwise derives it from
 * the pet's visibility switches and resolved contact numbers.
 */
export function hasUsableSafetyContact(
  pet: SafetyProfilePetInput,
  ownerSettings?: OwnerSettings
): boolean {
  if (typeof pet.hasUsableSafetyContact === "boolean") {
    return pet.hasUsableSafetyContact;
  }

  const numbers = resolveContactNumbers(pet, ownerSettings);
  const hasVisibleWhatsapp =
    (pet.visibility?.showWhatsapp ?? false) && isUsableNumber(numbers.whatsapp);
  const hasVisiblePhone =
    (pet.visibility?.showPhone ?? false) && isUsableNumber(numbers.phone);

  return hasVisibleWhatsapp || hasVisiblePhone;
}

/**
 * Derives the owner-facing Safety Profile status:
 * - "off": the owner has switched public access off.
 * - "active": enabled and a finder can reach the owner right now.
 * - "contact-update-needed": enabled, but no finder-visible usable WhatsApp
 *   or phone contact is currently available.
 */
export function getSafetyProfileStatus(
  pet: SafetyProfilePetInput,
  ownerSettings?: OwnerSettings
): SafetyProfileStatus {
  if (pet.qrSafetyEnabled === false) {
    return "off";
  }

  return hasUsableSafetyContact(pet, ownerSettings)
    ? "active"
    : "contact-update-needed";
}

export type SafetyProfileStatusView = {
  status: SafetyProfileStatus | "memorial" | "archived";
  label: string;
  description: string;
  tone: "mint" | "warm" | "soft";
};

/**
 * Status presentation shared by pet cards, headers, and settings screens so
 * every surface shows the same label for the same state. Memorial and archived
 * lifecycles take precedence because their pages behave differently.
 */
export function getSafetyProfileStatusView(
  pet: SafetyProfilePetInput,
  ownerSettings?: OwnerSettings
): SafetyProfileStatusView {
  if (isMemorialPet(pet)) {
    return {
      status: "memorial",
      label: "Memorial Profile",
      description:
        "Finder contact actions are turned off for this memorial profile.",
      tone: "soft",
    };
  }

  if (isArchivedPet(pet)) {
    return {
      status: "archived",
      label: "Archived Profile",
      description: "Restore this profile to use finder contact actions again.",
      tone: "soft",
    };
  }

  const status = getSafetyProfileStatus(pet, ownerSettings);

  if (status === "active") {
    return {
      status,
      label: "Safety Profile Active",
      description:
        "Finders can reach you through this pet's Safety Profile by QR code, NFC tag, or direct link.",
      tone: "mint",
    };
  }

  if (status === "contact-update-needed") {
    return {
      status,
      label: "Contact Update Needed",
      description:
        "Add a phone or WhatsApp number so finders can contact you if your pet goes missing.",
      tone: "warm",
    };
  }

  return {
    status,
    label: "Safety Profile Off",
    description:
      "Public access is switched off. Finders who scan or tap a tag will not see your contact details.",
    tone: "soft",
  };
}
