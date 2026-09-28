import { mockMoments } from "@/data/mockMoments";
import {
  createMediaId,
  mediaIdsInSortOrder,
  sortedMedia,
} from "@/lib/momentMedia";
import { normalizeMomentVisibility } from "@/lib/momentVisibility";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import { apiRequest, isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { deleteMedia, uploadMediaFile } from "@/services/mediaService";
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
  const visibility = normalizeMomentVisibility(moment.visibility);
  const isPublic = visibility === "Public";

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
    visibility,
    media,
    coverMediaId: legacyMoment.coverMediaId ?? media[0]?.id,
    timelineNote: legacyMoment.timelineNote ?? "",
    showOnPublicProfile: isPublic,
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
      // Public profile responses carry an explicit audience so a missing or
      // compatibility-only placement flag can never widen visibility.
      const moments = mapBackendPublicMoments(response.data?.memories, petId);

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
    (moment) => moment.petId === petId && moment.visibility === "Public"
  );

  return mockResponse(moments, {
    page: 1,
    pageSize: moments.length,
    total: moments.length,
  });
}

/**
 * One Moment editor's save attempts, from opening it to closing it.
 *
 * A Moment is saved in two steps that cannot share a transaction: its files go
 * to storage, then one request creates (or updates) the Moment with them. The
 * session is what makes a second attempt safe after the first failed part-way:
 *
 * - `idempotencyKey` is sent with every create attempt from this editor. The
 *   API returns the Moment that key already created instead of writing
 *   another, so a retry after a timeout, a dropped connection or a second
 *   press is never a duplicate.
 * - `uploads` remembers every file already uploaded, so a retry uploads only
 *   the ones that did not finish.
 * - `offered` records every media id sent in a save request. Those may already
 *   be attached to a Moment, even if the answer never arrived, so the client
 *   never deletes them; anything uploaded and never offered is removed by
 *   `releaseMomentSaveSession` when the editor closes.
 */
export type MomentSaveSession = {
  readonly idempotencyKey: string;
  readonly uploads: Map<File, MomentMedia>;
  readonly offered: Set<string>;
};

export function createMomentSaveSession(): MomentSaveSession {
  return {
    idempotencyKey: newIdempotencyKey(),
    uploads: new Map(),
    offered: new Set(),
  };
}

/**
 * Removes files this session uploaded but never sent in a save — the draft
 * was discarded, or its files changed after an upload failed. Best effort: a
 * file left behind is attached to nothing and shown nowhere.
 */
export async function releaseMomentSaveSession(session: MomentSaveSession) {
  if (!canUseApi()) return;

  const unused = [...session.uploads.values()]
    .map((media) => media.id)
    .filter((id) => !session.offered.has(id));
  session.uploads.clear();

  await Promise.all(unused.map((id) => deleteMedia(id).catch(() => undefined)));
}

/**
 * A photo or video did not upload, so nothing was saved: the Moment is
 * created (or updated) only after every file is ready. Retrying with the same
 * session uploads only what is missing.
 */
