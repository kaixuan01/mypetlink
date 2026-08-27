import { describe, expect, it } from "vitest";
import type { CareRecord } from "@/types";
import {
  deriveCareRecordStatus,
  getEffectiveCareRecordStatus,
  getEffectiveCareRecordStatusLabel,
  getEligibleFulfillmentCandidates,
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

  it("classifies and selects September display dates instead of treating them as complete", () => {
    const septemberStatus = deriveCareRecordStatus(
      "02 Sept 2026",
      malaysiaMorning
    );
    const septemberRecord = record(
      "september-care",
      "02 Sept 2026",
      septemberStatus
    );

    expect(septemberStatus).toBe("due-soon");
    expect(septemberStatus).not.toBe("complete");
    expect(selectDashboardCareRecords([septemberRecord])).toEqual([
      septemberRecord,
    ]);
    expect(deriveCareRecordStatus("15 Sept 2026", malaysiaMorning)).toBe(
      "upcoming"
    );
    expect(deriveCareRecordStatus("12 Oct 2026", malaysiaMorning)).toBe(
      "upcoming"
    );
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

  it("marks only an explicitly linked target Completed and keeps its due date", () => {
    const target = {
      ...record("dhpp-2022", "2022-10-15", "overdue"),
      type: "Vaccine" as const,
      careName: "DHPP",
      date: "2022-09-24",
      createdAt: "2022-09-24T01:00:00Z",
    };
    const fulfiller = {
      ...record("dhpp-fulfiller", undefined, "complete"),
      type: "Vaccine" as const,
      careName: "DHPP",
      date: "2022-10-16",
      fulfillsCareRecordId: target.id,
      createdAt: "2022-10-16T01:00:00Z",
    };

    const effectiveStatus = getEffectiveCareRecordStatus(target, [
      target,
      fulfiller,
    ]);

    expect(effectiveStatus).toBe("fulfilled");
    expect(getEffectiveCareRecordStatusLabel(target, effectiveStatus)).toBe(
      "Completed"
    );
    expect(target.dueDate).toBe("2022-10-15");
    expect(selectDashboardCareRecords([target, fulfiller])).toEqual([]);
  });

  it("never infers fulfilment from matching names, broad types, or later dates", () => {
    const dhpp = {
      ...record("dhpp", "2026-08-01", "overdue"),
      type: "Vaccine" as const,
      careName: "DHPP",
      date: "2025-08-01",
    };
    const sameName = {
      ...record("same-name", undefined, "complete"),
      type: "Vaccine" as const,
      careName: "DHPP",
      date: "2026-08-02",
    };
    const rabies = {
      ...sameName,
      id: "rabies",
      careName: "Rabies",
    };
    const apoquel = {
      ...record("apoquel", "2026-08-01", "overdue"),
      type: "Medication" as const,
      careName: "Apoquel",
    };
    const amoxicillin = {
      ...sameName,
      id: "amoxicillin",
      type: "Medication" as const,
      careName: "Amoxicillin",
    };

    expect(getEffectiveCareRecordStatus(dhpp, [dhpp, sameName])).toBe(
      "overdue"
    );
    expect(getEffectiveCareRecordStatus(dhpp, [dhpp, rabies])).toBe("overdue");
    expect(getEffectiveCareRecordStatus(apoquel, [apoquel, amoxicillin])).toBe(
      "overdue"
    );
  });

  it("reopens a target when its relationship is cleared or its fulfiller is inactive", () => {
    const target = record("target", "2026-08-01", "overdue");
    const fulfiller = {
      ...record("fulfiller", undefined, "complete"),
      fulfillsCareRecordId: target.id,
    };

    expect(getEffectiveCareRecordStatus(target, [target, fulfiller])).toBe(
      "fulfilled"
    );
    expect(
      getEffectiveCareRecordStatus(target, [
        target,
        { ...fulfiller, fulfillsCareRecordId: undefined },
      ])
    ).toBe("overdue");
    expect(
      getEffectiveCareRecordStatus(target, [
        target,
        { ...fulfiller, archivedAt: "2026-08-20T00:00:00Z" },
      ])
    ).toBe("overdue");
    expect(getEffectiveCareRecordStatus(target, [target])).toBe("overdue");
  });

  it("offers only active same-type older due items while retaining the current target", () => {
    const target = {
      ...record("target", "2026-10-15", "upcoming"),
      type: "Vaccine" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const otherCandidate = {
      ...target,
      id: "other-candidate",
      dueDate: "2026-11-15",
    };
    const wrongType = { ...target, id: "wrong-type", type: "Medication" as const };
    const archived = {
      ...target,
      id: "archived",
      archivedAt: "2026-06-01T00:00:00Z",
    };
    const noDueDate = { ...target, id: "no-due", dueDate: undefined };
    const current = {
      ...record("current", undefined, "complete"),
      type: "Vaccine" as const,
      fulfillsCareRecordId: target.id,
      createdAt: "2026-08-01T00:00:00Z",
    };
    const anotherClaim = {
      ...current,
      id: "another-claim",
      fulfillsCareRecordId: otherCandidate.id,
    };

    const candidates = getEligibleFulfillmentCandidates(
      [target, otherCandidate, wrongType, archived, noDueDate, current, anotherClaim],
      {
        petId: "pet-1",
        type: "Vaccine",
        currentRecordId: current.id,
        currentCreatedAt: current.createdAt,
      }
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual([target.id]);
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
