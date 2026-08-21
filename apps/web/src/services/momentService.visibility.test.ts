// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetMoment } from "@/types";
import {
  buildBackendMomentPayload,
  createPetMoment,
  getPublicPetMoments,
  getPetMoments,
  mapBackendPublicMoments,
  updatePetMoment,
} from "./momentService";

const storageKey = "mypetlink_moments";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("Moment visibility request mapping", () => {
  it("normalizes Family Only to Private without clamping Timeline", () => {
    expect(
      buildBackendMomentPayload({
        visibility: "Family Only",
        showOnPublicProfile: true,
        showInLifeTimeline: true,
      })
    ).toMatchObject({
      visibility: "Private",
      showOnPublicProfile: false,
      showInLifeTimeline: true,
    });
  });

  it("derives ShowOnPublicProfile from Public visibility", () => {
    expect(
      buildBackendMomentPayload({
        visibility: "Public",
        showOnPublicProfile: false,
        showInLifeTimeline: false,
      })
    ).toMatchObject({
      visibility: "Public",
      showOnPublicProfile: true,
      showInLifeTimeline: false,
    });
  });

  it("keeps Private Timeline placement independent", () => {
    expect(
      buildBackendMomentPayload({
        visibility: "Private",
        showOnPublicProfile: true,
        showInLifeTimeline: true,
      })
    ).toMatchObject({
      visibility: "Private",
      showOnPublicProfile: false,
      showInLifeTimeline: true,
    });
  });

  it("fails closed when public projection visibility is missing or non-Public", () => {
    const projected = mapBackendPublicMoments(
      [
        {
          title: "Public compatibility false",
          visibility: "Public",
          showOnPublicProfile: false,
          showInLifeTimeline: true,
          media: [],
        },
        {
          title: "Missing audience",
          showOnPublicProfile: true,
          showInLifeTimeline: true,
          media: [],
        },
        {
          title: "Private compatibility true",
          visibility: "Private",
          showOnPublicProfile: true,
          showInLifeTimeline: true,
          media: [],
        },
        {
          title: "Family compatibility true",
          visibility: "FamilyOnly",
          showOnPublicProfile: true,
          showInLifeTimeline: true,
          media: [],
        },
      ],
      "public-pet"
    );

    expect(projected.map((moment) => moment.title)).toEqual([
      "Public compatibility false",
    ]);
  });
});

describe("local-preview Moment visibility semantics", () => {
  it("normalizes historical Family Only data as Private on read and write", async () => {
    const legacy: PetMoment = {
      id: "legacy_family",
      petId: "pet_visibility",
      title: "Family memory",
      date: "21 Aug 2026",
      type: "Memory",
      caption: "",
      media: [],
      visibility: "Family Only",
      showOnPublicProfile: true,
      showInLifeTimeline: true,
    };
    window.localStorage.setItem(storageKey, JSON.stringify([legacy]));

    const loaded = (await getPetMoments(legacy.petId)).data;
    expect(loaded).toContainEqual(
      expect.objectContaining({
        id: legacy.id,
        visibility: "Private",
        showOnPublicProfile: false,
        showInLifeTimeline: true,
      })
    );

    await updatePetMoment(legacy.id, { caption: "Saved again" }, legacy.petId);
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    expect(stored).toContainEqual(
      expect.objectContaining({
        id: legacy.id,
        visibility: "Private",
        showOnPublicProfile: false,
        showInLifeTimeline: true,
      })
    );
  });

  it("creates a Private Timeline Moment without widening its audience", async () => {
    const created = await createPetMoment("pet_visibility", {
      title: "Owner timeline memory",
      date: "21 Aug 2026",
      type: "Memory",
      visibility: "Private",
      showOnPublicProfile: true,
      showInLifeTimeline: true,
    });

    expect(created.data).toMatchObject({
      visibility: "Private",
      showOnPublicProfile: false,
      showInLifeTimeline: true,
    });
  });

  it("uses visibility alone for local public projection", async () => {
    const moments: PetMoment[] = [
      {
        id: "public_compatibility_false",
        petId: "pet_visibility",
        title: "Public Moment",
        date: "21 Aug 2026",
        type: "Memory",
        caption: "",
        media: [],
        visibility: "Public",
        showOnPublicProfile: false,
        showInLifeTimeline: false,
      },
      {
        id: "private_compatibility_true",
        petId: "pet_visibility",
        title: "Private Moment",
        date: "21 Aug 2026",
        type: "Memory",
        caption: "",
        media: [],
        visibility: "Private",
        showOnPublicProfile: true,
        showInLifeTimeline: true,
      },
      {
        id: "family_compatibility_true",
        petId: "pet_visibility",
        title: "Family Moment",
        date: "21 Aug 2026",
        type: "Memory",
        caption: "",
        media: [],
        visibility: "Family Only",
        showOnPublicProfile: true,
        showInLifeTimeline: true,
      },
    ];
    window.localStorage.setItem(storageKey, JSON.stringify(moments));

    const projected = (await getPublicPetMoments("pet_visibility")).data;

    expect(projected.map((moment) => moment.id)).toEqual([
      "public_compatibility_false",
    ]);
    expect(projected[0]).toMatchObject({
      visibility: "Public",
      showOnPublicProfile: true,
    });
  });
});
