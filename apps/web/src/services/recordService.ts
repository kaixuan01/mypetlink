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
import { careDateScore, deriveCareRecordStatus } from "@/lib/careRecordStatus";
import {
  isCareRecordPublic,
  normalizeCareRecordVisibility,
} from "@/lib/careRecordVisibility";
import type {
  BackendCareRecord,
  BackendCareRecordPublicVisibility,
  BackendCareRecordType,
  BackendPublicPetProfile,
} from "@/services/apiDtos";
import type {
  ApiResponse,
  CareDocument,
  CareRecord,
  PublicCareRecord,
  RecordPayload,
  RecordType,
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

export async function createRecord(petId: string, payload: RecordPayload) {
  if (canUseApi()) {
    const prepared = await prepareCareDocuments(petId, payload);
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
      await cleanupUploadedDocuments(prepared.uploadedIds);
      throw error;
    }
  }

  await mockDelay();
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
    provider: payload.provider ?? "Owner recorded",
    notes: payload.notes ?? "No notes yet.",
    publicVisibility: normalizeCareRecordVisibility(payload.publicVisibility),
    status: deriveCareRecordStatus(payload.dueDate),
    documents: normalizeLocalDocuments(payload.documents, payload.type ?? "Other"),
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
      await cleanupUploadedDocuments(prepared.uploadedIds);
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
    provider: record.provider || "Owner recorded",
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
