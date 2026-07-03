import type { PetLifecycleStatus } from "@/types";

export type BackendCurrentUser = {
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    status: string;
  };
  ownerProfile?: {
    id: string;
    ownerDisplayName: string;
    planCode: string;
    planName: string;
  } | null;
  admin?: {
    role: string;
    isActive: boolean;
  } | null;
};

export type BackendAuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: BackendCurrentUser["user"];
  ownerProfile?: BackendCurrentUser["ownerProfile"];
};

export type BackendPetVisibility = {
  showOwnerName: boolean;
  showGeneralArea: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmergencyNote: boolean;
  showCareBadges: boolean;
  showMoments: boolean;
  showTimeline: boolean;
  showBirthdayOnTimeline: boolean;
  showAdoptionDayOnTimeline: boolean;
  showHealthSummary: boolean;
};

export type BackendOwnerProfile = {
  userId: string;
  ownerProfileId: string;
  displayName: string;
  email: string;
  phoneE164?: string | null;
  whatsappE164?: string | null;
  defaultGeneralArea?: string | null;
  defaultContact: {
    displayName: string;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    defaultGeneralArea?: string | null;
  };
  defaultPrivacy: BackendPetVisibility;
  notificationPreferences: Record<string, unknown>;
  planCode: string;
  createdAt: string;
  updatedAt: string;
};

export type BackendPetContact = {
  useOwnerDefaults: boolean;
  ownerDisplayName?: string | null;
  phoneE164?: string | null;
  whatsappE164?: string | null;
  emergencyContactE164?: string | null;
  generalAreaOverride?: string | null;
};

export type BackendPetDetail = {
  id: string;
  name: string;
  species: string;
  customSpecies?: string | null;
  breed?: string | null;
  gender?: string | null;
  color?: string | null;
  birthday?: string | null;
  adoptionDay?: string | null;
  generalArea?: string | null;
  bio?: string | null;
  profileTheme: string;
  lifecycleStatus: PetLifecycleStatus;
  lostModeEnabled: boolean;
  lostLastSeenArea?: string | null;
  lostLastSeenDateTime?: string | null;
  lostMessage?: string | null;
  lostRewardNote?: string | null;
  lostExtraContactInstruction?: string | null;
  memorialPassedAwayDate?: string | null;
  memorialMessage?: string | null;
  showMemorialOnPublicProfile: boolean;
  publicCode: string;
  publicSlug: string;
  safetyCode: string;
  publicProfilePath: string;
  qrSafetyPath: string;
  contact: BackendPetContact;
  visibility: BackendPetVisibility;
  safetyNote?: string | null;
  emergencyNote?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type BackendPetListItem = Pick<
  BackendPetDetail,
  | "id"
  | "name"
  | "species"
  | "customSpecies"
  | "publicSlug"
  | "publicCode"
  | "safetyCode"
  | "lifecycleStatus"
  | "lostModeEnabled"
  | "publicProfilePath"
  | "qrSafetyPath"
  | "createdAt"
  | "updatedAt"
>;

export type BackendPublicPetProfile = {
  publicCode: string;
  publicSlug: string;
  name: string;
  species: string;
  customSpecies?: string | null;
  lifecycleStatus: PetLifecycleStatus;
  lostModeEnabled: boolean;
  ownerDisplayName?: string | null;
  generalArea?: string | null;
  bio?: string | null;
  memorialMessage?: string | null;
  memories: unknown[];
  careRecords: unknown[];
};

export type BackendPublicSafetyPage = {
  safetyCode: string;
  state: "Active" | "LostMode" | "Memorial" | string;
  name: string;
  species: string;
  lifecycleStatus: PetLifecycleStatus;
  lostModeEnabled: boolean;
  generalArea?: string | null;
  safetyNote?: string | null;
  emergencyNote?: string | null;
  lostLastSeenArea?: string | null;
  lostLastSeenDateTime?: string | null;
  lostMessage?: string | null;
  lostRewardNote?: string | null;
  lostExtraContactInstruction?: string | null;
  showFoundLocationAction: boolean;
  contact?: {
    ownerDisplayName?: string | null;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    emergencyContactE164?: string | null;
  } | null;
};
