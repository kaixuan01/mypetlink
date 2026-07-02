import { mockRecords } from "@/data/mockRecords";
import {
  mockDelay,
  mockResponse,
  readStoredCollection,
  writeStoredCollection,
} from "@/services/mockApi";
import type { CareRecord, RecordPayload } from "@/types";

const RECORD_STORAGE_KEY = "mypetlink_records";

function getRecordCollection() {
  return readStoredCollection(RECORD_STORAGE_KEY, mockRecords).map(normalizeRecord);
}

function normalizeRecord(record: CareRecord): CareRecord {
  return {
    ...record,
    publicVisibility: record.publicVisibility ?? "Public badge only",
  };
}

export async function getPetRecords(petId: string) {
  await mockDelay();
  const records = getRecordCollection().filter((record) => record.petId === petId);
  return mockResponse(records, {
    page: 1,
    pageSize: records.length,
    total: records.length,
  });
}

export async function createRecord(petId: string, payload: RecordPayload) {
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
    publicVisibility: payload.publicVisibility ?? "Public badge only",
    status: "complete",
  };

  writeStoredCollection(RECORD_STORAGE_KEY, [record, ...records]);

  return mockResponse(record);
}

export async function updateRecord(recordId: string, payload: RecordPayload) {
  await mockDelay();
  const records = getRecordCollection();
  const existingRecord = records.find((record) => record.id === recordId);
  const updatedRecord = existingRecord
    ? {
        ...existingRecord,
        ...payload,
        publicVisibility:
          payload.publicVisibility ?? existingRecord.publicVisibility,
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
  await mockDelay();
  const records = getRecordCollection();
  const nextRecords = records.filter((record) => record.id !== recordId);
  writeStoredCollection(RECORD_STORAGE_KEY, nextRecords);

  return mockResponse({ deleted: records.length !== nextRecords.length });
}
