import {
  careDateScore,
  careDateScoreToIsoDate,
  getMalaysiaTodayIsoDate,
} from "@/lib/careRecordStatus";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { sortedMedia } from "@/lib/momentMedia";
import { normalizeMomentVisibility } from "@/lib/momentVisibility";
import { isActivePet } from "@/lib/petLifecycle";
import {
  addIsoDays,
  deriveRecapCareStatus,
  getMalaysiaWeekStart,
  isIsoMonday,
  parseWeeklyRecap,
  WEEKLY_RECAP_COMING_UP_ITEMS,
  WEEKLY_RECAP_LOGGED_ITEMS,
  WEEKLY_RECAP_MOMENT_ITEMS,
  WEEKLY_RECAP_STILL_DUE_ITEMS,
  WEEKLY_RECAP_WEEKS_OF_HISTORY,
} from "@/lib/weeklyRecap";
import { ApiClientError, apiRequest } from "@/services/apiClient";
import { canUseApi } from "@/services/apiConfig";
import { mockDelay } from "@/services/mockApi";
import { fromBackendMomentType, getPetMoments } from "@/services/momentService";
import { getPets } from "@/services/petService";
import { fromBackendRecordType, getPetRecords } from "@/services/recordService";
import type { BackendWeeklyRecap } from "@/services/apiDtos";
import type {
  CareRecord,
  PetListItem,
  PetMoment,
  WeeklyRecap,
  WeeklyRecapDueCare,
  WeeklyRecapMoment,
} from "@/types";

/**
 * One owned pet's week. Without `weekStart`, the server chooses: the last
 * complete week, or this week for a pet added this week. Refusals arrive as
 * `ApiClientError`s — 404 for a pet that is not the owner's, 422
 * `weekly_recap_unavailable` for a memorial or archived pet, 400 for a week
 * outside the rules.
 */
export async function getWeeklyRecap(
  petId: string,
  weekStart?: string,
  options: { signal?: AbortSignal } = {}
): Promise<WeeklyRecap> {
  if (canUseApi()) {
    const query = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
    const response = await apiRequest<BackendWeeklyRecap>(
      `/api/v1/pets/${encodeURIComponent(petId)}/weekly-recap${query}`,
      { cache: "no-store", signal: options.signal }
    );
    return mapBackendWeeklyRecap(parseWeeklyRecap(response.data));
  }

  await mockDelay();
  const pets = (await getPets()).data;
  const moments = (await Promise.all(pets.map((pet) => getPetMoments(pet.id)))).flatMap(
    (response) => response.data
  );
  const records = (await getPetRecords(petId)).data;
  return buildLocalWeeklyRecap({ pets, moments, records, petId, weekStart });
}

export function mapBackendWeeklyRecap(recap: BackendWeeklyRecap): WeeklyRecap {
  return {
    petId: recap.petId,
    petName: recap.petName,
    weekStart: recap.weekStart,
    weekEnd: recap.weekEnd,
    asOfDate: recap.asOfDate,
    isCurrentWeek: recap.isCurrentWeek,
    earliestWeekStart: recap.earliestWeekStart,
    latestWeekStart: recap.latestWeekStart,
    moments: {
      total: recap.moments.total,
      sharedPubliclyCount: recap.moments.sharedPubliclyCount,
      onlyMeCount: recap.moments.onlyMeCount,
      items: recap.moments.items.map((moment) => ({
        id: moment.id,
        primaryPetId: moment.primaryPetId,
        primaryPetName: moment.primaryPetName,
        isPrimary: moment.isPrimary,
        title: moment.title,
        date: moment.date,
        type: fromBackendMomentType(moment.type),
        visibility: moment.visibility === "Public" ? "Public" : "Private",
        hiddenByMyPetLink: moment.hiddenByMyPetLink,
        preview:
          moment.preview && resolveMediaUrl(moment.preview.url)
            ? {
                id: moment.preview.id,
                type: moment.preview.type === "video" ? "video" : "image",
                url: moment.preview.url,
              }
            : undefined,
        mediaCount: moment.mediaCount,
      })),
    },
    care: {
      hasCareRecords: recap.care.hasCareRecords,
      logged: {
        total: recap.care.logged.total,
        items: recap.care.logged.items.map((item) => ({
          id: item.id,
          type: fromBackendRecordType(item.type),
          title: item.title,
          careName: item.careName ?? undefined,
          recordDate: item.recordDate,
          loggedAsDone: item.loggedAsDone,
        })),
      },
      stillDue: {
        total: recap.care.stillDue.total,
        items: recap.care.stillDue.items.map(mapDue),
      },
      overdueTotal: recap.care.overdueTotal,
      comingUp: {
        total: recap.care.comingUp.total,
        items: recap.care.comingUp.items.map(mapDue),
      },
    },
  };
}

