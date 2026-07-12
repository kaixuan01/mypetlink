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
