import { careDateScore } from "@/lib/careRecordStatus";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { sortedMedia } from "@/lib/momentMedia";
import { normalizeMomentVisibility } from "@/lib/momentVisibility";
import type {
  MomentMedia,
  PetMoment,
  UpcomingCareItem,
  UpcomingCareSummary,
} from "@/types";

/** Care rows the Dashboard shows: three where there is room, two on phones. */
export const DASHBOARD_CARE_ROWS = 3;
export const DASHBOARD_CARE_ROWS_COMPACT = 2;

/** Recent Moments the Dashboard shows: four where there is room, three on phones. */
export const DASHBOARD_RECENT_MOMENTS = 4;
export const DASHBOARD_RECENT_MOMENTS_COMPACT = 3;

/** Share of the private-Moment allowance at which a quiet note appears. */
export const PRIVATE_MOMENT_NOTE_RATIO = 0.8;

/**
 * What Care coming up can truthfully say for the pets in view, from one
 * consistent summary.
 *
 * - `unavailable`: the summary has nothing for this selection; say nothing
 *   reassuring.
 * - `no-records`: no active care record at all for these pets.
 * - `no-pending`: care is logged, but no due date is waiting — every dated
 *   item has been logged as done, or none was given a next date. It does not
 *   claim no dates were ever saved.
 * - `items`: pending care exists. When the summary is incomplete the section
 *   says so and never states an all-clear.
 */
export type DashboardCareView =
  | { kind: "unavailable" }
  | { kind: "no-records" }
  | { kind: "no-pending" }
  | {
      kind: "items";
      rows: UpcomingCareItem[];
      /** Every pending item for these pets. Exact, from the same read. */
      pendingCount: number;
      /** Overdue or due on or before the horizon. */
      dueWithinHorizon: number;
      /** The horizon's last day, e.g. "19 Nov"; empty if it cannot be read. */
      horizonLabel: string;
      complete: boolean;
    };

export function deriveDashboardCareView(
  summary: UpcomingCareSummary,
  scopePetId: string | null
): DashboardCareView {
  const scope = summary.scopes.find((item) => item.petId === scopePetId);
  if (!scope) {
    return { kind: "unavailable" };
  }

  if (summary.complete && scope.pendingCount === 0) {
    return scope.hasCareRecords ? { kind: "no-pending" } : { kind: "no-records" };
  }

  return {
    kind: "items",
    rows: scope.items.slice(0, DASHBOARD_CARE_ROWS),
    pendingCount: scope.pendingCount,
    dueWithinHorizon: scope.dueWithinHorizonCount,
    horizonLabel: formatCareDayLabel(summary.horizonDate, summary.asOfDate),
    complete: summary.complete,
  };
}

/**
 * A calendar day as "19 Nov", with the year only when it differs from the
 * reference day's. Empty when either day cannot be read, so no sentence is
 * ever built around a missing date.
 */
export function formatCareDayLabel(isoDate: string, referenceIsoDate: string) {
  const day = careDateScore(isoDate);
  const reference = careDateScore(referenceIsoDate);
  if (day === null || reference === null) return "";

  const date = new Date(day * 86_400_000);
  const referenceYear = new Date(reference * 86_400_000).getUTCFullYear();
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getUTCFullYear() !== referenceYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(date);
}

export type PetMomentsLoad =
  | { petId: string; status: "ok"; moments: PetMoment[]; total?: number }
  | { petId: string; status: "failed" };

export type RecentMomentsView = {
  moments: PetMoment[];
  /** Pets in view whose Moments could not be read. */
  failedPets: number;
  /** Pets in view whose Moments were read. */
  loadedPets: number;
};

/**
 * The newest Moments across the pets in view, by the date each is about.
 * Each pet's list arrives newest first, so the most recent Moments are always
 * in its first page; nothing here claims a complete week or a total.
 */
export function selectRecentMoments(
  loads: readonly PetMomentsLoad[],
  scopePetIds: readonly string[],
  limit = DASHBOARD_RECENT_MOMENTS
): RecentMomentsView {
  const scope = new Set(scopePetIds);
  const inScope = loads.filter((load) => scope.has(load.petId));
  const moments = inScope
    .flatMap((load) => (load.status === "ok" ? load.moments : []))
    .map((moment) => ({
      moment,
      score: careDateScore(moment.date) ?? Number.MIN_SAFE_INTEGER,
      created: moment.createdAt ? Date.parse(moment.createdAt) : Number.NaN,
    }))
    // The date a Moment is about first, as the owner's Moments list orders
    // it; then the newest written; then the id, so equal-date Moments from
    // different pets land in the same order whichever pet loaded first.
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareCreated(right.created, left.created) ||
        compareIds(left.moment.id, right.moment.id)
    )
    .slice(0, limit)
    .map((entry) => entry.moment);

  return {
    moments,
    failedPets: inScope.filter((load) => load.status === "failed").length,
    loadedPets: inScope.filter((load) => load.status === "ok").length,
  };
}

function compareCreated(left: number, right: number) {
  const leftKnown = Number.isFinite(left);
  const rightKnown = Number.isFinite(right);
  if (leftKnown && rightKnown) return left - right;
  // A Moment with a known creation time sorts ahead of one without.
  return Number(leftKnown) - Number(rightKnown);
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type MomentPreview =
  | { kind: "image"; media: MomentMedia }
  | { kind: "video"; media: MomentMedia }
  | { kind: "none" };

/**
 * The Moment's own cover, else its first item. Never a stand-in picture, and
 * never an image without a loadable address — that would be a broken tile.
 */
export function getMomentPreview(moment: PetMoment): MomentPreview {
  const media = sortedMedia(moment.media);
  const item =
    media.find((entry) => entry.id === moment.coverMediaId) ?? media[0];

  if (!item || !resolveMediaUrl(item.url)) return { kind: "none" };
  return item.type === "video"
    ? { kind: "video", media: item }
    : { kind: "image", media: item };
}

export type PrivateMomentNote = {
  petId: string;
  privateCount: number;
  limit: number;
};

/**
 * Pets close to their private-Moment allowance, from counts that are known to
 * be whole: a list that was not read, or was read only in part, never
 * produces a note.
 */
export function getPrivateMomentNotes(
  loads: readonly PetMomentsLoad[],
  scopePetIds: readonly string[],
  limit: number
): PrivateMomentNote[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const scope = new Set(scopePetIds);
  const threshold = Math.ceil(limit * PRIVATE_MOMENT_NOTE_RATIO);

  return loads.flatMap((load) => {
    if (
      !scope.has(load.petId) ||
      load.status !== "ok" ||
      load.total !== load.moments.length
    ) {
      return [];
    }

    // Counted as the service counts: this pet's own Moments that are not
    // shared publicly.
    const privateCount = load.moments.filter(
      (moment) =>
        moment.petId === load.petId &&
        normalizeMomentVisibility(moment.visibility) !== "Public"
    ).length;

    return privateCount >= threshold
      ? [{ petId: load.petId, privateCount, limit }]
      : [];
  });
}
