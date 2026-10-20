import { mockRecords } from "@/data/mockRecords";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import { apiRequest, isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { deleteMedia, uploadMediaFile } from "@/services/mediaService";
import { getPets } from "@/services/petService";
import {
  CARE_RECORD_DUE_SOON_DAYS,
  careDateScore,
  careDateScoreToIsoDate,
  deriveCareRecordStatus,
  getExplicitlyFulfilledCareRecordIds,
  getMalaysiaTodayIsoDate,
  selectDashboardCareRecords,
} from "@/lib/careRecordStatus";
import {
  parseCareCompletionStatus,
  parseUpcomingCarePage,
  parseUpcomingCareSummary,
  SUMMARY_ITEMS_PER_SCOPE,
} from "@/lib/careContracts";
import { getActivePets } from "@/lib/petLifecycle";
import { isUncertainRequestOutcome } from "@/lib/requestOutcome";
import {
  isCareRecordPublic,
  normalizeCareRecordVisibility,
} from "@/lib/careRecordVisibility";
import type {
  BackendCareRecord,
  BackendCareRecordPublicVisibility,
  BackendCareRecordType,
  BackendPublicPetProfile,
  BackendCareCompletionStatus,
  BackendUpcomingCareRecord,
  BackendUpcomingCareRecords,
  BackendUpcomingCareSummary,
} from "@/services/apiDtos";
import type {
  ApiResponse,
  CareCompletionStatus,
  CareDocument,
  CareRecord,
  PublicCareRecord,
  RecordPayload,
  RecordType,
  UpcomingCareItem,
  UpcomingCarePage,
  UpcomingCareScope,
  UpcomingCareSummary,
} from "@/types";

const RECORD_STORAGE_KEY = "mypetlink_records";

export { normalizeCareRecordVisibility } from "@/lib/careRecordVisibility";

function getRecordCollection() {
  return readStoredCollection(RECORD_STORAGE_KEY, mockRecords).map(normalizeRecord);
}

function normalizeRecord(record: CareRecord): CareRecord {
  return {
    ...record,
    careName: normalizeCareName(record.careName),
    fulfillsCareRecordId: normalizeOptionalId(record.fulfillsCareRecordId),
    provider: normalizeProvider(record.provider),
    publicVisibility: normalizeCareRecordVisibility(record.publicVisibility),
    status: deriveCareRecordStatus(record.dueDate),
    documents: normalizeLocalDocuments(record.documents, record.type),
  };
}

export async function getPetRecords(petId: string) {
  if (canUseApi()) {
    const response = await apiRequest<BackendCareRecord[]>(
      `/api/v1/pets/${encodeURIComponent(petId)}/care-records?page=1&pageSize=100`
    );
    const records = (response.data ?? []).map(mapBackendRecord);

    return apiResponse(records, response.meta);
  }

  await mockDelay();
  const records = getRecordCollection().filter((record) => record.petId === petId);
  return mockResponse(records, {
    page: 1,
    pageSize: records.length,
    total: records.length,
  });
}

export const UPCOMING_CARE_PAGE_SIZE = 100;

type UpcomingCarePageOptions = {
  page?: number;
  pageSize?: number;
  petId?: string;
};

/**
 * One page of the owner's pending care across their active pets, filtered
 * completely before it is paged. `meta.total` is the filtered pending count.
 *
 * Pages are separate reads and can each describe a different moment, so a
 * set of pages must never be presented as everything that is due. The
 * Dashboard uses getUpcomingCareSummary instead. Each page is validated
 * against the page that was asked for; a page that does not hold together is
 * a failed read.
 */
export async function getUpcomingCarePage(
  options: UpcomingCarePageOptions = {}
): Promise<ApiResponse<UpcomingCarePage>> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? UPCOMING_CARE_PAGE_SIZE;

  if (canUseApi()) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (options.petId) {
      params.set("petId", options.petId);
    }
    const response = await apiRequest<BackendUpcomingCareRecords>(
      `/api/v1/care-records/upcoming?${params.toString()}`
    );
    const parsed = parseUpcomingCarePage(response.data, response.meta, {
      page,
      pageSize,
    });

    return apiResponse(
      {
        asOfDate: parsed.data.asOfDate,
        petIdsWithCareRecords: parsed.data.petIdsWithCareRecords,
        items: parsed.data.items.map(mapBackendUpcomingCareRecord),
      },
      { ...response.meta, total: parsed.total }
    );
  }

  await mockDelay();
  const summaryInput = await readLocalPendingCare();
  if (
    options.petId &&
    !summaryInput.ownedPetIds.has(options.petId)
  ) {
    throw new Error("Pet was not found.");
  }
  const scoped = summaryInput.pending.filter(
    (item) => !options.petId || item.petId === options.petId
  );

  return mockResponse(
    {
      asOfDate: summaryInput.asOfDate,
      petIdsWithCareRecords: [...summaryInput.petIdsWithCareRecords].filter(
        (petId) => !options.petId || petId === options.petId
      ),
      items: scoped.slice((page - 1) * pageSize, page * pageSize),
    },
    { page, pageSize, total: scoped.length }
  );
}

