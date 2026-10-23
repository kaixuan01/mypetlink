import {
  careDateScore,
  careDateScoreToIsoDate,
  getMalaysiaTodayIsoDate,
} from "@/lib/careRecordStatus";
import { CareDataContractError, isIsoCalendarDate } from "@/lib/careContracts";
import type {
  BackendWeeklyRecap,
  BackendWeeklyRecapDueCare,
  BackendWeeklyRecapLoggedCare,
  BackendWeeklyRecapMoment,
} from "@/services/apiDtos";
import type { WeeklyRecap, WeeklyRecapCareStatus } from "@/types";

/** Complete weeks before the current one that a recap can open. Mirrors the API. */
export const WEEKLY_RECAP_WEEKS_OF_HISTORY = 12;

/** Item lists the recap reads. Mirrors the API; totals are never capped. */
export const WEEKLY_RECAP_MOMENT_ITEMS = 50;
export const WEEKLY_RECAP_LOGGED_ITEMS = 20;
export const WEEKLY_RECAP_STILL_DUE_ITEMS = 10;
export const WEEKLY_RECAP_COMING_UP_ITEMS = 3;

/** Days after today still counted as "due soon". Mirrors the API. */
export const WEEKLY_RECAP_DUE_SOON_DAYS = 30;

const careStatuses = new Set<WeeklyRecapCareStatus>([
  "overdue",
  "due-today",
  "due-soon",
  "upcoming",
]);

/** A YYYY-MM-DD day moved by whole days; calendar arithmetic, no timezone. */
export function addIsoDays(isoDate: string, days: number) {
  const score = careDateScore(isoDate);
  if (score === null) return "";
  return careDateScoreToIsoDate(score + days);
}

export function isIsoMonday(isoDate: string) {
  const score = careDateScore(isoDate);
  // Day 0 of the epoch, 1 Jan 1970, was a Thursday.
  return score !== null && (((score + 3) % 7) + 7) % 7 === 0;
}

/** The Monday on or before a YYYY-MM-DD day. */
export function weekStartOf(isoDate: string) {
  const score = careDateScore(isoDate);
  if (score === null) return "";
  const mondayOffset = (((score + 3) % 7) + 7) % 7;
  return careDateScoreToIsoDate(score - mondayOffset);
}

/** The Monday of Malaysia's current week, whatever the browser's timezone. */
export function getMalaysiaWeekStart(now: Date = new Date()) {
  return weekStartOf(getMalaysiaTodayIsoDate(now));
}

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const longDayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const weekdayDayMonth = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function toUtcDate(isoDate: string) {
  const score = careDateScore(isoDate);
  return score === null ? null : new Date(score * 86_400_000);
}

/**
 * A week as people write it: "12–18 Oct 2026", "26 Oct – 1 Nov 2026",
 * "28 Dec 2026 – 3 Jan 2027". Empty when either day cannot be read.
 */
export function formatWeekRange(startIso: string, endIso: string) {
  const start = toUtcDate(startIso);
  const end = toUtcDate(endIso);
  if (!start || !end) return "";

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${dayMonthYear.format(start)} – ${dayMonthYear.format(end)}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
  }
  return `${start.getUTCDate()}–${dayMonthYear.format(end)}`;
}

/** The same week for a screen reader: "12 to 18 October". */
export function formatWeekRangeSpoken(startIso: string, endIso: string) {
  const start = toUtcDate(startIso);
  const end = toUtcDate(endIso);
  if (!start || !end) return "";
  return `${longDayMonth.format(start)} to ${longDayMonth.format(end)}`;
}

/** "Wed, 14 Oct". */
export function formatRecapDay(isoDate: string) {
  const date = toUtcDate(isoDate);
  return date ? weekdayDayMonth.format(date) : "";
}

/** "14 Oct 2026". */
export function formatRecapDate(isoDate: string) {
  const date = toUtcDate(isoDate);
  return date ? dayMonthYear.format(date) : "";
}

/** A due item's one status. Overdue is strictly before today. Mirrors the API. */
export function deriveRecapCareStatus(
  dueIso: string,
  todayIso: string
): WeeklyRecapCareStatus {
  const due = careDateScore(dueIso) ?? 0;
  const today = careDateScore(todayIso) ?? 0;
  if (due < today) return "overdue";
  if (due === today) return "due-today";
  return due <= today + WEEKLY_RECAP_DUE_SOON_DAYS ? "due-soon" : "upcoming";
}

export function getRecapCareStatusLabel(status: WeeklyRecapCareStatus) {
  switch (status) {
    case "overdue":
      return "Overdue";
    case "due-today":
      return "Due today";
    case "due-soon":
      return "Due soon";
    default:
      return "Upcoming";
  }
}

/** Nothing happened in the week: no Moments and no care logged. */
export function isQuietWeek(recap: WeeklyRecap) {
  return recap.moments.total === 0 && recap.care.logged.total === 0;
}

/**
 * The week a recap page should ask for, from its `week` query value. An
 * unreadable or out-of-range value asks for nothing, so the server's default
 * week opens instead of an error.
 */
export function resolveRequestedWeek(value: string | null | undefined, now: Date = new Date()) {
  if (!value || !isIsoCalendarDate(value) || !isIsoMonday(value)) return undefined;
  const latest = getMalaysiaWeekStart(now);
  const earliest = addIsoDays(latest, -7 * WEEKLY_RECAP_WEEKS_OF_HISTORY);
  return value >= earliest && value <= latest ? value : undefined;
}

// ---- Response contract ------------------------------------------------------

