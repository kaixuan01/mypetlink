import { careDateScore } from "@/lib/careRecordStatus";
import type {
  BackendCareCompletionStatus,
  BackendCareRecord,
  BackendUpcomingCareRecord,
  BackendUpcomingCareRecords,
  BackendUpcomingCareScope,
  BackendUpcomingCareSummary,
} from "@/services/apiDtos";

/**
 * A care response that does not hold together. It is reported as a failed
 * read, never repaired with defaults: a guessed total or date is exactly how
 * a page could end up saying "nothing due" about data it never received.
 */
export class CareDataContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CareDataContractError";
  }
}

const pendingStatuses = new Set(["overdue", "due-soon", "upcoming"]);
const completionStates = new Set([
  "pending",
  "completed",
  "archived",
  "no-due-date",
  "pet-archived",
]);

/** The most items one summary scope carries. */
export const SUMMARY_ITEMS_PER_SCOPE = 3;

export function isIsoCalendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    careDateScore(value) !== null
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new CareDataContractError(message);
}

export function parseUpcomingCareRecord(raw: unknown): BackendUpcomingCareRecord {
  if (!isRecord(raw)) fail("A care item is missing.");
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.petId)) fail("A care item has no identity.");
  if (typeof raw.petName !== "string") fail("A care item has no pet name.");
  if (!isNonEmptyString(raw.type) || !isNonEmptyString(raw.title)) fail("A care item has no type or title.");
  if (raw.careName !== undefined && raw.careName !== null && typeof raw.careName !== "string") {
    fail("A care item has an unreadable care name.");
  }
  if (!isIsoCalendarDate(raw.dueDate)) fail("A care item has no valid due date.");
  if (typeof raw.derivedStatus !== "string" || !pendingStatuses.has(raw.derivedStatus)) {
    fail("A care item has an unknown status.");
  }

  return raw as BackendUpcomingCareRecord;
}

/**
 * Validates one page of the paged pending-care read against the page that
 * was asked for. The page must echo the requested position and size, carry a
 * whole non-negative total, and hold no more rows than that position allows.
 */
export function parseUpcomingCarePage(
  data: unknown,
  meta: { page?: number | null; pageSize?: number | null; total?: number | null } | undefined,
  expected: { page: number; pageSize: number }
): { data: BackendUpcomingCareRecords; total: number } {
  if (!isRecord(data)) fail("Care dates were not returned.");
  if (!isIsoCalendarDate(data.asOfDate)) fail("Care dates have no valid reference day.");
  if (!Array.isArray(data.petIdsWithCareRecords) || !data.petIdsWithCareRecords.every(isNonEmptyString)) {
    fail("Care dates have no pet coverage.");
  }
  if (!Array.isArray(data.items)) fail("Care dates have no items.");
  if (meta?.page !== expected.page || meta?.pageSize !== expected.pageSize) {
    fail("Care dates came back for a different page.");
  }
  if (!isNonNegativeInteger(meta.total)) fail("Care dates have no valid total.");

  const remaining = Math.max(0, meta.total - (expected.page - 1) * expected.pageSize);
  if (data.items.length > Math.min(expected.pageSize, remaining)) {
    fail("Care dates hold more items than their total allows.");
  }

  return {
    data: {
      asOfDate: data.asOfDate,
      petIdsWithCareRecords: data.petIdsWithCareRecords,
      items: data.items.map(parseUpcomingCareRecord),
    },
    total: meta.total,
  };
}

function parseScope(raw: unknown): BackendUpcomingCareScope {
  if (!isRecord(raw)) fail("A care summary scope is missing.");
  if (raw.petId !== null && !isNonEmptyString(raw.petId)) fail("A care summary scope has no pet.");
  if (typeof raw.hasCareRecords !== "boolean") fail("A care summary scope has no record coverage.");
  if (
    !isNonNegativeInteger(raw.pendingCount) ||
    !isNonNegativeInteger(raw.dueWithinHorizonCount) ||
    !isNonNegativeInteger(raw.overdueCount)
  ) {
    fail("A care summary scope has invalid counts.");
  }
  if (raw.overdueCount > raw.dueWithinHorizonCount || raw.dueWithinHorizonCount > raw.pendingCount) {
    fail("A care summary scope has counts that disagree.");
  }
  if (!raw.hasCareRecords && raw.pendingCount > 0) {
    fail("A care summary scope has pending care without care records.");
  }
  if (!Array.isArray(raw.items)) fail("A care summary scope has no items.");
  const items = raw.items.map(parseUpcomingCareRecord);
  if (items.length > Math.min(SUMMARY_ITEMS_PER_SCOPE, raw.pendingCount)) {
    fail("A care summary scope holds more items than it counts.");
  }
  if (raw.petId !== null && items.some((item) => item.petId !== raw.petId)) {
    fail("A care summary scope holds another pet's care.");
  }

  return { ...(raw as BackendUpcomingCareScope), items };
}

/**
 * The status a pending item must carry on `asOfDate`: before it, overdue; on
 * or before the horizon, due soon; after it, upcoming.
 */