/**
 * The Dashboard's pending-care summary: exact counts and the items to show,
 * for all active pets and for each one, from one consistent read. Throws when
 * the response does not hold together, so the caller shows an error rather
 * than an answer built on defaults.
 */
export async function getUpcomingCareSummary(): Promise<UpcomingCareSummary> {
  if (canUseApi()) {
    const response = await apiRequest<BackendUpcomingCareSummary>(
      "/api/v1/care-records/upcoming/summary"
    );
    const summary = parseUpcomingCareSummary(response.data);

    return {
      asOfDate: summary.asOfDate,
      horizonDate: summary.horizonDate,
      complete: summary.complete,
      scopes: summary.scopes.map((scope) => ({
        petId: scope.petId,
        hasCareRecords: scope.hasCareRecords,
        pendingCount: scope.pendingCount,
        dueWithinHorizonCount: scope.dueWithinHorizonCount,
        overdueCount: scope.overdueCount,
        items: scope.items.map(mapBackendUpcomingCareRecord),
      })),
    };
  }

  await mockDelay();
  // Local data is read synchronously, so this is one consistent state too.
  const input = await readLocalPendingCare();
  const asOfScore = careDateScore(input.asOfDate) ?? 0;
  const horizonScore = asOfScore + CARE_RECORD_DUE_SOON_DAYS;
  const scope = (petId: string | null, items: UpcomingCareItem[]): UpcomingCareScope => {
    const scores = items.map((item) => careDateScore(item.dueDateIso) ?? 0);
    return {
      petId,
      hasCareRecords:
        petId === null
          ? input.activePetIds.some((id) => input.petIdsWithCareRecords.has(id))
          : input.petIdsWithCareRecords.has(petId),
      pendingCount: items.length,
      dueWithinHorizonCount: scores.filter((score) => score <= horizonScore).length,
      overdueCount: scores.filter((score) => score < asOfScore).length,
      items: selectDashboardCareRecords(items, SUMMARY_ITEMS_PER_SCOPE),
    };
  };

  return {
    asOfDate: input.asOfDate,
    horizonDate: careDateScoreToIsoDate(horizonScore),
    complete: true,
    scopes: [
      scope(null, input.pending),
      ...input.activePetIds.map((petId) =>
        scope(petId, input.pending.filter((item) => item.petId === petId))
      ),
    ],
  };
}

/**
 * Whether one due item has been completed, and by which record — read from
 * the records themselves. Used by Log as done both to decide whether the item
 * can be logged and to settle a save whose outcome is unknown.
 */
export async function getCareCompletionStatus(
  recordId: string
): Promise<CareCompletionStatus> {
  if (canUseApi()) {
    const response = await apiRequest<BackendCareCompletionStatus>(
      `/api/v1/care-records/${encodeURIComponent(recordId)}/completion`
    );
    const status = parseCareCompletionStatus(response.data, recordId);

    return {
      state: status.state as CareCompletionStatus["state"],
      asOfDate: status.asOfDate,
      petName: status.petName,
      target: mapBackendRecord(status.target),
      completion: status.completion ? mapBackendRecord(status.completion) : null,
    };
  }

  await mockDelay();
  const records = getRecordCollection();
  const target = records.find((record) => record.id === recordId);
  if (!target) {
    throw new Error("Care record was not found.");
  }
  const pet = (await getPets()).data.find((item) => item.id === target.petId);
  // Same precedence as the service: a changed target is reported before any
  // completion, so an archived or undated item is never read as completed.
  const completion =
    records.find(
      (record) =>
        record.fulfillsCareRecordId === target.id &&
        record.petId === target.petId &&
        !record.archivedAt
    ) ?? null;
  const state: CareCompletionStatus["state"] = target.archivedAt
    ? "archived"
    : pet && pet.lifecycleStatus === "Archived"
      ? "pet-archived"
      : careDateScore(target.dueDate) === null
        ? "no-due-date"
        : completion
          ? "completed"
          : "pending";

  return {
    state,
    asOfDate: getMalaysiaTodayIsoDate(),
    petName: pet?.name ?? "",
    target,
    completion,
  };
}

