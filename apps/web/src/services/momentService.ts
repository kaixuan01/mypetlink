import { mockMoments } from "@/data/mockMoments";
import {
  createMediaId,
  mediaIdsInSortOrder,
  sortedMedia,
} from "@/lib/momentMedia";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import { apiRequest, isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { uploadMediaFile } from "@/services/mediaService";
import type {
  BackendMemory,
  BackendMemoryMedia,
  BackendMemoryVisibility,
  BackendPublicMemory,
  BackendPublicPetProfile,
} from "@/services/apiDtos";
import type {
  ApiResponse,
  MomentMedia,
  MomentType,
  MomentVisibility,
  PetMoment,
  PetMomentPayload,
} from "@/types";

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
  return sortedMedia(
    media.map((item, index) => ({
      id: item.id || createMediaId(),
      type: item.type === "video" ? "video" : "image",
      url: item.url ?? "",
      posterUrl: item.posterUrl,
      durationSeconds: item.durationSeconds,
      caption: item.caption,
      altText: item.altText,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
    }))
  );
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
  if (canUseApi()) {
    const response = await apiRequest<BackendMemory[]>(
      `/api/v1/pets/${encodeURIComponent(petId)}/memories?page=1&pageSize=100`
    );
    const moments = (response.data ?? []).map(mapBackendMoment);

    return apiResponse(moments, response.meta);
  }

  await mockDelay();
  const moments = getMomentCollection().filter((moment) => moment.petId === petId);

  return mockResponse(moments, {
    page: 1,
    pageSize: moments.length,
    total: moments.length,
  });
}

export async function getPublicPetMoments(petId: string) {
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendPublicPetProfile>(
        `/api/v1/public/pets/${encodeURIComponent(petId)}`,
        { auth: false }
      );
      const moments = (response.data?.memories ?? []).map((moment, index) =>
        mapBackendPublicMoment(moment, petId, index)
      );

      return apiResponse(moments, response.meta);
    } catch (error) {
      if (isApiClientError(error) && [403, 404].includes(error.status)) {
        return apiResponse<PetMoment[]>([]);
      }

      throw error;
    }
  }

  await mockDelay();
  const moments = getMomentCollection().filter(
    (moment) =>
      moment.petId === petId &&
      moment.visibility === "Public" &&
      (moment.showOnPublicProfile || moment.showInLifeTimeline)
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
  if (canUseApi()) {
    const response = await apiRequest<BackendMemory>(
      `/api/v1/pets/${encodeURIComponent(petId)}/memories`,
      {
        method: "POST",
        body: buildBackendMomentPayload({ ...payload, media: [] }),
      }
    );
    let moment = response.data ? mapBackendMoment(response.data) : null;

    if (!moment) {
      throw new Error("Moment was not returned after saving.");
    }

    if (payload.media?.length) {
      const media = await uploadMomentMediaFiles(petId, moment.id, payload.media);
      const updateResponse = await apiRequest<BackendMemory>(
        `/api/v1/memories/${encodeURIComponent(moment.id)}`,
        {
          method: "PUT",
          body: buildBackendMomentPayload({
            ...payload,
            media,
            coverMediaId: payload.coverMediaId,
          }),
        }
      );

      moment = updateResponse.data ? mapBackendMoment(updateResponse.data) : moment;
    }

    return apiResponse(moment, response.meta);
  }

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
  payload: PetMomentPayload,
  petId?: string
) {
  if (canUseApi()) {
    try {
      const media = payload.media?.some((item) => item.sourceFile)
        ? await uploadMomentMediaFiles(
            requirePetIdForMediaUpload(petId),
            momentId,
            payload.media
          )
        : stripTransientMediaFiles(payload.media);
      const response = await apiRequest<BackendMemory>(
        `/api/v1/memories/${encodeURIComponent(momentId)}`,
        {
          method: "PUT",
          body: buildBackendMomentPayload({ ...payload, media }),
        }
      );

      return apiResponse(
        response.data ? mapBackendMoment(response.data) : null,
        response.meta
      );
    } catch (error) {
      if (isApiClientError(error) && error.status === 404) {
        return apiResponse<PetMoment | null>(null);
      }

      throw error;
    }
  }

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
  if (canUseApi()) {
    await apiRequest<void>(`/api/v1/memories/${encodeURIComponent(momentId)}`, {
      method: "DELETE",
    });

    return apiResponse({ deleted: true });
  }

  await mockDelay();
  const moments = getMomentCollection();
  const nextMoments = moments.filter((moment) => moment.id !== momentId);
  writeStoredCollection(MOMENT_STORAGE_KEY, nextMoments);

  return mockResponse({ deleted: moments.length !== nextMoments.length });
}

