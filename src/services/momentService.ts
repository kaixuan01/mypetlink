import { mockMoments } from "@/data/mockMoments";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import type { PetMoment, PetMomentPayload } from "@/types";

const MOMENT_STORAGE_KEY = "mypetlink_moments";

type LegacyPetMoment = PetMoment & {
  showOnTimeline?: boolean;
};

function getMomentCollection() {
  return readStoredCollection(MOMENT_STORAGE_KEY, mockMoments).map(
    normalizeMoment
  );
}

function normalizeMoment(moment: PetMoment): PetMoment {
  const legacyMoment = moment as LegacyPetMoment;
  const isPublic = moment.visibility === "Public";

  return {
    ...moment,
    mediaUrl: moment.mediaUrl ?? "",
    showOnPublicProfile:
      legacyMoment.showOnPublicProfile ?? isPublic,
    showInLifeTimeline:
      legacyMoment.showInLifeTimeline ?? legacyMoment.showOnTimeline ?? false,
  };
}

export async function getPetMoments(petId: string) {
  await mockDelay();
  const moments = getMomentCollection().filter((moment) => moment.petId === petId);

  return mockResponse(moments, {
    page: 1,
    pageSize: moments.length,
    total: moments.length,
  });
}

export async function getPublicPetMoments(petId: string) {
  await mockDelay();
  const moments = getMomentCollection().filter(
    (moment) => moment.petId === petId && moment.visibility === "Public"
  );

  return mockResponse(moments, {
    page: 1,
    pageSize: moments.length,
    total: moments.length,
  });
}

export async function createPetMoment(
  petId: string,
  payload: PetMomentPayload
) {
  await mockDelay();
  const moments = getMomentCollection();
  const moment: PetMoment = {
    id: `moment_${Date.now()}`,
    petId,
    title: payload.title?.trim() || "New pet moment",
    date: payload.date || "Today",
    type: payload.type ?? "Other",
    caption: payload.caption?.trim() || "",
    mediaKind: payload.mediaKind ?? "None",
    mediaLabel: payload.mediaLabel?.trim() || "Pet moment",
    mediaUrl: payload.mediaUrl ?? "",
    visibility: payload.visibility ?? "Private",
    showOnPublicProfile:
      payload.showOnPublicProfile ?? payload.visibility === "Public",
    showInLifeTimeline: payload.showInLifeTimeline ?? false,
  };

  writeStoredCollection(MOMENT_STORAGE_KEY, [moment, ...moments]);

  return mockResponse(moment);
}

export async function updatePetMoment(
  momentId: string,
  payload: PetMomentPayload
) {
  await mockDelay();
  const moments = getMomentCollection();
  const existingMoment = moments.find((moment) => moment.id === momentId);
  const updatedMoment = existingMoment
    ? { ...existingMoment, ...payload }
    : null;

  if (updatedMoment) {
    writeStoredCollection(
      MOMENT_STORAGE_KEY,
      moments.map((moment) => (moment.id === momentId ? updatedMoment : moment))
    );
  }

  return mockResponse(updatedMoment);
}

export async function deletePetMoment(momentId: string) {
  await mockDelay();
  const moments = getMomentCollection();
  const nextMoments = moments.filter((moment) => moment.id !== momentId);
  writeStoredCollection(MOMENT_STORAGE_KEY, nextMoments);

  return mockResponse({ deleted: moments.length !== nextMoments.length });
}
