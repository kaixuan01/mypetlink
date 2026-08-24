import type { PetAgeMode } from "@/lib/petAge";
import type { PetProfileThemeId, PetSpecies } from "@/types";

export type FormState = {
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
  showAllergiesOnPublicProfile: boolean;
};

export type FormErrors = Partial<Record<keyof FormState, string>>;

export type UpdateField = <K extends keyof FormState>(
  key: K,
  value: FormState[K]
) => void;