export function getFriendlyMomentErrorMessage(error: unknown) {
  if (isApiClientError(error)) {
    if (error.code === "plan_limit_reached") {
      return "You've reached the Free memory limit for this pet. Existing memories stay safe and Premium albums are coming soon.";
    }

    if (error.code === "validation_failed" && error.details) {
      const firstField = Object.values(error.details)[0]?.[0];
      return firstField ?? error.message;
    }

    if (error.status === 0) {
      return "We could not reach MyPetLink right now. Please try again.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function apiResponse<T>(
  data: T,
  meta?: {
    requestId?: string;
    page?: number | null;
    pageSize?: number | null;
    total?: number | null;
  }
): ApiResponse<T> {
  return {
    data,
    meta: {
      requestId: meta?.requestId ?? `api_${Date.now()}`,
      source: "api",
      page: meta?.page ?? undefined,
      pageSize: meta?.pageSize ?? undefined,
      total: meta?.total ?? undefined,
    },
  };
}

function buildBackendMomentPayload(payload: PetMomentPayload) {
  const visibility = payload.visibility ?? "Private";
  const isPublic = visibility === "Public";

  return {
    title: payload.title,
    date: toIsoDate(payload.date),
    type: payload.type,
    caption: payload.caption,
    visibility: toBackendVisibility(visibility),
    showOnPublicProfile: isPublic && Boolean(payload.showOnPublicProfile),
    showInLifeTimeline: isPublic && Boolean(payload.showInLifeTimeline),
    timelineNote: payload.timelineNote,
    mediaFileIds: mediaIdsInSortOrder(payload.media),
  };
}

function mapBackendMoment(moment: BackendMemory): PetMoment {
  return {
    id: moment.id,
    petId: moment.petId,
    title: moment.title,
    date: toDisplayDate(moment.date),
    type: fromBackendMomentType(moment.type),
    caption: moment.caption ?? "",
    media: sortedMedia((moment.media ?? []).map(mapBackendMedia)),
    coverMediaId: moment.coverMediaId ?? undefined,
    visibility: fromBackendVisibility(moment.visibility),
    showOnPublicProfile: moment.showOnPublicProfile,
    showInLifeTimeline: moment.showInLifeTimeline,
    timelineNote: moment.timelineNote ?? "",
  };
}

function mapBackendPublicMoment(
  moment: BackendPublicMemory,
  petId: string,
  index: number
): PetMoment {
  const media = sortedMedia((moment.media ?? []).map(mapBackendMedia));

  return {
    id: `public_${petId}_${index}_${slugPart(moment.title)}`,
    petId,
    title: moment.title,
    date: toDisplayDate(moment.momentDate),
    type: fromBackendMomentType(moment.type),
    caption: moment.caption ?? "",
    media,
    coverMediaId: media[0]?.id,
    visibility: "Public",
    showOnPublicProfile: moment.showOnPublicProfile,
    showInLifeTimeline: moment.showInLifeTimeline,
    timelineNote: moment.timelineNote ?? "",
  };
}

function mapBackendMedia(media: BackendMemoryMedia): MomentMedia {
  return {
    id: media.id,
    type: media.type.toLowerCase() === "video" ? "video" : "image",
    url: media.url ?? "",
    posterUrl: media.posterUrl ?? undefined,
    durationSeconds: media.durationSeconds ?? undefined,
    caption: media.caption ?? undefined,
    altText: media.altText ?? undefined,
    sortOrder: typeof media.sortOrder === "number" ? media.sortOrder : 0,
  };
}

function toBackendVisibility(
  visibility: MomentVisibility
): BackendMemoryVisibility {
  return visibility === "Family Only" ? "FamilyOnly" : visibility;
}

function fromBackendVisibility(
  visibility: BackendMemoryVisibility
): MomentVisibility {
  return visibility === "FamilyOnly" ? "Family Only" : visibility;
}

function fromBackendMomentType(type?: string | null): MomentType {
  switch (type) {
    case "Birthday":
    case "Adoption Day":
    case "First Day Home":
    case "Grooming Day":
    case "Vet Visit":
    case "Vaccination":
    case "Achievement":
    case "Funny Moment":
    case "Training":
    case "Outdoor / Trip":
    case "Memory":
    case "Other":
      return type;
    default:
      return "Other";
  }
}

async function uploadMomentMediaFiles(
  petId: string,
  momentId: string,
  media: MomentMedia[]
) {
  const ordered = [...media].sort((a, b) => a.sortOrder - b.sortOrder);
  const uploaded: MomentMedia[] = [];

  for (const item of ordered) {
    if (!item.sourceFile) {
      uploaded.push({ ...item, sourceFile: undefined });
      continue;
    }

    const completed = await uploadMediaFile({
      file: item.sourceFile,
      category: item.type === "video" ? "MomentVideo" : "MomentImage",
      petId,
      momentId,
    });

    uploaded.push({
      id: completed.mediaId,
      type: item.type,
      url: completed.publicUrl ?? item.url ?? "",
      altText: item.altText ?? completed.originalFileName,
      caption: item.caption,
      sortOrder: item.sortOrder,
    });
  }

  return uploaded;
}

function stripTransientMediaFiles(media?: MomentMedia[]) {
  return media?.map((item) => ({ ...item, sourceFile: undefined }));
}

function requirePetIdForMediaUpload(petId?: string) {
  if (!petId) {
    throw new Error("Pet profile is required before uploading media.");
  }

  return petId;
}

function toDisplayDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function toIsoDate(value?: string | null) {
  if (!value || value === "Not set") {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);

  if (monthIndex < 0) {
    return null;
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
