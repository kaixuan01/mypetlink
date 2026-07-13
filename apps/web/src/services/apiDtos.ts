import type { MomentType, PetLifecycleStatus } from "@/types";

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

export type BackendPetAgeInfo = {
  source: "ExactBirthday" | "EstimatedBirthYear" | "Unknown";
  ageInYears?: number | null;
  displayLabel: string;
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
  estimatedBirthYear?: number | null;
  age?: BackendPetAgeInfo;
  adoptionDay?: string | null;
  generalArea?: string | null;
  bio?: string | null;
  personalityTags?: string[] | null;
  favoriteFood?: string | null;
  favoriteToy?: string | null;
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
  publicProfileVersion?: string | null;
  safetyCode: string;
  publicProfilePath: string;
  qrSafetyPath: string;
  profileMediaId?: string | null;
  coverMediaId?: string | null;
  profilePhotoUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverPositionX?: number | null;
  coverPositionY?: number | null;
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
  | "birthday"
  | "estimatedBirthYear"
  | "age"
  | "publicSlug"
  | "publicCode"
  | "publicProfileVersion"
  | "safetyCode"
  | "lifecycleStatus"
  | "lostModeEnabled"
  | "publicProfilePath"
  | "qrSafetyPath"
  | "profileMediaId"
  | "coverMediaId"
  | "profilePhotoUrl"
  | "coverPhotoUrl"
  | "coverPositionX"
  | "coverPositionY"
  | "personalityTags"
  | "createdAt"
  | "updatedAt"
>;

export type BackendPublicPetProfile = {
  publicCode: string;
  publicSlug: string;
  publicProfileVersion?: string;
  name: string;
  species: string;
  customSpecies?: string | null;
  breed?: string | null;
  gender?: string | null;
  color?: string | null;
  birthday?: string | null;
  estimatedBirthYear?: number | null;
  age?: BackendPetAgeInfo;
  adoptionDay?: string | null;
  lifecycleStatus: PetLifecycleStatus;
  lostModeEnabled: boolean;
  ownerDisplayName?: string | null;
  generalArea?: string | null;
  bio?: string | null;
  personalityTags?: string[] | null;
  favoriteFood?: string | null;
  favoriteToy?: string | null;
  profilePhotoUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverPositionX?: number | null;
  coverPositionY?: number | null;
  memorialMessage?: string | null;
  memories: BackendPublicMemory[];
  careRecords: BackendPublicCareRecord[];
};

export type BackendMemoryVisibility = "Public" | "Private" | "FamilyOnly";

export type BackendMemoryMedia = {
  id: string;
  type: "image" | "video" | string;
  url?: string | null;
  posterUrl?: string | null;
  durationSeconds?: number | null;
  caption?: string | null;
  altText?: string | null;
  sortOrder: number;
};

export type BackendMemory = {
  id: string;
  petId: string;
  title: string;
  date?: string | null;
  type?: MomentType | string | null;
  caption?: string | null;
  visibility: BackendMemoryVisibility;
  showOnPublicProfile: boolean;
  showInLifeTimeline: boolean;
  timelineNote?: string | null;
  media: BackendMemoryMedia[];
  coverMediaId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type BackendPublicMemory = {
  title: string;
  momentDate?: string | null;
  type?: MomentType | string | null;
  caption?: string | null;
  showOnPublicProfile: boolean;
  showInLifeTimeline: boolean;
  timelineNote?: string | null;
  media: BackendMemoryMedia[];
};

export type BackendCareRecordType =
  | "Vaccine"
  | "Deworming"
  | "Grooming"
  | "VetVisit"
  | "Medication"
  | "Allergy"
  | "Surgery"
  | "LabTest"
  | "Other";

export type BackendCareRecordPublicVisibility =
  | "Private"
  | "PublicBadgeOnly"
  | "PublicDetails";

export type BackendCareRecord = {
  id: string;
  petId: string;
  type: BackendCareRecordType;
  title: string;
  date?: string | null;
  dueDate?: string | null;
  provider?: string | null;
  notes?: string | null;
  publicVisibility: BackendCareRecordPublicVisibility;
  derivedStatus: "complete" | "due-soon" | "upcoming" | string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type BackendPublicCareRecord = {
  type: BackendCareRecordType | string;
  title: string;
  recordDate?: string | null;
  dueDate?: string | null;
  provider?: string | null;
  notes?: string | null;
};

export type BackendPublicSafetyPage = {
  safetyCode: string;
  state: "Active" | "LostMode" | "Memorial" | string;
  name: string;
  species: string;
  birthday?: string | null;
  estimatedBirthYear?: number | null;
  age?: BackendPetAgeInfo;
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
  profilePhotoUrl?: string | null;
  coverPhotoUrl?: string | null;
  coverPositionX?: number | null;
  coverPositionY?: number | null;
  showFoundLocationAction: boolean;
  contact?: {
    ownerDisplayName?: string | null;
    phoneE164?: string | null;
    whatsappE164?: string | null;
    emergencyContactE164?: string | null;
  } | null;
};

export type BackendSmartTagStatus =
  | "Unclaimed"
  | "Pending"
  | "Preparing"
  | "Delivered"
  | "Active"
  | "Lost"
  | "Disabled"
  | "Replaced"
  | "Archived";

export type BackendTagType = "QrPetTag" | "QrNfcSmartTag";

export type BackendOrderStatus =
  | "PendingPayment"
  | "PaymentProofSubmitted"
  | "PaymentConfirmed"
  | "PreparingTag"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

export type BackendPaymentStatus =
  | "Pending"
  | "ProofSubmitted"
  | "Confirmed"
  | "Rejected"
  | "Refunded";

export type BackendPaymentProofStatus =
  | "PendingReview"
  | "Approved"
  | "Rejected"
  | "Superseded";

export type BackendSmartTag = {
  id: string;
  tagCode: string;
  petId?: string | null;
  ownerUserId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  petName?: string | null;
  batchNo?: string | null;
  hasNfc: boolean;
  variant: string;
  status: BackendSmartTagStatus;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string | null;
  deliveredAt?: string | null;
  lastScannedAt?: string | null;
  replacementForTagId?: string | null;
  archivedAt?: string | null;
};

export type BackendDeliveryDetails = {
  recipientName: string;
  phoneE164: string;
  addressLine1: string;
  addressLine2?: string | null;
  postcode: string;
  city: string;
  state: string;
  notes?: string | null;
};

export type BackendPaymentProof = {
  id: string;
  orderId: string;
  mediaFileId: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  storageProvider: string;
  paymentMethod: string;
  status: BackendPaymentProofStatus;
  paymentReference?: string | null;
  ownerNote?: string | null;
  rejectionReason?: string | null;
  uploadedAt: string;
  reviewedAt?: string | null;
};

export type BackendOrderTimelineEvent = {
  type: string;
  title: string;
  description?: string | null;
  occurredAt?: string | null;
  statusTone: string;
};

export type BackendTagOrder = {
  id: string;
  orderNumber: string;
  ownerUserId: string;
  petId: string;
  petName?: string | null;
  smartTagId?: string | null;
  smartTagCode?: string | null;
  tagType: BackendTagType;
  variant: string;
  amount: number;
  currency: string;
  deliveryFee: number;
  status: BackendOrderStatus;
  paymentStatus: BackendPaymentStatus;
  replacementForTagId?: string | null;
  delivery: BackendDeliveryDetails;
  paymentSubmittedAt?: string | null;
  paymentConfirmedAt?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentNote?: string | null;
  paymentProofName?: string | null;
  paymentRejectionReason?: string | null;
  trackingStatus?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  paymentProofs: BackendPaymentProof[];
  timeline: BackendOrderTimelineEvent[];
  updatedAt: string;
  createdAt: string;
};

export type BackendCreateTagOrderResult = {
  order: BackendTagOrder;
  tag?: BackendSmartTag | null;
};

export type BackendTagScanPage = {
  state: "active" | "unclaimed" | "pending" | "inactive" | "notFound" | string;
  tagCode: string;
  status?: BackendSmartTagStatus | string | null;
  profile?: BackendPublicSafetyPage | null;
};

export type BackendMediaUploadCategory =
  | "Other"
  | "PetProfilePhoto"
  | "PetCoverPhoto"
  | "MomentImage"
  | "MomentVideo"
  | "VaccinationDocument"
  | "MedicalDocument"
  | "OrderReceipt";

export type BackendMediaFileType = "Image" | "Video" | "Document";

export type BackendMediaUploadStatus =
  | "Pending"
  | "Ready"
  | "Failed"
  | "Deleted";

export type BackendMediaUploadResponse = {
  mediaId: string;
  category: BackendMediaUploadCategory;
  mediaType: BackendMediaFileType;
  status: BackendMediaUploadStatus;
  isPublic: boolean;
  uploadUrl: string;
  method: "PUT";
  requiredHeaders: Record<string, string>;
  expiresAt: string;
};

export type BackendCompleteMediaUploadResponse = {
  mediaId: string;
  category: BackendMediaUploadCategory;
  mediaType: BackendMediaFileType;
  status: BackendMediaUploadStatus;
  isPublic: boolean;
  publicUrl?: string | null;
  completedAt: string;
};

export type BackendMediaDownloadUrlResponse = {
  mediaId: string;
  downloadUrl: string;
  expiresAt: string;
  contentType: string;
  originalFileName: string;
};