function expectedPendingStatus(dueDate: string, asOf: number, horizon: number) {
  const due = careDateScore(dueDate) ?? Number.NaN;
  if (due < asOf) return "overdue";
  return due <= horizon ? "due-soon" : "upcoming";
}

function categoryTally(rows: BackendUpcomingCareRecord[]) {
  return {
    overdue: rows.filter((row) => row.derivedStatus === "overdue").length,
    dueSoon: rows.filter((row) => row.derivedStatus === "due-soon").length,
    later: rows.filter((row) => row.derivedStatus === "upcoming").length,
  };
}

/**
 * Validates the Dashboard's care summary as a whole, so nothing reassuring is
 * ever rendered from data that contradicts itself:
 *
 * - valid reference day and horizon, one all-pets scope, each pet at most once;
 * - every item's status agrees with its due date on the reference day;
 * - within a scope, items are unique and never outnumber what is counted in
 *   their category (overdue, due soon, later);
 * - every all-pets item belongs to a listed pet, and an item shown in two
 *   scopes is the same item in both;
 * - every known row — wherever it is shown — fits the counts of its own
 *   pet's scope, and all known rows together fit the all-pets counts, so an
 *   overdue row can never sit beside a pet scope that counts nothing due;
 * - pet counts add up to the all-pets counts;
 * - a complete summary shows as many items as it can, and a scope whose whole
 *   pending set is visible (three or fewer) counts exactly what it shows.
 *
 * An incomplete summary (too many pending items to read) is checked only for
 * what it does show: its counts are bounds, never recomputed from the sample.
 */
export function parseUpcomingCareSummary(raw: unknown): BackendUpcomingCareSummary {
  if (!isRecord(raw)) fail("The care summary was not returned.");
  if (!isIsoCalendarDate(raw.asOfDate) || !isIsoCalendarDate(raw.horizonDate)) {
    fail("The care summary has no valid dates.");
  }
  const asOf = careDateScore(raw.asOfDate) ?? 0;
  const horizon = careDateScore(raw.horizonDate) ?? 0;
  if (horizon < asOf) {
    fail("The care summary horizon is before its reference day.");
  }
  if (typeof raw.complete !== "boolean") fail("The care summary does not say whether it is complete.");
  if (!Array.isArray(raw.scopes)) fail("The care summary has no scopes.");

  const scopes = raw.scopes.map(parseScope);
  const all = scopes.filter((scope) => scope.petId === null);
  if (all.length !== 1) fail("The care summary needs exactly one all-pets scope.");
  const petScopes = scopes.filter((scope) => scope.petId !== null);
  const petIds = petScopes.map((scope) => scope.petId as string);
  if (new Set(petIds).size !== petIds.length) fail("The care summary repeats a pet.");

  const seen = new Map<string, BackendUpcomingCareRecord>();
  for (const scope of scopes) {
    const ids = scope.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) fail("A care summary scope repeats an item.");

    let overdue = 0;
    let dueSoon = 0;
    let later = 0;
    for (const item of scope.items) {
      if (item.derivedStatus !== expectedPendingStatus(item.dueDate, asOf, horizon)) {
        fail("A care item's status does not match its due date.");
      }
      if (item.derivedStatus === "overdue") overdue += 1;
      else if (item.derivedStatus === "due-soon") dueSoon += 1;
      else later += 1;

      if (scope.petId === null && !petIds.includes(item.petId)) {
        fail("A care item belongs to no listed pet.");
      }
      const copy = seen.get(item.id);
      if (copy && JSON.stringify(copy) !== JSON.stringify(item)) {
        fail("A care item differs between scopes.");
      }
      seen.set(item.id, item);
    }

    const dueSoonCount = scope.dueWithinHorizonCount - scope.overdueCount;
    const laterCount = scope.pendingCount - scope.dueWithinHorizonCount;
    if (overdue > scope.overdueCount || dueSoon > dueSoonCount || later > laterCount) {
      fail("A care summary scope shows more items than it counts.");
    }

    if (raw.complete) {
      if (scope.items.length !== Math.min(SUMMARY_ITEMS_PER_SCOPE, scope.pendingCount)) {
        fail("The care summary shows a different number of items than it counts.");
      }
      if (
        scope.pendingCount <= SUMMARY_ITEMS_PER_SCOPE &&
        (overdue !== scope.overdueCount || dueSoon !== dueSoonCount || later !== laterCount)
      ) {
        fail("The care summary's counts do not match the items it shows.");
      }
    }
  }

  // Rows are known from any scope that shows them. Each pet's known rows,
  // and all known rows together, must fit the counts that describe them.
  const fits = (rows: BackendUpcomingCareRecord[], scope: BackendUpcomingCareScope) => {
    const tally = categoryTally(rows);
    return (
      tally.overdue <= scope.overdueCount &&
      tally.dueSoon <= scope.dueWithinHorizonCount - scope.overdueCount &&
      tally.later <= scope.pendingCount - scope.dueWithinHorizonCount
    );
  };
  const known = [...seen.values()];
  for (const scope of petScopes) {
    if (!fits(known.filter((item) => item.petId === scope.petId), scope)) {
      fail("A care item contradicts its pet's counts.");
    }
  }
  if (!fits(known, all[0])) fail("The care summary shows more items than it counts.");

  const sum = (key: "pendingCount" | "dueWithinHorizonCount" | "overdueCount") =>
    petScopes.reduce((total, scope) => total + scope[key], 0);
  if (
    sum("pendingCount") !== all[0].pendingCount ||
    sum("dueWithinHorizonCount") !== all[0].dueWithinHorizonCount ||
    sum("overdueCount") !== all[0].overdueCount
  ) {
    fail("The care summary's pet counts do not add up.");
  }
  if (all[0].hasCareRecords !== petScopes.some((scope) => scope.hasCareRecords)) {
    fail("The care summary's record coverage does not add up.");
  }

  return {
    asOfDate: raw.asOfDate,
    horizonDate: raw.horizonDate,
    complete: raw.complete,
    scopes,
  };
}

