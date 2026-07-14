// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { mockPets } from "@/data/mockPets";

const publicProfileMocks = vi.hoisted(() => ({
  profile: null as (typeof mockPets)[number] | null,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", () => ({
  getPublicPetProfileByPublicCode: async () => ({
    data: publicProfileMocks.profile,
  }),
}));

vi.mock("@/services/momentService", () => ({
  getPublicPetMoments: async () => ({ data: [] }),
}));

vi.mock("@/services/recordService", () => ({
  getPetRecords: async () => ({ data: [] }),
  getPublicPetRecords: async () => ({ data: [] }),
}));

vi.mock("@/components/marketing/PublicProfileOwnerControls", () => ({
  PublicProfileOwnerControls: () => null,
  PrivateMemorialOwnerAction: () => null,
}));

vi.mock("@/components/brand/BrandLogo", () => ({
  BrandLogo: () => <span>MyPetLink</span>,
}));

vi.mock("@/components/ui/PetPhotoViewer", () => ({
  PetPhotoViewer: () => <span>Pet portrait</span>,
}));

const { PublicSharePetProfile } = await import(
  "@/components/marketing/PublicSharePetProfile"
);

afterEach(cleanup);

it("applies the pet's saved focal position to the public profile cover", async () => {
  const profile = {
    ...mockPets[0],
    coverUrl: "https://media.mypetlink.test/milo-cover.jpg",
    coverPositionX: 31,
    coverPositionY: 68,
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  const cover = (await screen.findByAltText("Milo cover photo")) as HTMLImageElement;
  expect(cover.style.objectPosition).toBe("31% 68%");
});

it("shows favourite foods and toys as compact separated values", async () => {
  const profile = {
    ...mockPets[0],
    favoriteFoods: ["Ayam kukus 🍗", "Tuna"],
    favoriteToys: ["Bola rotan 🎾"],
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("Favourite foods")).toBeTruthy();
  expect(screen.getByText("Ayam kukus 🍗 · Tuna")).toBeTruthy();
  expect(screen.getByText("Favourite toys")).toBeTruthy();
  expect(screen.getByText("Bola rotan 🎾")).toBeTruthy();
  // Never raw JSON.
  expect(document.body.textContent).not.toContain("[");
  expect(document.body.textContent).not.toContain("object Object");
});

it("hides favourite sections entirely when no values are saved", async () => {
  const profile = {
    ...mockPets[0],
    favoriteFoods: [],
    favoriteToys: [],
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${profile.name}`);
  expect(screen.queryByText("Favourite foods")).toBeNull();
  expect(screen.queryByText("Favourite toys")).toBeNull();
});
