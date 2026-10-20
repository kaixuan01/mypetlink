import { describe, expect, it } from "vitest";
import {
  deriveDashboardCareView,
  formatCareDayLabel,
  getMomentPreview,
  getPrivateMomentNotes,
  selectRecentMoments,
  type PetMomentsLoad,
} from "@/lib/dashboardHome";
import { ownerRoutes } from "@/lib/routes";
import type {
  PetMoment,
  UpcomingCareItem,
  UpcomingCareScope,
  UpcomingCareSummary,
} from "@/types";

function item(id: string, petId: string, status: UpcomingCareItem["status"], dueDate: string): UpcomingCareItem {
  return {
    id,
    petId,
    petName: petId,
    type: "Vaccine",
    title: id,
    dueDate,
    dueDateIso: "2026-10-20",
    status,
  };
}

function scope(petId: string | null, overrides: Partial<UpcomingCareScope> = {}): UpcomingCareScope {
  return {
    petId,
    hasCareRecords: false,
    pendingCount: 0,
    dueWithinHorizonCount: 0,
    overdueCount: 0,
    items: [],
    ...overrides,
  };
}

function summary(scopes: UpcomingCareScope[], overrides: Partial<UpcomingCareSummary> = {}): UpcomingCareSummary {
  return {
    asOfDate: "2026-10-20",
    horizonDate: "2026-11-19",
    complete: true,
    scopes,
    ...overrides,
  };
}

function moment(id: string, petId: string, date: string, extra: Partial<PetMoment> = {}): PetMoment {
  return {
    id,
    petId,
    title: id,
    date,
    type: "Other",
    caption: "",
    media: [],
    visibility: "Private",
    showOnPublicProfile: false,
    showInLifeTimeline: false,
    ...extra,
  };
}

describe("deriveDashboardCareView", () => {
  it("tells no care at all apart from nothing pending, and never claims dates were never saved", () => {
    expect(deriveDashboardCareView(summary([scope(null)]), null).kind).toBe("no-records");
    expect(
      deriveDashboardCareView(summary([scope(null, { hasCareRecords: true })]), null).kind
    ).toBe("no-pending");
  });

  it("is unavailable for a pet the summary does not cover, instead of empty", () => {
    expect(deriveDashboardCareView(summary([scope(null)]), "pet-x").kind).toBe("unavailable");
  });

  it("uses the chosen scope's exact counts and items", () => {
    const rows = [item("a1", "a", "due-soon", "21 Oct 2026"), item("a2", "a", "upcoming", "01 Jan 2027")];
    const view = deriveDashboardCareView(
      summary([
        scope(null, { hasCareRecords: true, pendingCount: 5, dueWithinHorizonCount: 2, items: rows }),
        scope("a", { hasCareRecords: true, pendingCount: 2, dueWithinHorizonCount: 1, items: rows }),
      ]),
      "a"
    );
    expect(view).toMatchObject({ kind: "items", pendingCount: 2, dueWithinHorizon: 1, horizonLabel: "19 Nov", complete: true });
  });

  it("never turns an incomplete summary into an empty answer", () => {
    const view = deriveDashboardCareView(
      summary([scope(null, { hasCareRecords: true, pendingCount: 1500, dueWithinHorizonCount: 3 })], { complete: false }),
      null
    );
    expect(view).toMatchObject({ kind: "items", complete: false, pendingCount: 1500 });
  });
});

describe("formatCareDayLabel", () => {
  it("shows the year only when it differs, and nothing for an unreadable day", () => {
    expect(formatCareDayLabel("2026-11-19", "2026-10-20")).toBe("19 Nov");
    expect(formatCareDayLabel("2027-01-14", "2026-12-15")).toBe("14 Jan 2027");
    expect(formatCareDayLabel("", "2026-10-20")).toBe("");
    expect(formatCareDayLabel("2026-11-19", "not a date")).toBe("");
  });
});

