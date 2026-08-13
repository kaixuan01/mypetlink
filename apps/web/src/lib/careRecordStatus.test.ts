import { describe, expect, it } from "vitest";
import type { CareRecord } from "@/types";
import {
  deriveCareRecordStatus,
  getCareRecordStatusLabel,
  selectDashboardCareRecords,
} from "./careRecordStatus";

const malaysiaMorning = new Date("2026-08-13T01:00:00Z");

describe("care record status", () => {
  it.each([
    ["2024-06-10", "overdue"],
    ["2026-08-12", "overdue"],
    ["2026-08-13", "due-soon"],
    ["2026-08-14", "due-soon"],
    ["2026-09-12", "due-soon"],
    ["2026-09-13", "upcoming"],
    ["2027-08-13", "upcoming"],
    [undefined, "complete"],
  ] as const)("classifies %s as %s", (dueDate, expected) => {
    expect(deriveCareRecordStatus(dueDate, malaysiaMorning)).toBe(expected);
  });

  it("uses the Malaysia calendar day across the UTC midnight boundary", () => {
    const dueDate = "2026-08-12";

    expect(
      deriveCareRecordStatus(dueDate, new Date("2026-08-12T15:59:00Z"))
    ).toBe("due-soon");
    expect(
      deriveCareRecordStatus(dueDate, new Date("2026-08-12T16:01:00Z"))
    ).toBe("overdue");
  });

  it("uses accurate owner-facing labels for today and overdue dates", () => {
    expect(
      getCareRecordStatusLabel(
        record("today", "2026-08-13", "due-soon"),
        malaysiaMorning
      )
    ).toBe("Due today");
    expect(
      getCareRecordStatusLabel(
        record("past", "2026-08-12", "overdue"),
        malaysiaMorning
      )
    ).toBe("Overdue");
  });

  it("keeps one recent overdue item visible without hiding imminent care", () => {
    const selected = selectDashboardCareRecords([
      record("very-old", "2024-01-01", "overdue"),
      record("recent-overdue", "2026-08-12", "overdue"),
      record("today", "2026-08-13", "due-soon"),
      record("soon", "2026-08-16", "due-soon"),
      record("future", "2027-01-01", "upcoming"),
    ]);

    expect(selected.map((item) => item.id)).toEqual([
      "recent-overdue",
      "today",
      "soon",
    ]);
  });

  it("fills the dashboard with recent overdue items when no future care exists", () => {
    const selected = selectDashboardCareRecords([
      record("oldest", "2024-01-01", "overdue"),
      record("newest", "2026-08-12", "overdue"),
      record("middle", "2026-07-01", "overdue"),
      record("complete", undefined, "complete"),
    ]);

    expect(selected.map((item) => item.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });
});

function record(
  id: string,
  dueDate: string | undefined,
  status: CareRecord["status"]
): CareRecord {
  return {
    id,
    petId: "pet-1",
    type: "Other",
    title: id,
    date: "01 Jan 2026",
    dueDate,
    provider: "Owner recorded",
    notes: "",
    publicVisibility: "Private",
    status,
  };
}