export class MomentMediaUploadError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(
      "A photo or video didn't finish uploading, so this Moment hasn't been saved yet. Try again — anything that already uploaded won't upload twice.",
      options
    );
    this.name = "MomentMediaUploadError";
  }
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `moment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Creates a Moment and its media in one request.
 *
 * Every file is uploaded first, unattached. Only then is the Moment created,
 * naming those files, and the API writes the Moment and its media in one save.
 * Nothing exists — and a Shared publicly Moment is visible nowhere — until
 * that request succeeds, and a failed upload leaves no Moment behind.
 *
 * Pass the editor's `session` so a retry reuses its idempotency key and its
 * finished uploads. Without one, the call is a single attempt.
 */
export async function createPetMoment(
  petId: string,
  payload: PetMomentPayload,
  session: MomentSaveSession = createMomentSaveSession()
) {
  if (canUseApi()) {
    const media = await uploadMomentMediaFiles(petId, payload.media ?? [], session);
    const body = {
      ...buildBackendMomentPayload({ ...payload, media }),
      idempotencyKey: session.idempotencyKey,
    };
    // Offered from here on: this request may attach them even if its answer
    // is lost, so the client must never delete them.
    for (const id of body.mediaFileIds) session.offered.add(id);

    const response = await apiRequest<BackendMemory>(
      `/api/v1/pets/${encodeURIComponent(petId)}/memories`,
      { method: "POST", body }
    );
    const moment = response.data ? mapBackendMoment(response.data) : null;

    if (!moment) {
      throw new Error("Moment was not returned after saving.");
    }

    return apiResponse(moment, response.meta);
  }

  await mockDelay();
  const moments = getMomentCollection();
  const media = normalizeMediaItems(payload.media ?? []);
  const visibility = normalizeMomentVisibility(payload.visibility ?? "Private");
  const moment: PetMoment = {
    id: `moment_${Date.now()}`,
    petId,
    title: payload.title?.trim() || "New pet moment",
    date: payload.date || "Today",
    type: payload.type ?? "Other",
    caption: payload.caption?.trim() || "",
    media,
    coverMediaId: payload.coverMediaId ?? media[0]?.id,
    visibility,
    showOnPublicProfile: visibility === "Public",
    showInLifeTimeline: payload.showInLifeTimeline ?? false,
    timelineNote: payload.timelineNote ?? "",
    additionalPetIds: payload.additionalPetIds ?? [],
  };

  writeStoredCollection(MOMENT_STORAGE_KEY, [moment, ...moments]);

  return mockResponse(moment);
}

/**
 * Saves an edit. New files are uploaded first, unattached; the Moment's media
 * list is then replaced in the same request as every other change, so a
 * failed upload leaves the Moment exactly as it was. No idempotency key: the
 * update names the whole media list, so repeating it is harmless.
 */
export async function updatePetMoment(
  momentId: string,
  payload: PetMomentPayload,
  petId?: string,
  session: MomentSaveSession = createMomentSaveSession()
) {
  if (canUseApi()) {
    try {
      const media = payload.media?.some((item) => item.sourceFile)
        ? await uploadMomentMediaFiles(
            requirePetIdForMediaUpload(petId),
            payload.media,
            session
          )
        : stripTransientMediaFiles(payload.media);
      const body = buildBackendMomentPayload({ ...payload, media });
      for (const id of body.mediaFileIds) session.offered.add(id);

      const response = await apiRequest<BackendMemory>(
        `/api/v1/memories/${encodeURIComponent(momentId)}`,
        {
          method: "PUT",
          body,
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
    ? normalizeMoment({
        ...existingMoment,
        ...payload,
        media: nextMedia,
        coverMediaId: payload.coverMediaId ?? nextMedia[0]?.id,
      })
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
  if (error instanceof MomentMediaUploadError) {
    return error.message;
  }

  if (isApiClientError(error)) {
    if (error.code === "plan_limit_reached") {
      return "You've reached the Free Moment limit for this pet. Existing Moments stay safe and Premium albums are coming soon.";
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

export function buildBackendMomentPayload(payload: PetMomentPayload) {
  const visibility = normalizeMomentVisibility(payload.visibility ?? "Private");
  const isPublic = visibility === "Public";

  return {
    title: payload.title,
    date: toIsoDate(payload.date),
    type: payload.type,
    caption: payload.caption,
    visibility: toBackendVisibility(visibility),
    // Compatibility field only. Visibility is now the audience authority.
    showOnPublicProfile: isPublic,
    showInLifeTimeline: Boolean(payload.showInLifeTimeline),
    timelineNote: payload.timelineNote,
    mediaFileIds: mediaIdsInSortOrder(payload.media),
    // Omitted rather than sent as null when the caller did not touch the
    // subject list: the API treats an absent value as "leave unchanged" and an
    // empty array as "clear the extras".
    ...(payload.additionalPetIds
      ? { additionalPetIds: payload.additionalPetIds }
      : {}),
  };
}

function mapBackendMoment(moment: BackendMemory): PetMoment {
  return {
    id: moment.id,
    petId: moment.petId,
    additionalPetIds: moment.additionalPetIds ?? [],
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

export function mapBackendPublicMoments(
  moments: BackendPublicMemory[] | null | undefined,
  petId: string
): PetMoment[] {
  return (moments ?? [])
    .filter((moment) => moment.visibility === "Public")
    .map((moment, index) => mapBackendPublicMoment(moment, petId, index));
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
  return normalizeMomentVisibility(visibility);
}

function fromBackendVisibility(
  visibility: BackendMemoryVisibility
): MomentVisibility {
  return visibility === "Public" ? "Public" : "Private";
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

/**
 * Uploads the files a save needs, in order, skipping any this session has
 * already uploaded. Uploads are for the pet, not a Moment: the API attaches
 * them only when the save that names them succeeds.
 */
async function uploadMomentMediaFiles(
  petId: string,
  media: MomentMedia[],
  session: MomentSaveSession
) {
  const ordered = [...media].sort((a, b) => a.sortOrder - b.sortOrder);
  const uploaded: MomentMedia[] = [];

  for (const item of ordered) {
    if (!item.sourceFile) {
      uploaded.push({ ...item, sourceFile: undefined });
      continue;
    }

    let done = session.uploads.get(item.sourceFile);

    if (!done) {
      let completed: Awaited<ReturnType<typeof uploadMediaFile>>;
      try {
        completed = await uploadMediaFile({
          file: item.sourceFile,
          category: item.type === "video" ? "MomentVideo" : "MomentImage",
          petId,
          // A file that fails part-way removes its own pending record and
          // object; nothing is left for a later sweep.
          cleanupOnFailure: true,
        });
      } catch (error) {
        throw new MomentMediaUploadError({ cause: error });
      }

      done = {
        id: completed.mediaId,
        type: item.type,
        url: completed.publicUrl ?? item.url ?? "",
        altText: completed.originalFileName,
        sortOrder: item.sortOrder,
      };
      session.uploads.set(item.sourceFile, done);
    }

    uploaded.push({
      ...done,
      altText: item.altText ?? done.altText,
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

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);
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
  ].indexOf(`${month.slice(0, 1).toUpperCase()}${month.slice(1, 3).toLowerCase()}`);

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