function isOptionalIsoDate(value: unknown) {
  return value === null || value === undefined || isIsoCalendarDate(value);
}

function isOptionalTimestamp(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

/**
 * A care record from the owner's API, checked field by field rather than
 * trusted as a cast: identity, type, title, calendar dates, timestamps and
 * attached documents identified by their stored media ids. The document
 * collection is required: a missing one is not proof of no attachments.
 */
function parseCareRecordShape(raw: unknown, label: string): BackendCareRecord {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.petId)) {
    fail(`The ${label} record is missing.`);
  }
  if (!isNonEmptyString(raw.type) || typeof raw.title !== "string") {
    fail(`The ${label} record is incomplete.`);
  }
  if (!isOptionalIsoDate(raw.date) || !isOptionalIsoDate(raw.dueDate)) {
    fail(`The ${label} record has an invalid date.`);
  }
  if (
    typeof raw.createdAt !== "string" ||
    !Number.isFinite(Date.parse(raw.createdAt)) ||
    !isOptionalTimestamp(raw.archivedAt)
  ) {
    fail(`The ${label} record has an invalid timestamp.`);
  }
  if (raw.fulfillsCareRecordId !== null && raw.fulfillsCareRecordId !== undefined && !isNonEmptyString(raw.fulfillsCareRecordId)) {
    fail(`The ${label} record has an invalid link.`);
  }
  if (!Array.isArray(raw.documents)) fail(`The ${label} record's documents are missing.`);
  const ids = raw.documents.map((document) =>
    isRecord(document) && isNonEmptyString(document.id) ? document.id : fail(`The ${label} record has an unidentified document.`)
  );
  if (new Set(ids).size !== ids.length) fail(`The ${label} record repeats a document.`);
  return raw as BackendCareRecord;
}

/**
 * Validates a completion status for the item that was asked about.
 *
 * - The target is the requested record.
 * - A completing record, when present, is active, belongs to the same pet and
 *   fulfils exactly this target.
 * - The state agrees with the records, in the service's precedence (archived,
 *   pet archived, no due date, completed, pending): `completed` has a
 *   completing record and an available, dated target; `pending` has a dated
 *   target and no completing record; `archived` has an archived target;
 *   `no-due-date` has an available, undated target. `archived`,
 *   `pet-archived` and `no-due-date` may carry a completing record that landed
 *   late — it is shown, never treated as a normal completion.
 */
export function parseCareCompletionStatus(
  raw: unknown,
  requestedRecordId: string
): BackendCareCompletionStatus {
  if (!isRecord(raw)) fail("The completion status was not returned.");
  if (typeof raw.state !== "string" || !completionStates.has(raw.state)) {
    fail("The completion status is unknown.");
  }
  if (!isIsoCalendarDate(raw.asOfDate)) fail("The completion status has no valid reference day.");
  if (typeof raw.petName !== "string") fail("The completion status has no pet name.");
  const target = parseCareRecordShape(raw.target, "due");
  if (target.id !== requestedRecordId) fail("The completion status is for a different item.");
  const completion =
    raw.completion === null || raw.completion === undefined
      ? null
      : parseCareRecordShape(raw.completion, "completing");

  if (completion) {
    if (completion.id === target.id) fail("A record cannot complete itself.");
    if (completion.fulfillsCareRecordId !== target.id || completion.petId !== target.petId) {
      fail("The completing record does not belong to this due item.");
    }
    if (completion.archivedAt) fail("The completing record is not active.");
  }

  const targetArchived = Boolean(target.archivedAt);
  const hasDueDate = Boolean(target.dueDate);
  switch (raw.state) {
    case "completed":
      if (!completion || targetArchived || !hasDueDate) {
        fail("A completed item must have an available, dated target and its completing record.");
      }
      break;
    case "pending":
      if (completion || targetArchived || !hasDueDate) fail("A pending item must be available, dated and not completed.");
      break;
    case "no-due-date":
      if (targetArchived || hasDueDate) fail("An undated item must be available and undated.");
      break;
    case "archived":
      if (!targetArchived) fail("An archived item must be archived.");
      break;
    case "pet-archived":
      if (targetArchived) fail("A deleted item must be reported as archived first.");
      break;
  }

  return { state: raw.state, asOfDate: raw.asOfDate, petName: raw.petName, target, completion };
}
