import { mockRecords } from "@/data/mockRecords";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import { apiRequest, isApiClientError } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { deriveCareRecordStatus } from "@/lib/careRecordStatus";
import { normalizeCareRecordVisibility } from "@/lib/careRecordVisibility";
import type {
  BackendCareRecord,
  BackendCareRecordPublicVisibility,
  BackendCareRecordType,
  BackendPublicPetProfile,
} from "@/services/apiDtos";
import type {
  ApiResponse,
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
    publicVisibility: normalizeCareRecordVisibility(record.publicVisibility),
    status: deriveCareRecordStatus(record.dueDate),
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
    const response = await apiRequest<BackendCareRecord>(
      `/api/v1/pets/${encodeURIComponent(petId)}/care-records`,
      {
        method: "POST",
        body: buildBackendRecordPayload(payload),
      }
    );
    const record = response.data ? mapBackendRecord(response.data) : null;

    if (!record) {
      throw new Error("Care record was not returned after saving.");
    }

    return apiResponse(record, response.meta);
  }

  await mockDelay();
  const records = getRecordCollection();
  const record: CareRecord = {
    id: `rec_${Date.now()}`,
    petId,
    type: payload.type ?? "Other",
    title: payload.title ?? "New record",
    date: payload.date ?? "Today",
    dueDate: payload.dueDate,
    provider: payload.provider ?? "Owner recorded",
    notes: payload.notes ?? "No notes yet.",
    publicVisibility: normalizeCareRecordVisibility(payload.publicVisibility),
    status: deriveCareRecordStatus(payload.dueDate),
  };

  writeStoredCollection(RECORD_STORAGE_KEY, [record, ...records]);

  return mockResponse(record);
}

export async function updateRecord(recordId: string, payload: RecordPayload) {
  if (canUseApi()) {
    try {
      const response = await apiRequest<BackendCareRecord>(
        `/api/v1/care-records/${encodeURIComponent(recordId)}`,
        {
          method: "PUT",
          body: buildBackendRecordPayload(payload, { allowDueDateClear: true }),
        }
      );

      return apiResponse(
        response.data ? mapBackendRecord(response.data) : null,
        response.meta
      );
    } catch (error) {
      if (isApiClientError(error) && error.status === 404) {
        return apiResponse<CareRecord | null>(null);
      }

      throw error;
    }
  }

  await mockDelay();
  const records = getRecordCollection();
  const existingRecord = records.find((record) => record.id === recordId);
  const updatedRecord = existingRecord
    ? {
        ...existingRecord,
        ...payload,
        publicVisibility: normalizeCareRecordVisibility(
          payload.publicVisibility ?? existingRecord.publicVisibility
        ),
        status: deriveCareRecordStatus(
          Object.prototype.hasOwnProperty.call(payload, "dueDate")
            ? payload.dueDate
            : existingRecord.dueDate
        ),
      }
    : null;

  if (updatedRecord) {
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
  const nextRecords = records.filter((record) => record.id !== recordId);
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

export function buildBackendRecordPayload(
  payload: RecordPayload,
  { allowDueDateClear = false }: { allowDueDateClear?: boolean } = {}
) {
  const dueDate = toIsoDate(payload.dueDate);
  const dueDateWasProvided = Object.prototype.hasOwnProperty.call(
    payload,
    "dueDate"
  );

  return {
    type: payload.type ? toBackendRecordType(payload.type) : undefined,
    title: payload.title,
    date: toIsoDate(payload.date),
    dueDate,
    ...(allowDueDateClear && dueDateWasProvided && dueDate === null
      ? { clearDueDate: true }
      : {}),
    provider: payload.provider,
    notes: payload.notes,
    publicVisibility: payload.publicVisibility
      ? toBackendVisibility(payload.publicVisibility)
      : undefined,
  };
}

function mapBackendRecord(record: BackendCareRecord): CareRecord {
  return {
    id: record.id,
    petId: record.petId,
    type: fromBackendRecordType(record.type),
    title: record.title,
    date: toDisplayDate(record.date),
    dueDate: record.dueDate ? toDisplayDate(record.dueDate) : undefined,
    provider: record.provider || "Owner recorded",
    notes: record.notes || "No notes added.",
    publicVisibility: fromBackendVisibility(record.publicVisibility),
    status: toFrontendStatus(record.derivedStatus),
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

  return records
    .filter((record) => record.publicVisibility !== "Private")
    .map((record) => ({
      type: record.type,
      recordDate: record.date,
    }));
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
