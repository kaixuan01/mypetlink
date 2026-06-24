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
  return readStoredCollection(RECORD_STORAGE_KEY, mockRecords);
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
    status: "complete",
  };

  writeStoredCollection(RECORD_STORAGE_KEY, [record, ...records]);

  return mockResponse(record);
}