function fail(message: string): never {
  throw new CareDataContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseList<T>(
  raw: unknown,
  label: string,
  limit: number,
  parseItem: (item: unknown) => T
): { total: number; items: T[] } {
  if (!isRecord(raw)) fail(`${label} were not returned.`);
  if (!isCount(raw.total)) fail(`${label} have no valid total.`);
  if (!Array.isArray(raw.items)) fail(`${label} have no items.`);
  if (raw.items.length > Math.min(raw.total, limit)) {
    fail(`${label} hold more items than their total allows.`);
  }
  return { total: raw.total, items: raw.items.map(parseItem) };
}

function parseMoment(raw: unknown): BackendWeeklyRecapMoment {
  if (!isRecord(raw)) fail("A Moment is missing.");
  if (!isId(raw.id) || !isId(raw.primaryPetId)) fail("A Moment has no identity.");
  if (typeof raw.title !== "string" || typeof raw.primaryPetName !== "string") {
    fail("A Moment has no title.");
  }
  if (!isIsoCalendarDate(raw.date)) fail("A Moment has no valid date.");
  if (typeof raw.isPrimary !== "boolean" || typeof raw.hiddenByMyPetLink !== "boolean") {
    fail("A Moment has unreadable flags.");
  }
  if (typeof raw.visibility !== "string") fail("A Moment has no audience.");
  if (!isCount(raw.mediaCount)) fail("A Moment has no media count.");
  if (raw.preview !== undefined && raw.preview !== null) {
    const preview = raw.preview;
    if (!isRecord(preview) || !isId(preview.id) || typeof preview.url !== "string") {
      fail("A Moment has an unreadable preview.");
    }
  }
  return raw as BackendWeeklyRecapMoment;
}

function parseCareBase(raw: unknown) {
  if (!isRecord(raw)) fail("A care item is missing.");
  if (!isId(raw.id)) fail("A care item has no identity.");
  if (!isId(raw.type) || typeof raw.title !== "string") fail("A care item has no type or title.");
  if (raw.careName !== undefined && raw.careName !== null && typeof raw.careName !== "string") {
    fail("A care item has an unreadable care name.");
  }
  return raw;
}

function parseLogged(raw: unknown): BackendWeeklyRecapLoggedCare {
  const item = parseCareBase(raw);
  if (!isIsoCalendarDate(item.recordDate)) fail("A care log has no valid date.");
  if (typeof item.loggedAsDone !== "boolean") fail("A care log has an unreadable completion.");
  return item as BackendWeeklyRecapLoggedCare;
}

function parseDue(raw: unknown): BackendWeeklyRecapDueCare {
  const item = parseCareBase(raw);
  if (!isIsoCalendarDate(item.dueDate)) fail("A care item has no valid due date.");
  if (typeof item.status !== "string" || !careStatuses.has(item.status as WeeklyRecapCareStatus)) {
    fail("A care item has an unknown status.");
  }
  return item as BackendWeeklyRecapDueCare;
}

/**
 * Validates a recap response. A recap that does not hold together is a
 * failed read, never repaired with defaults: a guessed count is exactly how
 * a page could call a busy week quiet.
 */
export function parseWeeklyRecap(data: unknown): BackendWeeklyRecap {
  if (!isRecord(data)) fail("The recap was not returned.");
  if (!isId(data.petId) || typeof data.petName !== "string") fail("The recap has no pet.");
  for (const key of ["weekStart", "weekEnd", "asOfDate", "earliestWeekStart", "latestWeekStart"]) {
    if (!isIsoCalendarDate(data[key])) fail("The recap has no valid week.");
  }
  if (addIsoDays(data.weekStart as string, 6) !== data.weekEnd || !isIsoMonday(data.weekStart as string)) {
    fail("The recap's week is not a Monday-to-Sunday week.");
  }
  if (typeof data.isCurrentWeek !== "boolean") fail("The recap has no current-week flag.");

  const moments = data.moments;
  if (!isRecord(moments)) fail("The recap has no Moments.");
  const momentList = parseList(moments, "Moments", WEEKLY_RECAP_MOMENT_ITEMS, parseMoment);
  if (
    !isCount(moments.sharedPubliclyCount) ||
    !isCount(moments.onlyMeCount) ||
    moments.sharedPubliclyCount + moments.onlyMeCount !== momentList.total
  ) {
    fail("The recap's Moment counts do not add up.");
  }

  const care = data.care;
  if (!isRecord(care)) fail("The recap has no care.");
  if (typeof care.hasCareRecords !== "boolean") fail("The recap has no care coverage.");
  if (!isCount(care.overdueTotal)) fail("The recap has no overdue total.");
  const logged = parseList(care.logged, "Care logs", WEEKLY_RECAP_LOGGED_ITEMS, parseLogged);
  const stillDue = parseList(care.stillDue, "Due items", WEEKLY_RECAP_STILL_DUE_ITEMS, parseDue);
  const comingUp = parseList(care.comingUp, "Coming up items", WEEKLY_RECAP_COMING_UP_ITEMS, parseDue);
  if (stillDue.total > care.overdueTotal) fail("The recap's overdue counts do not add up.");

  return {
    petId: data.petId,
    petName: data.petName,
    weekStart: data.weekStart as string,
    weekEnd: data.weekEnd as string,
    asOfDate: data.asOfDate as string,
    isCurrentWeek: data.isCurrentWeek,
    earliestWeekStart: data.earliestWeekStart as string,
    latestWeekStart: data.latestWeekStart as string,
    moments: {
      total: momentList.total,
      sharedPubliclyCount: moments.sharedPubliclyCount,
      onlyMeCount: moments.onlyMeCount,
      items: momentList.items,
    },
    care: {
      hasCareRecords: care.hasCareRecords,
      logged,
      stillDue,
      overdueTotal: care.overdueTotal,
      comingUp,
    },
  };
}
