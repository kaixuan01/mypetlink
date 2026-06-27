import { mockMoments } from "@/data/mockMoments";
import { createMediaId } from "@/lib/momentMedia";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import type { MomentMedia, PetMoment, PetMomentPayload } from "@/types";

const MOMENT_STORAGE_KEY = "mypetlink_moments";

// Older stored moments used single mediaKind/mediaLabel/mediaUrl fields and a
// showOnTimeline flag. We migrate those to the media[] album model on read.
type LegacyPetMoment = PetMoment & {
  showOnTimeline?: boolean;
  mediaKind?: "Image" | "Video" | "None";
  mediaUrl?: string;
};

function getMomentCollection() {
  return readStoredCollection(MOMENT_STORAGE_KEY, mockMoments).map(
    normalizeMoment
  );
}

function normalizeMediaItems(media: MomentMedia[]): MomentMedia[] {
  return media.map((item, index) => ({
    id: item.id || createMediaId(),
    type: item.type === "video" ? "video" : "image",
    url: item.url ?? "",
    caption: item.caption,
    altText: item.altText,
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
  }));
}

function normalizeMoment(moment: PetMoment): PetMoment {
  const legacyMoment = moment as LegacyPetMoment;
  const isPublic = moment.visibility === "Public";

  const media = Array.isArray(legacyMoment.media)
    ? normalizeMediaItems(legacyMoment.media)
    : legacyMoment.mediaUrl
      ? [
          {
            id: createMediaId(),
            type:
              legacyMoment.mediaKind === "Video"
                ? ("video" as const)
                : ("image" as const),
            url: legacyMoment.mediaUrl,
            sortOrder: 0,
          },
        ]
      : [];

  return {
    ...moment,
    media,
    coverMediaId: legacyMoment.coverMediaId ?? media[0]?.id,
    timelineNote: legacyMoment.timelineNote ?? "",
    showOnPublicProfile: legacyMoment.showOnPublicProfile ?? isPublic,
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
  const media = normalizeMediaItems(payload.media ?? []);
  const moment: PetMoment = {
    id: `moment_${Date.now()}`,
    petId,
    title: payload.title?.trim() || "New pet moment",
    date: payload.date || "Today",
    type: payload.type ?? "Other",
    caption: payload.caption?.trim() || "",
    media,
    coverMediaId: payload.coverMediaId ?? media[0]?.id,
    visibility: payload.visibility ?? "Private",
    showOnPublicProfile:
      payload.showOnPublicProfile ?? payload.visibility === "Public",
    showInLifeTimeline: payload.showInLifeTimeline ?? false,
    timelineNote: payload.timelineNote ?? "",
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
  const nextMedia = payload.media
    ? normalizeMediaItems(payload.media)
    : existingMoment?.media ?? [];
  const updatedMoment = existingMoment
    ? {
        ...existingMoment,
        ...payload,
        media: nextMedia,
        coverMediaId: payload.coverMediaId ?? nextMedia[0]?.id,
      }
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
