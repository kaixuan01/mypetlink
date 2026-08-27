import { describe, expect, it } from "vitest";
import {
  fromCareRecordAudience,
  toCareRecordAudience,
} from "@/lib/careRecordVisibility";
import {
  buildBackendRecordPayload,
  mapBackendRecord,
  normalizeCareRecordVisibility,
} from "./recordService";

describe("care record date request mapping", () => {
  it("preserves the existing API date properties", () => {
    expect(
      buildBackendRecordPayload({
        type: "Grooming",
        date: "15 Jul 2026",
        dueDate: "15 Aug 2026",
      })
    ).toMatchObject({
      type: "Grooming",
      date: "2026-07-15",
      dueDate: "2026-08-15",
    });
  });

  it("maps Sep, Sept, and normal three-letter display months to ISO", () => {
    expect(
      buildBackendRecordPayload({
        date: "02 Sept 2020",
        dueDate: "15 Sep 2027",
      })
    ).toMatchObject({
      date: "2020-09-02",
      dueDate: "2027-09-15",
    });
    expect(buildBackendRecordPayload({ date: "12 Oct 2023" }).date).toBe(
      "2023-10-12"
    );
  });

  it("marks an explicitly cleared next date on update", () => {
    expect(
      buildBackendRecordPayload(
        { dueDate: undefined },
        { allowDueDateClear: true }
      )
    ).toMatchObject({ dueDate: null, clearDueDate: true });
  });

  it("does not clear the next date for an unrelated partial update", () => {
    const payload = buildBackendRecordPayload(
      { title: "Updated title" },
      { allowDueDateClear: true }
    );

    expect(payload).not.toHaveProperty("clearDueDate");
  });

  it("round-trips care identity and emits explicit update clears", () => {
    expect(
      buildBackendRecordPayload({
        careName: "  Annual booster  ",
        fulfillsCareRecordId: "target-id",
      })
    ).toMatchObject({
      careName: "Annual booster",
      fulfillsCareRecordId: "target-id",
    });

    expect(
      buildBackendRecordPayload(
        { careName: undefined, fulfillsCareRecordId: undefined },
        { allowIdentityClears: true }
      )
    ).toMatchObject({
      careName: null,
      clearCareName: true,
      fulfillsCareRecordId: null,
      clearFulfillsCareRecordId: true,
    });

    const unrelated = buildBackendRecordPayload(
      { title: "Updated" },
      { allowIdentityClears: true }
    );
    expect(unrelated).not.toHaveProperty("clearCareName");
    expect(unrelated).not.toHaveProperty("clearFulfillsCareRecordId");
  });

  it("maps care identity from the owner API without deriving it from title", () => {
    const mapped = mapBackendRecord({
      id: "record-id",
      petId: "pet-id",
      type: "Vaccine",
      title: "Unrelated display title",
      careName: "Rabies booster",
      date: "2026-08-20",
      dueDate: null,
      fulfillsCareRecordId: "target-id",
      provider: null,
      notes: null,
      publicVisibility: "Private",
      derivedStatus: "complete",
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
      archivedAt: null,
    });

    expect(mapped.careName).toBe("Rabies booster");
    expect(mapped.fulfillsCareRecordId).toBe("target-id");
    expect(mapped.careName).not.toBe(mapped.title);
  });

  it("normalizes legacy public-details compatibility values to badge-only", () => {
    expect(normalizeCareRecordVisibility("Private")).toBe("Private");
    expect(normalizeCareRecordVisibility("Public badge only")).toBe(
      "Public badge only"
    );
    expect(normalizeCareRecordVisibility("Public details")).toBe(
      "Public badge only"
    );
    expect(
      buildBackendRecordPayload({ publicVisibility: "Public details" })
        .publicVisibility
    ).toBe("PublicBadgeOnly");
  });

  it("maps the two owner audiences without producing PublicDetails", () => {
    expect(toCareRecordAudience("Private")).toBe("Private");
    expect(toCareRecordAudience("Public badge only")).toBe("Public");
    expect(toCareRecordAudience("Public details")).toBe("Public");
    expect(fromCareRecordAudience("Private")).toBe("Private");
    expect(fromCareRecordAudience("Public")).toBe("Public badge only");
    expect(
      buildBackendRecordPayload({
        publicVisibility: fromCareRecordAudience("Public"),
      }).publicVisibility
    ).toBe("PublicBadgeOnly");
  });
});
