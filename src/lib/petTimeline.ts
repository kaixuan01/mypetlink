import type {
  MomentType,
  MomentVisibility,
  Pet,
  PetMoment,
  PublicPetProfile,
} from "@/types";

// Single source of truth for the Life Timeline shown in BOTH the owner portal
// (/pets/:id/timeline) and the public profile (/p/:slug). Both call
// buildPetTimeline so they can never drift apart; the public profile simply
// filters to the publicly-allowed items via getPublicTimeline.

export type TimelineSource = "auto" | "moment";
export type TimelineGroup = "birth" | "adoption" | "moment";

export type PetTimelineItem = {
  id: string;
  title: string;
  date: string;
  description?: string;
  /** Moment category label; undefined for auto milestones. */
  typeLabel?: string;
  source: TimelineSource;
  group: TimelineGroup;
  /** Visibility for moment items (owner-only badge). */
  visibility?: MomentVisibility;
  /** Whether this item is allowed on the public profile (ignores the section toggle). */
  isPublic: boolean;
  /** Linked moment id, for owner "edit" routing. */
  momentId?: string;
  sortValue: number;
};

type TimelinePet = Pick<
  Pet | PublicPetProfile,
  "name" | "birthday" | "adoptionDay" | "visibility"
>;

const MONTHS = [
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

// Moment categories that mean "the day the pet joined the family", i.e. the
// same milestone as the auto adoption-day item.
const ADOPTION_EQUIVALENT_TYPES: MomentType[] = ["First Day Home", "Adoption Day"];

/** Turn a display date ("18 Aug 2021", "Estimated 2021", "2021") into a sortable number. */
export function parseTimelineDate(value: string): number {
  const text = (value ?? "").trim();

  const full = text.match(/^(\d{1,2}) ([A-Za-z]{3,}) (\d{4})$/);
  if (full) {
    const [, day, month, year] = full;
    const monthIndex = MONTHS.indexOf(month.slice(0, 3));
    if (monthIndex >= 0) {
      return new Date(Number(year), monthIndex, Number(day)).getTime();
    }
  }

  // Year-only or "Estimated YYYY": sort to the start of that year.
  const yearOnly = text.match(/(\d{4})/);
  if (yearOnly) {
    return new Date(Number(yearOnly[1]), 0, 1).getTime();
  }

  return Number.MAX_SAFE_INTEGER;
}

function hasDate(value?: string): boolean {
  const text = (value ?? "").trim();
  return Boolean(text) && text.toLowerCase() !== "not set";
}

function momentGroup(type: MomentType): TimelineGroup {
  return ADOPTION_EQUIVALENT_TYPES.includes(type) ? "adoption" : "moment";
}

/**
 * Build the full, ordered Life Timeline for a pet from its birthday/adoption
 * details and the moments marked "Show in Life Timeline". Auto and moment items
 * are merged, de-duplicated, and sorted oldest-first.
 *
 * Pass ALL moments on the owner side; pass only public moments on the public
 * side (private moments must never reach the public client).
 */
export function buildPetTimeline(
  pet: TimelinePet,
  moments: PetMoment[]
): PetTimelineItem[] {
  const visibility = pet.visibility;
  const items: PetTimelineItem[] = [];

  const timelineMoments = (moments ?? []).filter(
    (moment) => moment.showInLifeTimeline
  );

  // Auto birthday milestone.
  if (hasDate(pet.birthday)) {
    items.push({
      id: "auto-birth",
      title: `${pet.name} was born`,
      date: pet.birthday,
      description: /estimat/i.test(pet.birthday)
        ? "Estimated birth year."
        : undefined,
      source: "auto",
      group: "birth",
      isPublic: visibility.showBirthdayOnTimeline,
      sortValue: parseTimelineDate(pet.birthday),
    });
  }

  // Auto adoption milestone — skipped when an owner-created adoption/first-day
  // moment shares the same date (prefer the user's moment, hide the duplicate).
  if (hasDate(pet.adoptionDay)) {
    const adoptionSort = parseTimelineDate(pet.adoptionDay);
    const duplicateMoment = timelineMoments.find(
      (moment) =>
        momentGroup(moment.type) === "adoption" &&
        parseTimelineDate(moment.date) === adoptionSort
    );

    if (!duplicateMoment) {
      items.push({
        id: "auto-adoption",
        title: `${pet.name} came home`,
        date: pet.adoptionDay,
        description: `The day ${pet.name} joined the family.`,
        source: "auto",
        group: "adoption",
        isPublic: visibility.showAdoptionDayOnTimeline,
        sortValue: adoptionSort,
      });
    }
  }

  // Moment items.
  for (const moment of timelineMoments) {
    items.push({
      id: `moment-${moment.id}`,
      momentId: moment.id,
      title: moment.title,
      date: moment.date,
      description: moment.timelineNote?.trim() || moment.caption || undefined,
      typeLabel: moment.type,
      source: "moment",
      group: momentGroup(moment.type),
      visibility: moment.visibility,
      isPublic: moment.visibility === "Public",
      sortValue: parseTimelineDate(moment.date),
    });
  }

  return items.sort((a, b) => a.sortValue - b.sortValue);
}

/**
 * Public-facing timeline: the same items as buildPetTimeline, filtered to what
 * the owner allows publicly. Returns [] when the Life Timeline section is off.
 */
export function getPublicTimeline(
  pet: TimelinePet,
  publicMoments: PetMoment[]
): PetTimelineItem[] {
  if (!pet.visibility.showTimeline) {
    return [];
  }

  return buildPetTimeline(pet, publicMoments).filter((item) => item.isPublic);
}

/** Whether an item currently appears on the public profile (owner-side badge). */
export function isItemPubliclyShown(
  item: PetTimelineItem,
  pet: TimelinePet
): boolean {
  return pet.visibility.showTimeline && item.isPublic;
}