type LocalPendingCare = {
  asOfDate: string;
  ownedPetIds: Set<string>;
  activePetIds: string[];
  petIdsWithCareRecords: Set<string>;
  /** Pending items ordered by due date, creation time, then id. */
  pending: UpcomingCareItem[];
};

/**
 * The service's pending-care rules applied to local data: active pets only,
 * active records only, and a due item is pending until an active record
 * fulfils it.
 */
async function readLocalPendingCare(): Promise<LocalPendingCare> {
  const ownedPets = (await getPets()).data;
  const activePets = getActivePets(ownedPets);
  const petNames = new Map(activePets.map((pet) => [pet.id, pet.name]));
  const allRecords = getRecordCollection();
  const fulfilledIds = getExplicitlyFulfilledCareRecordIds(allRecords);
  const activeRecords = allRecords.filter(
    (record) => petNames.has(record.petId) && !record.archivedAt
  );
  const pending = activeRecords
    .map((record) => ({ record, score: careDateScore(record.dueDate) }))
    .filter(
      (entry): entry is { record: CareRecord; score: number } =>
        entry.score !== null && !fulfilledIds.has(entry.record.id)
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        compareOrdinal(left.record.createdAt ?? "", right.record.createdAt ?? "") ||
        compareOrdinal(left.record.id, right.record.id)
    )
    .map(({ record, score }): UpcomingCareItem => {
      const status = deriveCareRecordStatus(record.dueDate);
      return {
        id: record.id,
        petId: record.petId,
        petName: petNames.get(record.petId) ?? "",
        type: record.type,
        title: record.title,
        careName: record.careName,
        dueDate: record.dueDate ?? "",
        dueDateIso: careDateScoreToIsoDate(score),
        status: status === "complete" ? "upcoming" : status,
      };
    });

  return {
    asOfDate: getMalaysiaTodayIsoDate(),
    ownedPetIds: new Set(ownedPets.map((pet) => pet.id)),
    activePetIds: activePets.map((pet) => pet.id),
    petIdsWithCareRecords: new Set(activeRecords.map((record) => record.petId)),
    pending,
  };
}

export function mapBackendUpcomingCareRecord(
  record: BackendUpcomingCareRecord
): UpcomingCareItem {
  const status = toFrontendStatus(record.derivedStatus);
  return {
    id: record.id,
    petId: record.petId,
    petName: record.petName,
    type: fromBackendRecordType(record.type),
    title: record.title,
    careName: normalizeCareName(record.careName ?? undefined),
    dueDate: toDisplayDate(record.dueDate),
    dueDateIso: record.dueDate,
    // Validation guarantees a pending status; "complete" cannot reach here.
    status: status === "complete" ? "upcoming" : status,
  };
}

/**
 * Told the moment a create request is about to leave, with exactly what it
 * carries: the stored media ids of every attached file — kept ones and ones
 * just uploaded. A failure before this point wrote nothing; after it, the
 * outcome may be unknown, and these ids are how a later read can recognise
 * this save's record.
 */
export type CareSaveObserver = {
  onSending?: (sent: { mediaFileIds: string[]; uploadedMediaFileIds: string[] }) => void;
};

