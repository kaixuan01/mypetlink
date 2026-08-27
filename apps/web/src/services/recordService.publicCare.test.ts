import { describe, expect, it } from "vitest";
import type { CareRecord } from "@/types";
import {
  mapBackendPublicCareRecord,
  projectLocalPublicCareRecords,
} from "./recordService";

const ownerRecords: CareRecord[] = [
  {
    id: "private-record",
    petId: "pet-milo",
    type: "Vet Visit",
    title: "Sensitive private visit",
    date: "01 Sept 2026",
    dueDate: "01 Sept 2027",
    provider: "Private clinic",
    notes: "Owner-only notes",
    publicVisibility: "Private",
    status: "complete",
  },
  {
    id: "badge-record",
    petId: "pet-milo",
    type: "Vaccine",
    title: "Annual vaccination",
    date: "02 Sept 2026",
    dueDate: "02 Sept 2027",
    provider: "Happy Paws",
    notes: "Sensitive vaccination notes",
    publicVisibility: "Public badge only",
    status: "complete",
  },
  {
    id: "legacy-details-record",
    petId: "pet-milo",
    type: "Grooming",
    title: "Legacy details",
    date: "03 Sept 2026",
    dueDate: "03 Oct 2026",
    provider: "Private groomer",
    notes: "Legacy notes",
    publicVisibility: "Public details",
    status: "complete",
  },
];

const invalidBoundaryRecords = [
  {
    ...ownerRecords[0],
    id: "corrupt-record",
    type: "Surgery",
    date: "04 Sept 2026",
    publicVisibility: "UnexpectedFutureValue",
  },
  {
    ...ownerRecords[0],
    id: "missing-record",
    type: "Medication",
    date: "05 Sept 2026",
    publicVisibility: undefined,
  },
] as unknown as CareRecord[];

describe("public Care mapping", () => {
  it("maps the API response to exactly type and recordDate", () => {
    const mapped = mapBackendPublicCareRecord({
      type: "VetVisit",
      recordDate: "2026-09-02",
    });

    expect(mapped).toEqual({
      type: "Vet Visit",
      recordDate: "02 Sept 2026",
    });
    expect(Object.keys(mapped).sort()).toEqual(["recordDate", "type"]);
  });

  it("fails closed when the local pet-level Care switch is off", () => {
    expect(projectLocalPublicCareRecords(ownerRecords, false)).toEqual([]);
  });

  it("projects only public type and record date in local mode", () => {
    const projected = projectLocalPublicCareRecords(
      [...ownerRecords, ...invalidBoundaryRecords],
      true
    );

    expect(projected).toEqual([
      { type: "Grooming", recordDate: "03 Sept 2026" },
      { type: "Vaccine", recordDate: "02 Sept 2026" },
    ]);
    expect(JSON.stringify(projected)).not.toMatch(
      /title|notes|provider|dueDate|publicVisibility/i
    );
    expect(projected.map((record) => record.type)).not.toContain("Surgery");
    expect(projected.map((record) => record.type)).not.toContain("Medication");
  });

  it("projects one latest entry per broad type from large unordered history", () => {
    const makeRecords = (
      count: number,
      type: CareRecord["type"],
      month: string
    ) =>
      Array.from({ length: count }, (_, index) => ({
        ...ownerRecords[1],
        id: `${type}-${String(index + 1).padStart(2, "0")}`,
        type,
        title: `${type} ${index + 1}`,
        date: `${String(index + 1).padStart(2, "0")} ${month} 2026`,
      }));
    const records = [
      ...makeRecords(20, "Vaccine", "Dec"),
      ...makeRecords(10, "Deworming", "Sept"),
      ...makeRecords(8, "Vet Visit", "Nov"),
      ...makeRecords(5, "Grooming", "Aug"),
      {
        ...ownerRecords[1],
        id: "legacy-allergy",
        type: "Allergy" as const,
        title: "Legacy allergy",
        date: "31 Dec 2026",
      },
    ].sort((left, right) => right.id.localeCompare(left.id));

    const projected = projectLocalPublicCareRecords(records, true);

    expect(projected).toEqual([
      { type: "Vaccine", recordDate: "20 Dec 2026" },
      { type: "Vet Visit", recordDate: "08 Nov 2026" },
      { type: "Deworming", recordDate: "10 Sept 2026" },
      { type: "Grooming", recordDate: "05 Aug 2026" },
    ]);
    expect(projected).toHaveLength(4);
    expect(projected.map((record) => record.type)).not.toContain("Allergy");
  });

  it("is independent of insertion order and deterministic when dates tie", () => {
    const records: CareRecord[] = [
      {
        ...ownerRecords[1],
        id: "vaccine-z",
        type: "Vaccine",
        title: "DHPP",
        date: "16 Oct 2026",
      },
      {
        ...ownerRecords[1],
        id: "vaccine-b",
        type: "Vaccine",
        title: "Rabies",
        date: "05 Dec 2026",
      },
      {
        ...ownerRecords[1],
        id: "vaccine-a",
        type: "Vaccine",
        title: "Leptospirosis",
        date: "05 Dec 2026",
      },
      {
        ...ownerRecords[1],
        id: "medication",
        type: "Medication",
        title: "Apoquel",
        date: "05 Dec 2026",
      },
    ];

    const forward = projectLocalPublicCareRecords(records, true);
    const reverse = projectLocalPublicCareRecords([...records].reverse(), true);

    expect(forward).toEqual(reverse);
    expect(forward).toEqual([
      { type: "Medication", recordDate: "05 Dec 2026" },
      { type: "Vaccine", recordDate: "05 Dec 2026" },
    ]);
    expect(JSON.stringify(forward)).not.toMatch(/DHPP|Rabies|Leptospirosis/);
  });
});
