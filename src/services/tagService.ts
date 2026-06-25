import { mockOrders } from "@/data/mockOrders";
import { mockTags } from "@/data/mockTags";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import { getPets, getPublicPetProfile } from "@/services/petService";
import type {
  PetTag,
  PublicPetProfile,
  TagOrder,
  TagOrderPayload,
  TagStatus,
  TagType,
} from "@/types";

const TAG_STORAGE_KEY = "mypetlink_tags";
const ORDER_STORAGE_KEY = "mypetlink_orders";

const disabledStatuses: TagStatus[] = ["Disabled", "Lost", "Replaced"];

function getTagCollection() {
  return readStoredCollection(TAG_STORAGE_KEY, mockTags);
}

function getOrderCollection() {
  return readStoredCollection(ORDER_STORAGE_KEY, mockOrders);
}

function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

function createTagCode(petId: string, tagType: TagType) {
  const prefix = petId.replace(/^pet_/, "").toUpperCase().slice(0, 6);
  const suffix = tagType === "MyPetLink QR + NFC Smart Tag" ? "NFC" : "QR";
  return `${prefix}-${suffix}-${Date.now().toString().slice(-4)}`;
}

export function getEstimatedTagPrice(tagType: TagType) {
  return tagType === "MyPetLink QR + NFC Smart Tag" ? "RM39.90" : "RM19.90";
}

export async function getPetTags(petId: string) {
  await mockDelay();
  const tags = getTagCollection().filter((tag) => tag.petId === petId);

  return mockResponse(tags, {
    page: 1,
    pageSize: tags.length,
    total: tags.length,
  });
}

export async function getAllTags() {
  await mockDelay();
  const tags = getTagCollection();

  return mockResponse(tags, {
    page: 1,
    pageSize: tags.length,
    total: tags.length,
  });
}

export async function getOrders() {
  await mockDelay();
  const orders = getOrderCollection();

  return mockResponse(orders, {
    page: 1,
    pageSize: orders.length,
    total: orders.length,
  });
}

export async function createTagOrder(payload: TagOrderPayload) {
  await mockDelay();
  const tags = getTagCollection();
  const orders = getOrderCollection();
  const tagId = `tag_${Date.now()}`;
  const orderedDate = formatToday();
  const tag: PetTag = {
    id: tagId,
    petId: payload.petId,
    tagType: payload.tagType,
    tagCode: createTagCode(payload.petId, payload.tagType),
    status: "Pending",
    design: payload.design,
    orderedDate,
    replacementForTagId: payload.replacementForTagId,
  };
  const order: TagOrder = {
    id: `order_${Date.now()}`,
    petId: payload.petId,
    tagType: payload.tagType,
    design: payload.design,
    delivery: payload.delivery,
    estimatedPrice: getEstimatedTagPrice(payload.tagType),
    status: "Received",
    orderedDate,
    tagId,
    replacementForTagId: payload.replacementForTagId,
  };
  const nextTags = payload.replacementForTagId
    ? [
        tag,
        ...tags.map((item) =>
          item.id === payload.replacementForTagId
            ? { ...item, status: "Replaced" as TagStatus }
            : item
        ),
      ]
    : [tag, ...tags];

  writeStoredCollection(TAG_STORAGE_KEY, nextTags);
  writeStoredCollection(ORDER_STORAGE_KEY, [order, ...orders]);

  return mockResponse({ order, tag });
}

export async function disableTag(tagId: string) {
  await mockDelay();
  return updateTagStatus(tagId, "Disabled");
}

export async function reportTagLost(tagId: string) {
  await mockDelay();
  return updateTagStatus(tagId, "Lost");
}

export async function orderReplacementTag(tagId: string) {
  await mockDelay();
  return updateTagStatus(tagId, "Replaced");
}

async function updateTagStatus(tagId: string, status: TagStatus) {
  const tags = getTagCollection();
  const tag = tags.find((item) => item.id === tagId);
  const updatedTag = tag ? { ...tag, status } : null;

  if (updatedTag) {
    writeStoredCollection(
      TAG_STORAGE_KEY,
      tags.map((item) => (item.id === tagId ? updatedTag : item))
    );
  }

  return mockResponse(updatedTag);
}

export async function getFinderPetProfile(tagCode: string) {
  await mockDelay();
  const tags = getTagCollection();
  const tag = tags.find(
    (item) => item.tagCode.toLowerCase() === tagCode.toLowerCase()
  );
  const pets = await getPets();
  const pet = tag
    ? pets.data.find((item) => item.id === tag.petId)
    : pets.data.find((item) =>
        item.finderProfileUrl.toLowerCase().endsWith(tagCode.toLowerCase())
      );

  if (!pet || (tag && disabledStatuses.includes(tag.status))) {
    const slugMatch = tagCode.match(/^([a-z0-9-]+)-(qr|nfc)(-\d+)?$/i);

    if (!tag && slugMatch) {
      const fallbackProfile = await getPublicPetProfile(
        slugMatch[1].toLowerCase()
      );
      return mockResponse(fallbackProfile.data);
    }

    return mockResponse<PublicPetProfile | null>(null);
  }

  return mockResponse<PublicPetProfile>({
    id: pet.id,
    slug: pet.slug,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    gender: pet.gender,
    color: pet.color,
    ageLabel: pet.ageLabel,
    birthday: pet.birthday,
    adoptionDay: pet.adoptionDay,
    generalArea: pet.generalArea,
    photoInitial: pet.photoInitial,
    photoTone: pet.photoTone,
    profilePhotoLabel: "",
    coverPhotoLabel: "",
    profileTheme: pet.profileTheme,
    finderProfileUrl: pet.finderProfileUrl,
    publicProfileUrl: pet.publicProfileUrl,
    bio: pet.bio,
    personalityTags: pet.personalityTags,
    favoriteFood: pet.favoriteFood,
    favoriteToy: pet.favoriteToy,
    safetyNote: pet.safetyNote,
    emergencyNote: pet.emergencyNote,
    contactPreference: pet.contactPreference,
    owner: pet.owner,
    visibility: pet.visibility,
  });
}
