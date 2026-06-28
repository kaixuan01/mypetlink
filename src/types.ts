export type ApiResponse<T> = {
  data: T;
  meta: {
    requestId: string;
    source: "mock";
    page?: number;
    pageSize?: number;
    total?: number;
  };
};

export type QrStatus = "active" | "draft" | "paused";

export type PetSpecies = "Dog" | "Cat" | "Rabbit" | "Bird" | "Other";

export type PetProfileThemeId =
  | "default"
  | "mint"
  | "peach"
  | "sky"
  | "lavender";

export type Pet = {
  id: string;
  slug: string;
  name: string;
  species: PetSpecies;
  breed: string;
  gender: string;
  color: string;
  ageLabel: string;
  birthday: string;
  adoptionDay: string;
  generalArea: string;
  photoInitial: string;
  photoTone: "apricot" | "mint" | "sky";
  profilePhotoLabel: string;
  coverPhotoLabel: string;
  photoUrl: string;
  coverUrl: string;
  profileTheme: PetProfileThemeId;
  qrStatus: QrStatus;
  publicCode: string;
  finderProfileUrl: string;
  publicProfilePath: string;
  bio: string;
  personalityTags: string[];
  favoriteFood: string;
  favoriteToy: string;
  safetyNote: string;
  emergencyNote: string;
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
  | "breed"
  | "gender"
  | "color"
  | "ageLabel"
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
  | "publicCode"
  | "finderProfileUrl"
  | "publicProfilePath"
  | "bio"
  | "personalityTags"
  | "favoriteFood"
  | "favoriteToy"
  | "safetyNote"
  | "emergencyNote"
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
};

// Frontend MVP limit for media items per moment. Premium tiers can raise this
// in a later phase.
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

export type TagShape = "Round" | "Bone" | "Rounded Square" | "Paw";

export type TagStatus =
  | "Unassigned"
  | "Pending"
  | "Preparing"
  | "Delivered"
  | "Active"
  | "Disabled"
  | "Lost"
  | "Replaced";

// A physical MyPetLink tag. Identified everywhere by tagCode (MPL-XXXX-XXXX).
// petId/ownerUserId are only set once the tag is activated and bound to a pet.
export type PetTag = {
  id: string;
  tagCode: string;
  petId?: string;
  ownerUserId?: string;
  hasNfc: boolean;
  shape: TagShape;
  status: TagStatus;
  batchNo?: string;
  orderedDate?: string;
  deliveredDate?: string;
  lastScannedAt?: string;
  activatedAt?: string;
  replacementForTagId?: string;
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

export type TagOrder = {
  id: string;
  orderNumber?: string;
  petId: string;
  tagType: TagType;
  shape: TagShape;
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
};

export type AdminDashboard = {
  totalUsers: number;
  totalPets: number;
  activeQrProfiles: number;
  newProfilesThisMonth: number;
};

// Outcome of resolving a scanned /t/{tagCode}. The state decides what the
// finder page renders: the public profile, an activation prompt, a safe
// inactive message, or a branded "tag not found" screen.
export type FinderResult =
  | { state: "active"; tagCode: string; profile: PublicPetProfile }
  | { state: "unassigned"; tagCode: string }
  | { state: "inactive"; tagCode: string; status: TagStatus }
  | { state: "not-found"; tagCode: string };

export type PetPayload = Partial<
  Omit<
    Pet,
    | "id"
    | "publicCode"
    | "finderProfileUrl"
    | "publicProfilePath"
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
  shape: TagShape;
  delivery: DeliveryDetails;
  replacementForTagId?: string;
};
