// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CareDataContractError } from "@/lib/careContracts";
import type { CareRecord, PetListItem, PetMoment } from "@/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  canUseApi: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => mocks.canUseApi(),
  isApiConfigured: () => mocks.canUseApi(),
}));
vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
  };
});

const { buildLocalWeeklyRecap, getWeeklyRecap } = await import("./weeklyRecapService");
const { ApiClientError } = await import("@/services/apiClient");

// Thursday 22 October 2026, 10:00 in Malaysia: this week is 19–25 October,
// last week 12–18 October.
const now = new Date("2026-10-22T02:00:00Z");

function pet(id: string, name: string, overrides: Partial<PetListItem> = {}): PetListItem {
  return {
    id,
    name,
    lifecycleStatus: "Active",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as PetListItem;
}

function moment(id: string, petId: string, date: string, overrides: Partial<PetMoment> = {}): PetMoment {
  return {
    id,
    petId,
    title: id,
    date,
    type: "Other",
    caption: "Secret caption",
    media: [],
    visibility: "Private",
    showOnPublicProfile: false,
    showInLifeTimeline: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function record(id: string, date: string, dueDate?: string, overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id,
    petId: "milo",
    type: "Vaccine",
    title: id,
    date,
    dueDate,
    provider: "Klinik Haiwan",
    notes: "Private note",
    publicVisibility: "Private",
    status: "upcoming",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const pets = [pet("milo", "Milo"), pet("oyen", "Oyen")];

describe("local Weekly Recap", () => {
  it("opens on the last complete week, or this week for a pet added this week", () => {
    const last = buildLocalWeeklyRecap({ pets, moments: [], records: [], petId: "milo", now });
    expect([last.weekStart, last.weekEnd, last.isCurrentWeek]).toEqual(["2026-10-12", "2026-10-18", false]);
    expect([last.earliestWeekStart, last.latestWeekStart]).toEqual(["2026-07-27", "2026-10-19"]);

    const fresh = buildLocalWeeklyRecap({
      pets: [pet("milo", "Milo", { createdAt: "2026-10-18T16:30:00.000Z" })],
      moments: [],
      records: [],
      petId: "milo",
      now,
    });
    expect([fresh.weekStart, fresh.isCurrentWeek]).toEqual(["2026-10-19", true]);
  });

  it("puts Moments in the Malaysia week they are about, counting days up to today", () => {
    const moments = [
      moment("sunday-before", "milo", "11 Oct 2026"),
      moment("monday", "milo", "12 Oct 2026", { visibility: "Public" }),
      moment("sunday", "milo", "18 Oct 2026"),
      moment("undated-monday", "milo", "Not set", { createdAt: "2026-10-11T16:00:00.000Z" }),
      moment("undated-before", "milo", "Not set", { createdAt: "2026-10-11T15:59:59.000Z" }),
      moment("today", "milo", "22 Oct 2026"),
      moment("tomorrow", "milo", "23 Oct 2026"),
    ];

    const last = buildLocalWeeklyRecap({ pets, moments, records: [], petId: "milo", now });
    const current = buildLocalWeeklyRecap({ pets, moments, records: [], petId: "milo", weekStart: "2026-10-19", now });

    // Same day: the newest written first, dated or not — as the API orders them.
    expect(last.moments.items.map((item) => item.id)).toEqual(["sunday", "undated-monday", "monday"]);
    expect([last.moments.total, last.moments.sharedPubliclyCount, last.moments.onlyMeCount]).toEqual([3, 1, 2]);
    expect(current.moments.items.map((item) => item.id)).toEqual(["today"]);
  });

  it("includes an own extra pet's Moment once, marked with its main pet", () => {
    const moments = [moment("together", "milo", "14 Oct 2026", { additionalPetIds: ["oyen"] })];

    const oyen = buildLocalWeeklyRecap({ pets, moments, records: [], petId: "oyen", now });

    expect(oyen.moments.total).toBe(1);
    expect(oyen.moments.items[0]).toMatchObject({ isPrimary: false, primaryPetName: "Milo" });
  });

  it("orders undated Moments by their Malaysia day before capping, as the API does", () => {
    // Same fixture as the API's OverTheCap_UndatedMomentsAreOrderedByTheirMalaysiaDayBeforeCapping.
    const minute = (base: string, minutes: number) =>
      new Date(Date.parse(base) + minutes * 60_000).toISOString();
    const moments = [
      ...Array.from({ length: 30 }, (_, index) =>
        moment(`mon-${index}`, "milo", "28 Dec 2026", { createdAt: minute("2026-12-01T00:00:00Z", index) })
      ),
      ...Array.from({ length: 25 }, (_, index) =>
        moment(`thu-${index}`, "milo", "31 Dec 2026", { createdAt: minute("2026-12-01T01:00:00Z", index) })
      ),
      moment("sunday", "milo", "03 Jan 2027", { createdAt: "2026-12-01T02:00:00.000Z" }),
      moment("sunday-legacy", "milo", "Not set", { createdAt: "2027-01-03T15:59:59.000Z" }),
      moment("new-year-legacy", "milo", "Not set", { createdAt: "2026-12-31T16:00:00.000Z" }),
      moment("eve-legacy", "milo", "Not set", { createdAt: "2026-12-31T15:59:59.000Z" }),
      moment("next-monday-legacy", "milo", "Not set", { createdAt: "2027-01-03T16:00:00.000Z" }),
      moment("sunday-before-legacy", "milo", "Not set", { createdAt: "2026-12-27T15:59:59.000Z" }),
    ];

    const recap = buildLocalWeeklyRecap({
      pets,
      moments,
      records: [],
      petId: "milo",
      now: new Date("2027-01-05T02:00:00Z"),
    });
    const ids = recap.moments.items.map((item) => item.id);

    expect(recap.weekStart).toBe("2026-12-28");
    expect(recap.moments.total).toBe(59);
    expect(ids).toHaveLength(50);
    expect(ids.slice(0, 4)).toEqual(["sunday-legacy", "sunday", "new-year-legacy", "eve-legacy"]);
    expect(recap.moments.items[2].date).toBe("2027-01-01");
    expect(recap.moments.items[3].date).toBe("2026-12-31");
    expect(ids.filter((id) => id.startsWith("thu-"))).toHaveLength(25);
    expect(ids.slice(29)).toEqual(Array.from({ length: 21 }, (_, index) => `mon-${29 - index}`));
  });

  it("keeps totals exact beyond the item list", () => {
    const moments = Array.from({ length: 63 }, (_, index) =>
      moment(`m${index}`, "milo", `${12 + (index % 7)} Oct 2026`)
    );

    const recap = buildLocalWeeklyRecap({ pets, moments, records: [], petId: "milo", now });

    expect(recap.moments.total).toBe(63);
    expect(recap.moments.items).toHaveLength(50);
  });

  it("splits due care at today, with one status each, and lists logged care", () => {
    const records = [
      record("target", "01 Sep 2026", "13 Oct 2026"),
      record("completion", "14 Oct 2026", undefined, { fulfillsCareRecordId: "target" }),
      record("missed", "01 Sep 2026", "16 Oct 2026"),
      record("older-missed", "01 Aug 2026", "01 Oct 2026"),
      record("yesterday", "01 Sep 2026", "21 Oct 2026"),
      record("due-today", "01 Sep 2026", "22 Oct 2026"),
      record("tomorrow", "01 Sep 2026", "23 Oct 2026"),
      record("archived", "15 Oct 2026", "24 Oct 2026", { archivedAt: "2026-10-20T00:00:00.000Z" }),
    ];

    const last = buildLocalWeeklyRecap({ pets, moments: [], records, petId: "milo", now });
    const current = buildLocalWeeklyRecap({ pets, moments: [], records, petId: "milo", weekStart: "2026-10-19", now });

    expect(last.care.logged.items.map((item) => [item.id, item.loggedAsDone])).toEqual([["completion", true]]);
    expect(last.care.stillDue.items.map((item) => [item.id, item.status])).toEqual([["missed", "overdue"]]);
    expect(last.care.overdueTotal).toBe(3);
    expect(current.care.stillDue.items.map((item) => item.id)).toEqual(["yesterday"]);
    expect(current.care.comingUp.items.map((item) => [item.id, item.status])).toEqual([
      ["due-today", "due-today"],
      ["tomorrow", "due-soon"],
    ]);
    expect(JSON.stringify(last)).not.toMatch(/Private note|Klinik Haiwan|Secret caption/);
  });

  it.each([
    ["another owner's pet", "rex", 404],
    ["a memorial pet", "bobo", 422],
  ])("refuses %s", (_label, petId, status) => {
    const allPets = [...pets, pet("bobo", "Bobo", { lifecycleStatus: "Memorial" })];
    try {
      buildLocalWeeklyRecap({ pets: allPets, moments: [], records: [], petId, now });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as InstanceType<typeof ApiClientError>).status).toBe(status);
    }
  });

  it.each(["2026-10-13", "2026-10-26", "2026-07-20"])("refuses the week %s", (weekStart) => {
    expect(() => buildLocalWeeklyRecap({ pets, moments: [], records: [], petId: "milo", weekStart, now })).toThrow(
      ApiClientError
    );
  });
});

describe("Weekly Recap from the API", () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.canUseApi.mockReturnValue(true);
  });

  it("asks for the pet and week without caching, and maps the response", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        petId: "pet-1",
        petName: "Milo",
        weekStart: "2026-10-12",
        weekEnd: "2026-10-18",
        asOfDate: "2026-10-22",
        isCurrentWeek: false,
        earliestWeekStart: "2026-07-27",
        latestWeekStart: "2026-10-19",
        moments: {
          total: 1,
          sharedPubliclyCount: 0,
          onlyMeCount: 1,
          items: [
            {
              id: "m1",
              primaryPetId: "pet-1",
              primaryPetName: "Milo",
              isPrimary: true,
              title: "Park",
              date: "2026-10-14",
              type: "Outdoor / Trip",
              visibility: "Private",
              hiddenByMyPetLink: false,
              preview: { id: "media-1", type: "image", url: "https://media.example.test/a_thumb.jpg" },
              mediaCount: 2,
            },
          ],
        },
        care: {
          hasCareRecords: true,
          logged: {
            total: 1,
            items: [{ id: "c1", type: "VetVisit", title: "Checkup", careName: null, recordDate: "2026-10-13", loggedAsDone: true }],
          },
          stillDue: { total: 0, items: [] },
          overdueTotal: 0,
          comingUp: {
            total: 1,
            items: [{ id: "c2", type: "LabTest", title: "Bloods", careName: "Panel", dueDate: "2026-10-22", status: "due-today" }],
          },
        },
      },
    });

    const recap = await getWeeklyRecap("pet-1", "2026-10-12");

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/v1/pets/pet-1/weekly-recap?weekStart=2026-10-12",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(recap.moments.items[0]).toMatchObject({ type: "Outdoor / Trip", visibility: "Private", preview: { type: "image" } });
    expect(recap.care.logged.items[0]).toMatchObject({ type: "Vet Visit", careName: undefined, loggedAsDone: true });
    expect(recap.care.comingUp.items[0]).toMatchObject({ type: "Lab Test", status: "due-today" });
  });

  it("asks for the default week when none is given", async () => {
    mocks.apiRequest.mockRejectedValue(new ApiClientError(503, "database_waking_up", "Busy"));

    await expect(getWeeklyRecap("pet-1")).rejects.toBeInstanceOf(ApiClientError);
    expect(mocks.apiRequest.mock.calls[0][0]).toBe("/api/v1/pets/pet-1/weekly-recap");
  });

  it("treats a recap that does not hold together as a failed read", async () => {
    mocks.apiRequest.mockResolvedValue({ data: { petId: "pet-1" } });

    await expect(getWeeklyRecap("pet-1")).rejects.toBeInstanceOf(CareDataContractError);
  });
});