describe("selectRecentMoments", () => {
  it("merges pets newest first and counts failed pets in view only", () => {
    const loads: PetMomentsLoad[] = [
      { petId: "a", status: "ok", moments: [moment("a-old", "a", "01 Sep 2026"), moment("a-new", "a", "19 Oct 2026")] },
      { petId: "b", status: "ok", moments: [moment("b-mid", "b", "10 Oct 2026")] },
      { petId: "c", status: "failed" },
    ];

    const all = selectRecentMoments(loads, ["a", "b", "c"]);
    expect(all.moments.map((entry) => entry.id)).toEqual(["a-new", "b-mid", "a-old"]);
    expect(all).toMatchObject({ failedPets: 1, loadedPets: 2 });
    expect(selectRecentMoments(loads, ["b"]).moments.map((entry) => entry.id)).toEqual(["b-mid"]);
  });

  it("orders equal-date Moments across pets by when they were written, not by pet order", () => {
    const sameDay = "18 Oct 2026";
    const loads: PetMomentsLoad[] = [
      {
        petId: "a",
        status: "ok",
        moments: [
          moment("a-older-1", "a", sameDay, { createdAt: "2026-10-18T01:00:00Z" }),
          moment("a-older-2", "a", sameDay, { createdAt: "2026-10-18T02:00:00Z" }),
          moment("a-older-3", "a", sameDay, { createdAt: "2026-10-18T03:00:00Z" }),
          moment("a-older-4", "a", sameDay, { createdAt: "2026-10-18T04:00:00Z" }),
        ],
      },
      {
        petId: "b",
        status: "ok",
        moments: [moment("b-newest", "b", sameDay, { createdAt: "2026-10-18T09:00:00Z" })],
      },
    ];

    const ids = selectRecentMoments(loads, ["a", "b"]).moments.map((entry) => entry.id);
    expect(ids).toEqual(["b-newest", "a-older-4", "a-older-3", "a-older-2"]);

    // The same result whichever pet's Moments arrive first.
    const reversed = selectRecentMoments([...loads].reverse(), ["a", "b"]).moments.map((entry) => entry.id);
    expect(reversed).toEqual(ids);
  });

  it("breaks a full tie deterministically by id", () => {
    const loads: PetMomentsLoad[] = [
      { petId: "b", status: "ok", moments: [moment("m-2", "b", "18 Oct 2026"), moment("m-3", "b", "18 Oct 2026")] },
      { petId: "a", status: "ok", moments: [moment("m-1", "a", "18 Oct 2026")] },
    ];
    expect(selectRecentMoments(loads, ["a", "b"]).moments.map((entry) => entry.id)).toEqual(["m-1", "m-2", "m-3"]);
  });
});

describe("getMomentPreview", () => {
  it("uses the cover, never invents a picture, and skips unloadable addresses", () => {
    const media = [
      { id: "m1", type: "image" as const, url: "https://media.example.test/1.jpg", sortOrder: 0 },
      { id: "m2", type: "image" as const, url: "https://media.example.test/2.jpg", sortOrder: 1 },
    ];
    expect(getMomentPreview(moment("x", "a", "", { media, coverMediaId: "m2" }))).toMatchObject({
      kind: "image",
      media: { id: "m2" },
    });
    expect(getMomentPreview(moment("x", "a", "")).kind).toBe("none");
    expect(
      getMomentPreview(moment("x", "a", "", { media: [{ id: "m", type: "image", url: "relative.jpg", sortOrder: 0 }] })).kind
    ).toBe("none");
  });
});

describe("getPrivateMomentNotes", () => {
  const nine = Array.from({ length: 9 }, (_, index) =>
    moment(`m${index}`, "a", "01 Oct 2026", { visibility: index < 8 ? "Private" : "Public" })
  );

  it("notes 8 of 10 private Moments only from whole counts", () => {
    expect(getPrivateMomentNotes([{ petId: "a", status: "ok", moments: nine, total: 9 }], ["a"], 10)).toEqual([
      { petId: "a", privateCount: 8, limit: 10 },
    ]);
    expect(getPrivateMomentNotes([{ petId: "a", status: "ok", moments: nine, total: 120 }], ["a"], 10)).toEqual([]);
    expect(getPrivateMomentNotes([{ petId: "a", status: "ok", moments: nine }], ["a"], 10)).toEqual([]);
    expect(getPrivateMomentNotes([{ petId: "a", status: "failed" }], ["a"], 10)).toEqual([]);
    expect(getPrivateMomentNotes([{ petId: "a", status: "ok", moments: nine, total: 9 }], ["a"], 0)).toEqual([]);
  });
});

describe("ownerRoutes.petRecords", () => {
  it("keeps the create link and carries only an opaque id for Log as done", () => {
    expect(ownerRoutes.petRecords("pet_1")).toBe("/pets/pet_1/records");
    expect(ownerRoutes.petRecords("pet_1", { create: true })).toBe("/pets/pet_1/records?create=1");
    expect(ownerRoutes.petRecords("pet_1", { complete: "rec_9" })).toBe(
      "/pets/pet_1/records?complete=rec_9"
    );
  });
});
