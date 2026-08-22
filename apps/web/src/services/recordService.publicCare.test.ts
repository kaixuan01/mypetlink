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
    const projected = projectLocalPublicCareRecords(ownerRecords, true);

    expect(projected).toEqual([
      { type: "Vaccine", recordDate: "02 Sept 2026" },
      { type: "Grooming", recordDate: "03 Sept 2026" },
    ]);
    expect(JSON.stringify(projected)).not.toMatch(
      /title|notes|provider|dueDate|publicVisibility/i
    );
  });
});
