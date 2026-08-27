import type { CareRecord } from "@/types";

export type CareRecordEffectiveStatus = CareRecord["status"] | "fulfilled";

export type FulfillmentCandidateContext = {
  petId: string;
  type: CareRecord["type"] | "";
  recordDate?: string;
  currentRecordId?: string;
  currentCreatedAt?: string;
};

export const CARE_RECORD_DUE_SOON_DAYS = 30;

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const monthNames = [
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
];

export function deriveCareRecordStatus(
  dueDate?: string | null,
  now = new Date()
): CareRecord["status"] {
  const dueDay = careDateScore(dueDate);
  if (dueDay === null) return "complete";

  const today = malaysiaTodayScore(now);
  if (dueDay < today) return "overdue";
  if (dueDay <= today + CARE_RECORD_DUE_SOON_DAYS) return "due-soon";
  return "upcoming";
}

export function getCareRecordStatusLabel(
  record: Pick<CareRecord, "dueDate" | "status">,
  now = new Date()
) {
  if (record.status === "overdue") return "Overdue";

  const dueDay = careDateScore(record.dueDate);
  if (dueDay !== null && dueDay === malaysiaTodayScore(now)) return "Due today";
  if (record.status === "due-soon") return "Due soon";
  if (record.status === "upcoming") return "Upcoming";
  return "Complete";
}

export function getExplicitlyFulfilledCareRecordIds(records: CareRecord[]) {
  return new Set(
    records
      .filter(isActiveCareRecord)
      .map((record) => record.fulfillsCareRecordId)
      .filter((recordId): recordId is string => Boolean(recordId))
  );
}

export function getEffectiveCareRecordStatus(
  record: CareRecord,
  records: CareRecord[]
): CareRecordEffectiveStatus {
  return getExplicitlyFulfilledCareRecordIds(records).has(record.id)
    ? "fulfilled"
    : record.status;
}

export function getEffectiveCareRecordStatusLabel(
  record: Pick<CareRecord, "dueDate" | "status">,
  effectiveStatus: CareRecordEffectiveStatus,
  now = new Date()
) {
  return effectiveStatus === "fulfilled"
    ? "Completed"
    : getCareRecordStatusLabel(record, now);
}

export function getEligibleFulfillmentCandidates(
  records: CareRecord[],
  context: FulfillmentCandidateContext,
  now = new Date()
) {
  if (!context.type) {
    return [];
  }

  const claimedTargetIds = new Set(
    records
      .filter(
        (record) =>
          isActiveCareRecord(record) && record.id !== context.currentRecordId
      )
      .map((record) => record.fulfillsCareRecordId)
      .filter((recordId): recordId is string => Boolean(recordId))
  );

  return records
    .filter(
      (record) =>
        isActiveCareRecord(record) &&
        record.id !== context.currentRecordId &&
        record.petId === context.petId &&
        record.type === context.type &&
        careDateScore(record.dueDate) !== null &&
        !claimedTargetIds.has(record.id) &&
        targetPrecedesFulfiller(record, context, now)
    )
    .sort((left, right) => dashboardDateScore(left) - dashboardDateScore(right));
}

export function selectDashboardCareRecords(
  records: CareRecord[],
  limit = 3
) {
  if (limit <= 0) return [];

  const fulfilledRecordIds = getExplicitlyFulfilledCareRecordIds(records);
  const dueRecords = records.filter(
    (record) =>
      !fulfilledRecordIds.has(record.id) &&
      careDateScore(record.dueDate) !== null
  );
  const overdue = dueRecords
    .filter((record) => record.status === "overdue")
    .sort((a, b) => dashboardDateScore(b) - dashboardDateScore(a));
  const currentAndFuture = dueRecords
    .filter((record) => record.status !== "overdue")
    .sort((a, b) => dashboardDateScore(a) - dashboardDateScore(b));
  const selected: CareRecord[] = [];

  // Keep the most recently overdue item visible, then protect space for the
  // nearest current/future care. If no future care exists, fill with overdue
  // items from most recently missed to oldest.
  if (overdue.length) selected.push(overdue.shift()!);
  selected.push(...currentAndFuture.splice(0, limit - selected.length));
  selected.push(...overdue.splice(0, limit - selected.length));

  return selected;
}

export function careDateScore(value?: string | null) {
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const display = value.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);
  const year = iso ? Number(iso[1]) : display ? Number(display[3]) : NaN;
  const month = iso
    ? Number(iso[2])
    : display
      ? monthNames.indexOf(
          `${display[2].slice(0, 1).toUpperCase()}${display[2]
            .slice(1, 3)
            .toLowerCase()}`
        ) + 1
      : NaN;
  const day = iso ? Number(iso[3]) : display ? Number(display[1]) : NaN;

  if (!isValidCalendarDate(year, month, day)) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / millisecondsPerDay);
}

function dashboardDateScore(record: CareRecord) {
  return careDateScore(record.dueDate) ?? Number.MAX_SAFE_INTEGER;
}

function isActiveCareRecord(record: CareRecord) {
  return !record.archivedAt;
}

function targetPrecedesFulfiller(
  target: CareRecord,
  context: FulfillmentCandidateContext,
  now: Date
) {
  const targetCreatedAt = target.createdAt
    ? Date.parse(target.createdAt)
    : Number.NaN;
  const fulfillerCreatedAt = context.currentRecordId
    ? context.currentCreatedAt
      ? Date.parse(context.currentCreatedAt)
      : Number.NaN
    : now.getTime();

  if (Number.isFinite(targetCreatedAt) && Number.isFinite(fulfillerCreatedAt)) {
    return targetCreatedAt < fulfillerCreatedAt;
  }

  const targetRecordDate = careDateScore(target.date);
  const fulfillerRecordDate = careDateScore(context.recordDate);
  return (
    targetRecordDate === null ||
    fulfillerRecordDate === null ||
    targetRecordDate <= fulfillerRecordDate
  );
}

function malaysiaTodayScore(now: Date) {
  const values = getMalaysiaCalendarDateParts(now);
  return Math.floor(
    Date.UTC(values.year, values.month - 1, values.day) / millisecondsPerDay
  );
}

export function getMalaysiaCalendarDateParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (![year, month, day].every(Number.isInteger)) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