export async function createRecord(
  petId: string,
  payload: RecordPayload,
  observer: CareSaveObserver = {}
) {
  if (canUseApi()) {
    const prepared = await prepareCareDocuments(petId, payload);
    observer.onSending?.({
      mediaFileIds: (prepared.documents ?? []).map((document) => document.id),
      uploadedMediaFileIds: [...prepared.uploadedIds],
    });
    try {
      const response = await apiRequest<BackendCareRecord>(
        `/api/v1/pets/${encodeURIComponent(petId)}/care-records`,
        {
          method: "POST",
          body: buildBackendRecordPayload({
            ...payload,
            documents: prepared.documents,
          }),
        }
      );
      const record = response.data ? mapBackendRecord(response.data) : null;

      if (!record) {
        throw new Error("Care record was not returned after saving.");
      }

      return apiResponse(record, response.meta);
    } catch (error) {
      // When the outcome is unknown the record may have been saved with these
      // files attached; deleting them could strip a saved record. Keep them.
      if (!isUncertainRequestOutcome(error)) {
        await cleanupUploadedDocuments(prepared.uploadedIds);
      }
      throw error;
    }
  }

  await mockDelay();
  const localDocuments = normalizeLocalDocuments(payload.documents, payload.type ?? "Other");
  observer.onSending?.({
    mediaFileIds: (localDocuments ?? []).map((document) => document.id),
    uploadedMediaFileIds: [],
  });
  const records = getRecordCollection();
  const now = new Date().toISOString();
  const record: CareRecord = {
    id: `rec_${Date.now()}`,
    petId,
    type: payload.type ?? "Other",
    title: payload.title ?? "New record",
    careName: normalizeCareName(payload.careName),
    date: payload.date ?? "Today",
    dueDate: payload.dueDate,
    fulfillsCareRecordId: normalizeOptionalId(payload.fulfillsCareRecordId),
    provider: normalizeProvider(payload.provider),
    notes: payload.notes ?? "No notes yet.",
    publicVisibility: normalizeCareRecordVisibility(payload.publicVisibility),
    status: deriveCareRecordStatus(payload.dueDate),
    documents: localDocuments,
    createdAt: now,
    updatedAt: now,
  };

  validateLocalCareIdentity(record, records);

  writeStoredCollection(RECORD_STORAGE_KEY, [record, ...records]);

  return mockResponse(record);
}

export async function updateRecord(
  recordId: string,
  payload: RecordPayload,
  petId?: string
) {
  if (canUseApi()) {
    const prepared = payload.documents?.some((document) => document.sourceFile)
      ? await prepareCareDocuments(
          petId ?? requirePetIdForDocumentUpload(),
          payload
        )
      : { documents: payload.documents, uploadedIds: [] };
    try {
      const response = await apiRequest<BackendCareRecord>(
        `/api/v1/care-records/${encodeURIComponent(recordId)}`,
        {
          method: "PUT",
          body: buildBackendRecordPayload(
            { ...payload, documents: prepared.documents },
            {
              allowDueDateClear: true,
              allowIdentityClears: true,
            }
          ),
        }
      );

      const record = response.data ? mapBackendRecord(response.data) : null;
      if (!record) {
        throw new Error("Care record was not returned after saving.");
      }

      return apiResponse(record, response.meta);
    } catch (error) {
      // When the outcome is unknown the record may have been saved with these
      // files attached; deleting them could strip a saved record. Keep them.
      if (!isUncertainRequestOutcome(error)) {
        await cleanupUploadedDocuments(prepared.uploadedIds);
      }
      if (isApiClientError(error) && error.status === 404) {
        return apiResponse<CareRecord | null>(null);
      }

      throw error;
    }
  }

  await mockDelay();
  const records = getRecordCollection();
  const existingRecord = records.find((record) => record.id === recordId);
  const updatedRecord: CareRecord | null = existingRecord
    ? normalizeRecord({
        ...existingRecord,
        ...payload,
        careName: hasOwn(payload, "careName")
          ? normalizeCareName(payload.careName)
          : existingRecord.careName,
        fulfillsCareRecordId: hasOwn(payload, "fulfillsCareRecordId")
          ? normalizeOptionalId(payload.fulfillsCareRecordId)
          : existingRecord.fulfillsCareRecordId,
        provider: hasOwn(payload, "provider")
          ? normalizeProvider(payload.provider)
          : existingRecord.provider,
        publicVisibility: normalizeCareRecordVisibility(
          payload.publicVisibility ?? existingRecord.publicVisibility
        ),
        status: deriveCareRecordStatus(
          Object.prototype.hasOwnProperty.call(payload, "dueDate")
            ? payload.dueDate
            : existingRecord.dueDate
        ),
        documents: hasOwn(payload, "documents")
          ? normalizeLocalDocuments(
              payload.documents,
              payload.type ?? existingRecord.type
            )
          : existingRecord.documents,
        updatedAt: new Date().toISOString(),
      })
    : null;

  if (updatedRecord) {
    validateLocalCareIdentity(updatedRecord, records);
    validateLocalIncomingFulfillmentIntegrity(updatedRecord, records);
    writeStoredCollection(
      RECORD_STORAGE_KEY,
      records.map((record) =>
        record.id === recordId ? updatedRecord : record
      )
    );
  }

  return mockResponse(updatedRecord);
}

