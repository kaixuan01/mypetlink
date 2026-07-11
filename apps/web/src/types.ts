import type { PetAgeMode, PetAgeSource } from "@/lib/petAge";

export type ApiResponse<T> = {
  data: T;
  meta: {
    requestId: string;
    source?: "mock" | "api";
    page?: number;
    pageSize?: number;
    total?: number;
  };
};

export type QrStatus = "active" | "draft" | "paused";

export type PetSpecies =
  | "Dog"
  | "Cat"
  | "Rabbit"
  | "Bird"
  | "Hamster"
  | "Guinea Pig"
  | "Fish"
  | "Turtle"
  | "Tortoise"
  | "Reptile"
  | "Snake"
  | "Lizard"
  | "Ferret"
  | "Hedgehog"
  | "Sugar Glider"
  | "Chinchilla"
  | "Horse"
  | "Other";

export type PetProfileThemeId =
  | "default"
  | "mint"
  | "peach"
  | "sky"
  | "lavender";

export type PetLifecycleStatus = "Active" | "Memorial" | "Archived";

export type PetMemorial = {
  passedAwayDate?: string;
  memorialMessage?: string;
  showMemorialOnPublicProfile: boolean;
};

export type PetLostMode = {
  lastSeenArea: string;
  lastSeenDateTime: string;
  lostMessage: string;
  rewardNote: string;
  extraContactInstruction: string;
};

export type Pet = {
  id: string;
  slug: string;
  name: string;
  species: PetSpecies;
  customSpecies?: string;
  breed: string;
  gender: string;
  color: string;
  ageLabel: string;
  ageSource?: PetAgeSource;
  ageInformationMode?: PetAgeMode;
  estimatedBirthYear?: number;
  birthday: string;
  adoptionDay: string;
  createdAt: string;
  updatedAt: string;
  generalArea: string;
  photoInitial: string;
  photoTone: "apricot" | "mint" | "sky";
  profilePhotoLabel: string;
  coverPhotoLabel: string;
  photoUrl: string;
  coverUrl: string;
  profileMediaId?: string;
  coverMediaId?: string;
  profileTheme: PetProfileThemeId;
  lifecycleStatus: PetLifecycleStatus;
  previousLifecycleStatus?: Exclude<PetLifecycleStatus, "Archived">;
  memorial: PetMemorial;
  qrStatus: QrStatus;
  publicCode: string;
  safetyCode: string;
  qrSafetyEnabled: boolean;
  qrSafetyPath: string;
  finderProfileUrl: string;
  publicProfilePath: string;
  bio: string;
  personalityTags: string[];
  favoriteFood: string;
  favoriteToy: string;
  safetyNote: string;
  emergencyNote: string;
  lostModeEnabled: boolean;
  lostMode: PetLostMode;
  owner: {
    name: string;
    phone: string;
    whatsapp: string;
    emergencyContact: string;
  };
  contactOverride?: {
    useOwnerDefaults: boolean;
    ownerDisplayName?: string;
    whatsappNumber?: string;
    phoneNumber?: string;
    generalArea?: string;
  };
  visibility: {
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
  allergies: string[];
  medications: string[];
};

export type PublicPetProfile = Pick<
  Pet,
  | "id"
  | "slug"
  | "name"
  | "species"
  | "customSpecies"
  | "breed"
  | "gender"
  | "color"
  | "ageLabel"
  | "ageSource"
  | "ageInformationMode"
  | "estimatedBirthYear"
  | "birthday"
  | "adoptionDay"
  | "generalArea"
  | "photoInitial"
  | "photoTone"
  | "profilePhotoLabel"
  | "coverPhotoLabel"
  | "photoUrl"
  | "coverUrl"
  | "profileTheme"
  | "lifecycleStatus"
  | "previousLifecycleStatus"
  | "memorial"
  | "publicCode"
  | "safetyCode"
  | "qrSafetyEnabled"
  | "qrSafetyPath"
  | "finderProfileUrl"
  | "publicProfilePath"
  | "bio"
  | "personalityTags"
  | "favoriteFood"
  | "favoriteToy"
  | "safetyNote"
  | "emergencyNote"
  | "lostModeEnabled"
  | "lostMode"
  | "owner"
  | "contactOverride"
  | "visibility"
>;

export type RecordType =
  | "Vaccine"
  | "Deworming"
  | "Grooming"
  | "Vet Visit"
  | "Medication"
  | "Allergy"
  | "Surgery"
  | "Lab Test"
  | "Other";

export type CareRecord = {
  id: string;
  petId: string;
  type: RecordType;
  title: string;
  date: string;
  dueDate?: string;
  provider: string;
  notes: string;
  publicVisibility: "Private" | "Public badge only" | "Public details";
  status: "complete" | "due-soon" | "upcoming";
};

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin";
  joinedAt: string;
  petCount: number;
  status: "active" | "invited" | "paused";
};

export type Plan = {
  id: string;
  tier: "Free" | "Premium";
  name: string;
  price: string;
  billingNote: string;
  description: string;
  features: string[];
  badge?: string;
  comingSoon?: boolean;
  highlighted?: boolean;
};

export type MomentType =
  | "Birthday"
  | "Adoption Day"
  | "First Day Home"
  | "Grooming Day"
  | "Vet Visit"
  | "Vaccination"
  | "Achievement"
  | "Funny Moment"
  | "Training"
  | "Outdoor / Trip"
  | "Memory"
  | "Other";

export type MomentVisibility = "Public" | "Private" | "Family Only";

export type MomentMediaType = "image" | "video";

