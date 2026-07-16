// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { mockPets } from "@/data/mockPets";
import { getQrSafetyPath } from "@/lib/routes";

const publicProfileMocks = vi.hoisted(() => ({
  profile: null as (typeof mockPets)[number] | null,
  getProfile: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", () => ({
  getPublicPetProfileByPublicCode: (...args: unknown[]) =>
    publicProfileMocks.getProfile(...args),
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

beforeEach(() => {
  publicProfileMocks.getProfile.mockImplementation(async () => ({
    data: publicProfileMocks.profile,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

it("refreshes an already-open profile when the visitor returns to its tab", async () => {
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
  await waitFor(() => expect(publicProfileMocks.getProfile).toHaveBeenCalledOnce());
  publicProfileMocks.profile = {
    ...profile,
    coverPositionX: 0,
    coverPositionY: 100,
  };
  fireEvent.focus(window);

  await waitFor(() => expect(cover.style.objectPosition).toBe("0% 100%"));
  expect(publicProfileMocks.getProfile).toHaveBeenCalledTimes(2);
});

it("applies the saved theme to the full public profile", async () => {
  const profile = { ...mockPets[0], profileTheme: "lavender" as const };
  publicProfileMocks.profile = profile;

  const { container } = render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${profile.name}`);
  const themedProfile = container.querySelector("[data-profile-theme]");
  expect(themedProfile?.getAttribute("data-profile-theme")).toBe("lavender");
  expect(themedProfile?.getAttribute("style")).toContain("linear-gradient");
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

it("adds and removes labeled finder details from the saved Lost Mode value", async () => {
  const rawTimestamp = "2026-07-16T07:42:00+00:00";
  const lostProfile = {
    ...mockPets[0],
    lostModeEnabled: true,
    lostMode: {
      ...mockPets[0].lostMode,
      lastSeenArea: "Ampang, Kuala Lumpur",
      lastSeenDateTime: rawTimestamp,
      lostMessage: "Please help Milo get home safely.",
      rewardNote: "RM50 reward offered",
      extraContactInstruction: "Please call me directly",
    },
  };
  publicProfileMocks.profile = lostProfile;
  const { unmount } = render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={lostProfile}
      initialRecords={[]}
    />
  );

  expect(
    await screen.findByText(`${lostProfile.name} is currently missing`)
  ).toBeTruthy();
  expect(screen.getByText("Please help Milo get home safely.")).toBeTruthy();
  expect(screen.getByText("Last seen area")).toBeTruthy();
  expect(screen.getByText("Ampang, Kuala Lumpur")).toBeTruthy();
  expect(screen.getByText("Last seen")).toBeTruthy();
  expect(screen.getByText("16 Jul 2026, 3:42 PM")).toBeTruthy();
  expect(screen.getByText("Reward")).toBeTruthy();
  expect(screen.getByText("RM50 reward offered")).toBeTruthy();
  expect(screen.getByText("Contact instructions")).toBeTruthy();
  expect(screen.getByText("Please call me directly")).toBeTruthy();
  expect(document.body.textContent).not.toContain(rawTimestamp);
  const safetyLink = screen.getByRole("link", {
    name: "Open QR Safety Page",
  });
  expect(safetyLink.getAttribute("href")).toBe(getQrSafetyPath(lostProfile));
  expect(safetyLink.getAttribute("href")).not.toContain(lostProfile.slug);
  unmount();

  const foundProfile = { ...lostProfile, lostModeEnabled: false };
  publicProfileMocks.profile = foundProfile;
  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={foundProfile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${foundProfile.name}`);
  expect(
    screen.queryByText(`${foundProfile.name} is currently missing`)
  ).toBeNull();
});

it("does not render a broken QR action when no safety identifier is available", async () => {
  const profile = {
    ...mockPets[0],
    lostModeEnabled: true,
    safetyCode: "",
    qrSafetyEnabled: false,
    qrSafetyPath: "",
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(
    await screen.findByText(`${profile.name} is currently missing`)
  ).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: "Open QR Safety Page" })
  ).toBeNull();
});

it("shows allergies only when explicit Public Profile visibility is enabled", async () => {
  const hiddenProfile = {
    ...mockPets[0],
    // The public projection removes allergies when the owner has not enabled
    // the dedicated Public Profile visibility setting.
    allergies: [],
    visibility: {
      ...mockPets[0].visibility,
      showAllergiesOnPublicProfile: false,
    },
  };
  publicProfileMocks.profile = hiddenProfile;
  const { unmount } = render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={hiddenProfile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${hiddenProfile.name}`);
  expect(screen.queryByText("Known allergies")).toBeNull();
  unmount();

  const visibleProfile = {
    ...hiddenProfile,
    allergies: ["Chicken", "Penicillin"],
    visibility: {
      ...hiddenProfile.visibility,
      showAllergiesOnPublicProfile: true,
    },
  };
  publicProfileMocks.profile = visibleProfile;
  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={visibleProfile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("Known allergies")).toBeTruthy();
  expect(screen.getByText("Chicken")).toBeTruthy();
  expect(screen.getByText("Penicillin")).toBeTruthy();
  expect(document.body.textContent).not.toContain('["Chicken"');
});
