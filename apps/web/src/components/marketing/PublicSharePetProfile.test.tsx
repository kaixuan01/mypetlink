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

it("shows optional favourite food and toy values on the Public Share Profile", async () => {
  const profile = {
    ...mockPets[0],
    favoriteFood: "Ayam kukus 🍗",
    favoriteToy: "Bola rotan 🎾",
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("Favourite food")).toBeTruthy();
  expect(screen.getByText("Ayam kukus 🍗")).toBeTruthy();
  expect(screen.getByText("Favourite toy")).toBeTruthy();
  expect(screen.getByText("Bola rotan 🎾")).toBeTruthy();
});

it("does not render empty favourite field labels on the Public Share Profile", async () => {
  const profile = {
    ...mockPets[0],
    favoriteFood: "Not set",
    favoriteToy: "Not set",
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
  expect(screen.queryByText("Favourite food")).toBeNull();
  expect(screen.queryByText("Favourite toy")).toBeNull();
});