export type MomentMedia = {
  id: string;
  type: MomentMediaType;
  url?: string;
  caption?: string;
  altText?: string;
  sortOrder: number;
  sourceFile?: File;
};

// Frontend MVP limit for media items per memory. Premium albums can raise this
// when they become available in a later phase.
export const MAX_MOMENT_MEDIA = 5;

export type PetMoment = {
  id: string;
  petId: string;
  title: string;
  date: string;
  type: MomentType;
  caption: string;
  media: MomentMedia[];
  coverMediaId?: string;
  visibility: MomentVisibility;
  showOnPublicProfile: boolean;
  showInLifeTimeline: boolean;
  timelineNote?: string;
};

export type TagType = "MyPetLink QR Pet Tag" | "MyPetLink QR + NFC Smart Tag";

// Tag variant (formerly the physical shape option): Lightweight for cats/small
// pets, Standard for dogs/medium-large pets. Applies to both QR and QR + NFC.
export type TagVariant = "Lightweight" | "Standard";

export type TagStatus =
  | "Unassigned"
  | "Pending"
  | "Preparing"
  | "Delivered"
  | "Active"
  | "Disabled"
  | "Lost"
  | "Replaced"
  | "Archived";

// A physical MyPetLink tag. Identified everywhere by tagCode (MPL-XXXX-XXXX).
// petId/ownerUserId are only set once the tag is activated and bound to a pet.
export type PetTag = {
  id: string;
  tagCode: string;
  petId?: string;
  ownerUserId?: string;
  hasNfc: boolean;
  variant: TagVariant;
  status: TagStatus;
  batchNo?: string;
  orderedDate?: string;
  deliveredDate?: string;
  lastScannedAt?: string;
  activatedAt?: string;
  replacementForTagId?: string;
  isArchived?: boolean;
};

export type DeliveryDetails = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  city: string;
  state: string;
  notes: string;
};

export type OrderStatus =
  | "Draft"
  | "Pending Payment"
  | "Payment Submitted"
  | "Payment Confirmed"
  | "Preparing"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

export type OrderTimelineTone = "completed" | "current" | "warning" | "cancelled";

// One event in the owner order status history (built by the backend from the
// payment proof attempts and order lifecycle timestamps). `timestampLabel` is
// pre-formatted for display (date + time in the viewer's local timezone) and
// is absent when the event has no known timestamp.
export type OrderTimelineEvent = {
  type: string;
  title: string;
  description?: string;
  timestampLabel?: string;
  tone: OrderTimelineTone;
};

// A single payment proof attempt kept for history. Older rejected attempts are
// preserved alongside the latest one so the owner and admin can see the full
// resubmission history.
export type OrderPaymentProof = {
  id: string;
  status: "PendingReview" | "Approved" | "Rejected" | "Superseded";
  originalFileName: string;
  paymentMethod: string;
  paymentReference?: string;
  ownerNote?: string;
  rejectionReason?: string;
  submittedLabel?: string;
  reviewedLabel?: string;
};

export type TagOrder = {
  id: string;
  orderNumber?: string;
  petId: string;
  petName?: string;
  tagType: TagType;
  variant: TagVariant;
  delivery: DeliveryDetails;
  estimatedPrice: string;
  status: OrderStatus;
  orderedDate: string;
  tagId?: string;
  replacementForTagId?: string;
  paymentMethod?: string;
  paymentReference?: string;
  paymentNote?: string;
  paymentProofName?: string;
  paymentSubmittedDate?: string;
  paymentConfirmedDate?: string;
  paymentRejectionReason?: string;
  trackingStatus?: string;
  trackingNumber?: string;
  shippedDate?: string;
  deliveredDate?: string;
  timeline?: OrderTimelineEvent[];
  paymentProofs?: OrderPaymentProof[];
};

export type AdminDashboard = {
  totalUsers: number;
  totalPets: number;
  activeQrProfiles: number;
  newProfilesThisMonth: number;
};

// Outcome of resolving a scanned /t/{tagCode}. The state decides what the
// finder page renders: the pet safety profile for active tags, an activation
// prompt, a safe inactive message, or a branded "tag not found" screen.
export type FinderResult =
  | { state: "active"; tagCode: string; profile: PublicPetProfile }
  | { state: "unassigned"; tagCode: string }
  | { state: "pending"; tagCode: string; status: TagStatus; petId?: string }
  | {
      state: "inactive";
      tagCode: string;
      status: TagStatus;
      isArchived?: boolean;
      reason?: "inactive" | "memorial" | "archived";
      profile?: PublicPetProfile;
    }
  | { state: "not-found"; tagCode: string };

export type PetPayload = Partial<
  Omit<
    Pet,
    | "id"
    | "publicCode"
    | "safetyCode"
    | "qrSafetyPath"
    | "finderProfileUrl"
    | "publicProfilePath"
    | "createdAt"
    | "updatedAt"
    | "allergies"
    | "medications"
  >
>;

export type RecordPayload = Partial<
  Pick<
    CareRecord,
    "type" | "title" | "date" | "dueDate" | "provider" | "notes" | "publicVisibility"
  >
>;

export type PetMomentPayload = Partial<
  Pick<
    PetMoment,
    | "title"
    | "date"
    | "type"
    | "caption"
    | "media"
    | "coverMediaId"
    | "visibility"
    | "showOnPublicProfile"
    | "showInLifeTimeline"
    | "timelineNote"
  >
>;

export type TagOrderPayload = {
  petId: string;
  tagType: TagType;
  variant: TagVariant;
  delivery: DeliveryDetails;
  replacementForTagId?: string;
};