function mapDue(item: BackendWeeklyRecap["care"]["comingUp"]["items"][number]): WeeklyRecapDueCare {
  return {
    id: item.id,
    type: fromBackendRecordType(item.type),
    title: item.title,
    careName: item.careName ?? undefined,
    dueDate: item.dueDate,
    status: item.status as WeeklyRecapDueCare["status"],
  };
}

// ---- Local preview ----------------------------------------------------------

type LocalWeeklyRecapInput = {
  pets: PetListItem[];
  moments: PetMoment[];
  records: CareRecord[];
  petId: string;
  weekStart?: string;
  now?: Date;
};

/**
 * The API's recap rules applied to local data, so the preview without a
 * connection behaves like the real thing: the same weeks, the same Moment
 * membership and the same care lists and statuses.
 */
export function buildLocalWeeklyRecap({
  pets,
  moments,
  records,
  petId,
  weekStart,
  now = new Date(),
}: LocalWeeklyRecapInput): WeeklyRecap {
  const pet = pets.find((item) => item.id === petId);
  if (!pet) {
    throw new ApiClientError(404, "not_found", "Pet was not found.");
  }
  if (!isActivePet(pet)) {
    throw new ApiClientError(
      422,
      "weekly_recap_unavailable",
      "Weekly recaps are available for active pets only."
    );
  }

  const today = getMalaysiaTodayIsoDate(now);
  const latestWeekStart = getMalaysiaWeekStart(now);
  const earliestWeekStart = addIsoDays(latestWeekStart, -7 * WEEKLY_RECAP_WEEKS_OF_HISTORY);
  const createdOn = pet.createdAt ? getMalaysiaTodayIsoDate(new Date(pet.createdAt)) : "";
  const start =
    weekStart ??
    (createdOn && createdOn >= latestWeekStart ? latestWeekStart : addIsoDays(latestWeekStart, -7));
  const weekError = !isIsoMonday(start)
    ? "A week starts on a Monday."
    : start > latestWeekStart
      ? "That week has not started yet."
      : start < earliestWeekStart
        ? `Weekly recaps go back ${WEEKLY_RECAP_WEEKS_OF_HISTORY} weeks.`
        : null;
  if (weekError) {
    throw new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
      weekStart: [weekError],
    });
  }

  const end = addIsoDays(start, 6);
  const lastDay = end < today ? end : today;
  const ownedPetNames = new Map(pets.map((item) => [item.id, item.name]));

  const weekMoments = moments
    .filter(
      (moment) =>
        ownedPetNames.has(moment.petId) &&
        (moment.petId === petId || (moment.additionalPetIds ?? []).includes(petId))
    )
    .map((moment) => ({ moment, date: localMomentDate(moment) }))
    .filter(({ date }) => date !== "" && date >= start && date <= lastDay)
    .sort(
      (left, right) =>
        compare(right.date, left.date) ||
        compare(right.moment.createdAt ?? "", left.moment.createdAt ?? "") ||
        compare(left.moment.id, right.moment.id)
    );
  const sharedPubliclyCount = weekMoments.filter(
    ({ moment }) => normalizeMomentVisibility(moment.visibility) === "Public"
  ).length;

  const activeRecords = records.filter((record) => record.petId === petId && !record.archivedAt);
  const fulfilled = new Set(
    activeRecords.map((record) => record.fulfillsCareRecordId).filter(Boolean)
  );
  const pending = activeRecords
    .map((record) => ({ record, due: toIso(record.dueDate) }))
    .filter((entry) => entry.due !== "" && !fulfilled.has(entry.record.id))
    .sort(
      (left, right) =>
        compare(left.due, right.due) ||
        compare(left.record.createdAt ?? "", right.record.createdAt ?? "") ||
        compare(left.record.id, right.record.id)
    );
  const logged = activeRecords
    .map((record) => ({ record, date: toIso(record.date) }))
    .filter(({ date }) => date !== "" && date >= start && date <= lastDay)
    .sort(
      (left, right) =>
        compare(right.date, left.date) ||
        compare(right.record.createdAt ?? "", left.record.createdAt ?? "") ||
        compare(left.record.id, right.record.id)
    );
  const stillDue = pending.filter(({ due }) => due >= start && due <= end && due < today);
  const comingUp = pending.filter(({ due }) => due >= today);
  const dueItem = ({ record, due }: { record: CareRecord; due: string }): WeeklyRecapDueCare => ({
    id: record.id,
    type: record.type,
    title: record.title,
    careName: record.careName,
    dueDate: due,
    status: deriveRecapCareStatus(due, today),
  });

  return {
    petId,
    petName: pet.name,
    weekStart: start,
    weekEnd: end,
    asOfDate: today,
    isCurrentWeek: start === latestWeekStart,
    earliestWeekStart,
    latestWeekStart,
    moments: {
      total: weekMoments.length,
      sharedPubliclyCount,
      onlyMeCount: weekMoments.length - sharedPubliclyCount,
      items: weekMoments
        .slice(0, WEEKLY_RECAP_MOMENT_ITEMS)
        .map(({ moment, date }): WeeklyRecapMoment => {
          const media = sortedMedia(moment.media).filter((item) => resolveMediaUrl(item.url));
          const cover = media.find((item) => item.id === moment.coverMediaId) ?? media[0];
          return {
            id: moment.id,
            primaryPetId: moment.petId,
            primaryPetName: ownedPetNames.get(moment.petId) ?? "",
            isPrimary: moment.petId === petId,
            title: moment.title,
            date,
            type: moment.type,
            visibility: normalizeMomentVisibility(moment.visibility) === "Public" ? "Public" : "Private",
            hiddenByMyPetLink: false,
            preview: cover ? { id: cover.id, type: cover.type, url: cover.url ?? "" } : undefined,
            mediaCount: moment.media.length,
          };
        }),
    },
    care: {
      hasCareRecords: activeRecords.length > 0,
      logged: {
        total: logged.length,
        items: logged.slice(0, WEEKLY_RECAP_LOGGED_ITEMS).map(({ record, date }) => ({
          id: record.id,
          type: record.type,
          title: record.title,
          careName: record.careName,
          recordDate: date,
          loggedAsDone: Boolean(record.fulfillsCareRecordId),
        })),
      },
      stillDue: {
        total: stillDue.length,
        items: stillDue.slice(0, WEEKLY_RECAP_STILL_DUE_ITEMS).map(dueItem),
      },
      overdueTotal: pending.filter(({ due }) => due < today).length,
      comingUp: {
        total: comingUp.length,
        items: comingUp.slice(0, WEEKLY_RECAP_COMING_UP_ITEMS).map(dueItem),
      },
    },
  };
}

/** The day a Moment is about; an undated one falls back to the Malaysia day it was written. */
function localMomentDate(moment: PetMoment) {
  const dated = toIso(moment.date);
  if (dated) return dated;
  return moment.createdAt ? getMalaysiaTodayIsoDate(new Date(moment.createdAt)) : "";
}

function toIso(value?: string | null) {
  const score = careDateScore(value);
  return score === null ? "" : careDateScoreToIsoDate(score);
}

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
