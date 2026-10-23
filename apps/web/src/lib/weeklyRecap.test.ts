import { afterEach, describe, expect, it } from "vitest";
import { CareDataContractError } from "@/lib/careContracts";
import {
  addIsoDays,
  deriveRecapCareStatus,
  formatRecapDay,
  formatWeekRange,
  formatWeekRangeSpoken,
  getMalaysiaWeekStart,
  getRecapCareStatusLabel,
  isIsoMonday,
  parseWeeklyRecap,
  resolveRequestedWeek,
  weekStartOf,
} from "./weeklyRecap";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTimeZone;
});

function validRecap(overrides: Record<string, unknown> = {}) {
  return {
    petId: "pet_1",
    petName: "Milo",
    weekStart: "2026-10-12",
    weekEnd: "2026-10-18",
    asOfDate: "2026-10-22",
    isCurrentWeek: false,
    earliestWeekStart: "2026-07-27",
    latestWeekStart: "2026-10-19",
    moments: {
      total: 2,
      sharedPubliclyCount: 1,
      onlyMeCount: 1,
      items: [
        {
          id: "m1",
          primaryPetId: "pet_1",
          primaryPetName: "Milo",
          isPrimary: true,
          title: "Park",
          date: "2026-10-14",
          type: "Other",
          visibility: "Public",
          hiddenByMyPetLink: false,
          preview: { id: "media_1", type: "image", url: "https://media.example.test/a_thumb.jpg" },
          mediaCount: 1,
        },
      ],
    },
    care: {
      hasCareRecords: true,
      logged: { total: 0, items: [] },
      stillDue: { total: 0, items: [] },
      overdueTotal: 0,
      comingUp: {
        total: 1,
        items: [
          { id: "c1", type: "Vaccine", title: "Rabies", dueDate: "2026-10-22", status: "due-today" },
        ],
      },
    },
    ...overrides,
  };
}

describe("Malaysia weeks", () => {
  it.each([
    ["2026-10-19", "2026-10-19"],
    ["2026-10-22", "2026-10-19"],
    ["2026-10-25", "2026-10-19"],
    ["2027-01-01", "2026-12-28"],
    ["2028-02-29", "2028-02-28"],
  ])("puts %s in the week starting %s", (day, monday) => {
    expect(weekStartOf(day)).toBe(monday);
    expect(isIsoMonday(monday)).toBe(true);
  });

  it("switches weeks at midnight in Malaysia, whatever the browser's timezone", () => {
    for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kuala_Lumpur"]) {
      process.env.TZ = zone;
      expect(getMalaysiaWeekStart(new Date("2026-10-18T15:59:59Z"))).toBe("2026-10-12");
      expect(getMalaysiaWeekStart(new Date("2026-10-18T16:00:00Z"))).toBe("2026-10-19");
    }
  });

  it("does calendar arithmetic across months, years and leap days", () => {
    expect(addIsoDays("2026-10-26", 6)).toBe("2026-11-01");
    expect(addIsoDays("2026-12-28", 6)).toBe("2027-01-03");
    expect(addIsoDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addIsoDays("not a date", 1)).toBe("");
  });

  it.each([
    ["2026-10-12", "2026-10-18", "12–18 Oct 2026", "12 October to 18 October"],
    ["2026-10-26", "2026-11-01", "26 Oct – 1 Nov 2026", "26 October to 1 November"],
    ["2026-12-28", "2027-01-03", "28 Dec 2026 – 3 Jan 2027", "28 December to 3 January"],
  ])("labels %s to %s", (start, end, label, spoken) => {
    expect(formatWeekRange(start, end)).toBe(label);
    expect(formatWeekRangeSpoken(start, end)).toBe(spoken);
  });

  it("labels a day the same in every timezone", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(formatRecapDay("2026-10-14")).toBe("Wed 14 Oct");
  });

  it("accepts only a Monday inside the history window from the address bar", () => {
    const now = new Date("2026-10-22T02:00:00Z");
    expect(resolveRequestedWeek("2026-10-12", now)).toBe("2026-10-12");
    expect(resolveRequestedWeek("2026-10-19", now)).toBe("2026-10-19");
    expect(resolveRequestedWeek("2026-07-27", now)).toBe("2026-07-27");
    expect(resolveRequestedWeek("2026-07-20", now)).toBeUndefined();
    expect(resolveRequestedWeek("2026-10-26", now)).toBeUndefined();
    expect(resolveRequestedWeek("2026-10-13", now)).toBeUndefined();
    expect(resolveRequestedWeek("<script>", now)).toBeUndefined();
    expect(resolveRequestedWeek(null, now)).toBeUndefined();
  });
});

describe("recap care statuses", () => {
  it.each([
    ["2026-10-21", "overdue", "Overdue"],
    ["2026-10-22", "due-today", "Due today"],
    ["2026-10-23", "due-soon", "Due soon"],
    ["2026-11-21", "due-soon", "Due soon"],
    ["2026-11-22", "upcoming", "Upcoming"],
  ])("gives %s exactly one status", (due, status, label) => {
    const derived = deriveRecapCareStatus(due, "2026-10-22");
    expect(derived).toBe(status);
    expect(getRecapCareStatusLabel(derived)).toBe(label);
  });
});

describe("recap response contract", () => {
  it("accepts a recap that holds together", () => {
    expect(parseWeeklyRecap(validRecap()).moments.total).toBe(2);
  });

  it.each([
    ["a missing recap", null],
    ["a week that is not Monday to Sunday", validRecap({ weekEnd: "2026-10-19" })],
    ["a week that does not start on Monday", validRecap({ weekStart: "2026-10-13", weekEnd: "2026-10-19" })],
    [
      "Moment counts that do not add up",
      validRecap({ moments: { total: 2, sharedPubliclyCount: 2, onlyMeCount: 1, items: [] } }),
    ],
    [
      "more items than the total",
      validRecap({ moments: { total: 0, sharedPubliclyCount: 0, onlyMeCount: 0, items: validRecap().moments.items } }),
    ],
    [
      "an unknown care status",
      validRecap({
        care: {
          ...validRecap().care,
          comingUp: { total: 1, items: [{ id: "c1", type: "Vaccine", title: "Rabies", dueDate: "2026-10-22", status: "soon" }] },
        },
      }),
    ],
    [
      "more still-due items than overdue ones",
      validRecap({ care: { ...validRecap().care, stillDue: { total: 1, items: [] }, overdueTotal: 0 } }),
    ],
    ["a missing total", validRecap({ care: { ...validRecap().care, logged: { items: [] } } })],
  ])("refuses %s", (_label, raw) => {
    expect(() => parseWeeklyRecap(raw)).toThrow(CareDataContractError);
  });
});