export async function deleteRecord(recordId: string) {
  if (canUseApi()) {
    await apiRequest<void>(`/api/v1/care-records/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
    });

    return apiResponse({ deleted: true });
  }

  await mockDelay();
  const records = getRecordCollection();
  const nextRecords = records
    .filter((record) => record.id !== recordId)
    .map((record) =>
      record.fulfillsCareRecordId === recordId
        ? { ...record, fulfillsCareRecordId: undefined }
        : record
    );
  writeStoredCollection(RECORD_STORAGE_KEY, nextRecords);

  return mockResponse({ deleted: records.length !== nextRecords.length });
}

export async function getPublicPetRecords(
  publicCode: string,
  options: { localPetId?: string; showCareBadges?: boolean } = {}
) {
  if (canUseApi()) {
    if (options.showCareBadges === false) {
      return apiResponse<PublicCareRecord[]>([]);
    }

    try {
      const response = await apiRequest<BackendPublicPetProfile>(
        `/api/v1/public/pets/${encodeURIComponent(publicCode)}`,
        { auth: false }
      );
      const records = (response.data?.careRecords ?? []).map(
        mapBackendPublicCareRecord
      );

      return apiResponse(records, response.meta);
    } catch (error) {
      if (isApiClientError(error) && [403, 404].includes(error.status)) {
        return apiResponse<PublicCareRecord[]>([]);
      }

      throw error;
    }
  }

  const petId = options.localPetId ?? publicCode;
  const records = getRecordCollection().filter((record) => record.petId === petId);

  return mockResponse(
    projectLocalPublicCareRecords(records, options.showCareBadges === true)
  );
}

export function getFriendlyRecordErrorMessage(error: unknown) {
  if (isApiClientError(error)) {
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

function normalizeCareName(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > 120) {
    throw new Error("Care name must be 120 characters or fewer.");
  }

  return normalized;
}

function normalizeOptionalId(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeProvider(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeLocalDocuments(
  documents: CareDocument[] | undefined,
  type: RecordType
): CareDocument[] {
  return (documents ?? [])
    .map((document, index) => ({
      id:
        document.id && !document.id.startsWith("draft-care-document-")
          ? document.id
          : `local-care-document-${Date.now()}-${index}`,
      fileName: document.fileName || document.sourceFile?.name || "Care document",
      contentType:
        document.contentType ||
        document.sourceFile?.type ||
        "application/octet-stream",
      fileSizeBytes: document.fileSizeBytes || document.sourceFile?.size || 0,
      category: document.sourceFile
        ? getCareDocumentCategory(type)
        : document.category ?? getCareDocumentCategory(type),
      sortOrder: index,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

async function prepareCareDocuments(
  petId: string,
  payload: RecordPayload
): Promise<{ documents: CareDocument[] | undefined; uploadedIds: string[] }> {
  if (!payload.documents) {
    return { documents: undefined, uploadedIds: [] };
  }

  const documents: CareDocument[] = [];
  const uploadedIds: string[] = [];

  for (const [index, document] of payload.documents.entries()) {
    if (!document.sourceFile) {
      documents.push({ ...document, sourceFile: undefined, sortOrder: index });
      continue;
    }

    try {
      const uploaded = await uploadMediaFile({
        file: document.sourceFile,
        category: getCareDocumentCategory(payload.type ?? "Other"),
        petId,
        cleanupOnFailure: true,
      });
      uploadedIds.push(uploaded.mediaId);
      documents.push({
        id: uploaded.mediaId,
        fileName: uploaded.originalFileName,
        contentType: uploaded.contentType,
        fileSizeBytes: uploaded.fileSizeBytes,
        category: getCareDocumentCategory(payload.type ?? "Other"),
        sortOrder: index,
      });
    } catch (error) {
      await cleanupUploadedDocuments(uploadedIds);
      const message =
        error instanceof Error ? error.message : "Please try this file again.";
      throw new Error(`Could not upload “${document.fileName}”. ${message}`);
    }
  }

  return { documents, uploadedIds };
}

async function cleanupUploadedDocuments(mediaIds: string[]) {
  await Promise.allSettled(mediaIds.map((mediaId) => deleteMedia(mediaId)));
}

function getCareDocumentCategory(type: RecordType) {
  return type === "Vaccine"
    ? ("VaccinationDocument" as const)
    : ("MedicalDocument" as const);
}

function requirePetIdForDocumentUpload(): never {
  throw new Error("Choose a pet before adding documents.");
}

function hasOwn(object: object, property: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function validateLocalCareIdentity(
  candidate: CareRecord,
  records: CareRecord[]
) {
  if (!candidate.fulfillsCareRecordId) {
    return;
  }

  if (candidate.fulfillsCareRecordId === candidate.id) {
    throw new Error("A care record cannot fulfil itself.");
  }

  const target = records.find(
    (record) =>
      record.id === candidate.fulfillsCareRecordId && !record.archivedAt
  );

  if (!target) {
    throw new Error("The care record to fulfil is not available.");
  }

  if (target.petId !== candidate.petId) {
    throw new Error("The care record to fulfil must belong to the same pet.");
  }

  if (target.type !== candidate.type) {
    throw new Error("The care record to fulfil must have the same care type.");
  }

  if (!target.dueDate) {
    throw new Error("Only a care record with a next due date can be fulfilled.");
  }

  if (
    records.some(
      (record) =>
        record.id !== candidate.id &&
        record.fulfillsCareRecordId === target.id
    )
  ) {
    throw new Error(
      "This care record has already been fulfilled by another record."
    );
  }

  const byId = new Map(records.map((record) => [record.id, record]));
  byId.set(candidate.id, candidate);
  const visited = new Set<string>();
  let current: CareRecord | undefined = target;

  while (current) {
    if (current.id === candidate.id || visited.has(current.id)) {
      throw new Error("This fulfilment would create a cycle between care records.");
    }

    visited.add(current.id);
    current = current.fulfillsCareRecordId
      ? byId.get(current.fulfillsCareRecordId)
      : undefined;
  }

  if (!isLocalTargetOlder(target, candidate)) {
    throw new Error("A care record can fulfil only an older care record.");
  }
}

function validateLocalIncomingFulfillmentIntegrity(
  target: CareRecord,
  records: CareRecord[]
) {
  const fulfillingRecord = records.find(
    (record) =>
      record.id !== target.id &&
      !record.archivedAt &&
      record.fulfillsCareRecordId === target.id
  );

  if (!fulfillingRecord) {
    return;
  }

  if (!target.dueDate) {
    throw new Error(
      "Clear the completing record's due-item selection before removing this next due date."
    );
  }

  if (fulfillingRecord.type !== target.type) {
    throw new Error(
      "Clear the completing record's due-item selection before changing this record type."
    );
  }
}

function isLocalTargetOlder(target: CareRecord, candidate: CareRecord) {
  const targetCreatedAt = target.createdAt
    ? Date.parse(target.createdAt)
    : Number.NaN;
  const candidateCreatedAt = candidate.createdAt
    ? Date.parse(candidate.createdAt)
    : Number.NaN;

  if (Number.isFinite(targetCreatedAt) && Number.isFinite(candidateCreatedAt)) {
    return targetCreatedAt < candidateCreatedAt;
  }

  const targetDate = careDateScore(target.date);
  const candidateDate = careDateScore(candidate.date);
  return targetDate === null || candidateDate === null || targetDate <= candidateDate;
}

export function buildBackendRecordPayload(
  payload: RecordPayload,
  {
    allowDueDateClear = false,
    allowIdentityClears = false,
  }: { allowDueDateClear?: boolean; allowIdentityClears?: boolean } = {}
) {
  const dueDate = toIsoDate(payload.dueDate);
  const dueDateWasProvided = hasOwn(payload, "dueDate");
  const careNameWasProvided = hasOwn(payload, "careName");
  const careName = careNameWasProvided
    ? normalizeCareName(payload.careName) ?? null
    : undefined;
  const fulfillsCareRecordIdWasProvided = hasOwn(
    payload,
    "fulfillsCareRecordId"
  );
  const fulfillsCareRecordId = fulfillsCareRecordIdWasProvided
    ? normalizeOptionalId(payload.fulfillsCareRecordId) ?? null
    : undefined;

  return {
    type: payload.type ? toBackendRecordType(payload.type) : undefined,
    title: payload.title,
    careName,
    ...(allowIdentityClears && careNameWasProvided && careName === null
      ? { clearCareName: true }
      : {}),
    date: toIsoDate(payload.date),
    dueDate,
    ...(allowDueDateClear && dueDateWasProvided && dueDate === null
      ? { clearDueDate: true }
      : {}),
    fulfillsCareRecordId,
    ...(allowIdentityClears &&
    fulfillsCareRecordIdWasProvided &&
    fulfillsCareRecordId === null
      ? { clearFulfillsCareRecordId: true }
      : {}),
    provider: payload.provider,
    notes: payload.notes,
    publicVisibility: payload.publicVisibility
      ? toBackendVisibility(payload.publicVisibility)
      : undefined,
    mediaFileIds: payload.documents
      ? [...payload.documents]
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((document) => document.id)
      : undefined,
  };
}

export function mapBackendRecord(record: BackendCareRecord): CareRecord {
  return {
    id: record.id,
    petId: record.petId,
    type: fromBackendRecordType(record.type),
    title: record.title,
    careName: normalizeCareName(record.careName ?? undefined),
    date: toDisplayDate(record.date),
    dueDate: record.dueDate ? toDisplayDate(record.dueDate) : undefined,
    fulfillsCareRecordId: record.fulfillsCareRecordId ?? undefined,
    provider: normalizeProvider(record.provider),
    notes: record.notes || "No notes added.",
    publicVisibility: fromBackendVisibility(record.publicVisibility),
    status: toFrontendStatus(record.derivedStatus),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt ?? undefined,
    documents: (record.documents ?? [])
      .map((document) => ({
        id: document.id,
        fileName: document.originalFileName,
        contentType: document.contentType,
        fileSizeBytes: document.fileSizeBytes,
        category: document.category,
        sortOrder: document.sortOrder,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

export function mapBackendPublicCareRecord(
  record: BackendPublicPetProfile["careRecords"][number]
): PublicCareRecord {
  return {
    type: fromBackendRecordType(record.type),
    recordDate: toDisplayDate(record.recordDate),
  };
}

export function projectLocalPublicCareRecords(
  records: CareRecord[],
  showCareBadges: boolean
): PublicCareRecord[] {
  if (!showCareBadges) {
    return [];
  }

  const latestByType = new Map<RecordType, CareRecord>();

  for (const record of records) {
    if (
      record.type === "Allergy" ||
      !isCareRecordPublic(record.publicVisibility)
    ) {
      continue;
    }

    const current = latestByType.get(record.type);
    if (!current || comparePublicCareRecency(record, current) < 0) {
      latestByType.set(record.type, record);
    }
  }

  return [...latestByType.values()]
    .sort((left, right) => {
      const dateDifference =
        publicCareDateScore(right.date) - publicCareDateScore(left.date);
      return dateDifference || compareOrdinal(left.type, right.type);
    })
    .map((record) => ({
      type: record.type,
      recordDate: record.date,
    }));
}

function comparePublicCareRecency(left: CareRecord, right: CareRecord) {
  const dateDifference =
    publicCareDateScore(right.date) - publicCareDateScore(left.date);
  return dateDifference || compareOrdinal(left.id, right.id);
}

function publicCareDateScore(value: string) {
  return careDateScore(value) ?? Number.MIN_SAFE_INTEGER;
}

function compareOrdinal(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toBackendRecordType(type: RecordType): BackendCareRecordType {
  switch (type) {
    case "Vet Visit":
      return "VetVisit";
    case "Lab Test":
      return "LabTest";
    default:
      return type;
  }
}

function fromBackendRecordType(type: string): RecordType {
  switch (type) {
    case "VetVisit":
      return "Vet Visit";
    case "LabTest":
      return "Lab Test";
    case "Vaccine":
    case "Deworming":
    case "Grooming":
    case "Medication":
    case "Allergy":
    case "Surgery":
    case "Other":
      return type;
    default:
      return "Other";
  }
}

function toBackendVisibility(
  visibility: CareRecord["publicVisibility"]
): BackendCareRecordPublicVisibility {
  switch (visibility) {
    case "Public badge only":
    case "Public details":
      return "PublicBadgeOnly";
    default:
      return "Private";
  }
}

function fromBackendVisibility(
  visibility: BackendCareRecordPublicVisibility
): CareRecord["publicVisibility"] {
  switch (visibility) {
    case "PublicBadgeOnly":
    case "PublicDetails":
      return "Public badge only";
    default:
      return "Private";
  }
}

function toFrontendStatus(value: string): CareRecord["status"] {
  return value === "overdue" || value === "due-soon" || value === "upcoming"
    ? value
    : "complete";
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
