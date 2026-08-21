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
import type { PetMoment } from "@/types";

const publicProfileMocks = vi.hoisted(() => ({
  profile: null as (typeof mockPets)[number] | null,
  moments: [] as PetMoment[],
  getProfile: vi.fn(),
  authenticated: false,
  ownedPet: null as unknown,
  push: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: publicProfileMocks.push }),
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => publicProfileMocks.authenticated,
}));

vi.mock("@/services/petService", () => ({
  getPublicPetProfileByPublicCode: (...args: unknown[]) =>
    publicProfileMocks.getProfile(...args),
  getOwnedPetByPublicCode: async () => ({
    data: publicProfileMocks.ownedPet,
  }),
}));

vi.mock("@/services/momentService", () => ({
  getPublicPetMoments: async () => ({ data: publicProfileMocks.moments }),
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
  publicProfileMocks.authenticated = false;
  publicProfileMocks.ownedPet = null;
  publicProfileMocks.getProfile.mockImplementation(async () => ({
    data: publicProfileMocks.profile,
  }));
});

afterEach(() => {
  cleanup();
  publicProfileMocks.moments = [];
  publicProfileMocks.authenticated = false;
  publicProfileMocks.ownedPet = null;
  vi.clearAllMocks();
});

const createCtaName = "Create a profile for your pet";

it("fails closed when public-profile visibility is unexpectedly missing", async () => {
  const profile = {
    ...mockPets[0],
    lostModeEnabled: true,
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "+60198765432",
      whatsappNumber: "+60111222333",
    },
  };
  Reflect.deleteProperty(profile, "visibility");
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`${profile.name} is currently missing`);
  expect(
    screen.queryByRole("link", { name: `WhatsApp ${profile.name}'s owner` })
  ).toBeNull();
  expect(
    screen.queryByRole("link", { name: `Call ${profile.name}'s owner` })
  ).toBeNull();
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

it("uses the timeline media presentation while leaving photo-free milestones unchanged", async () => {
  const profile = {
    ...mockPets[0],
    estimatedBirthYear: 2021,
  };
  const timelineMoment = {
    id: "timeline-photo-memory",
    petId: profile.id,
    title: "First beach trip",
    date: "11 Jul 2022",
    type: "Outdoor / Trip",
    caption: "A bright afternoon by the water.",
    media: [
      {
        id: "timeline-portrait-photo",
        type: "image",
        url: "https://media.mypetlink.test/moments/portrait.jpg",
        altText: "Milo sitting beside the sea",
        sortOrder: 0,
      },
    ],
    coverMediaId: "timeline-portrait-photo",
    visibility: "Public",
    showOnPublicProfile: true,
    showInLifeTimeline: true,
    timelineNote: "Milo's first seaside adventure.",
  } satisfies PetMoment;
  publicProfileMocks.profile = profile;
  publicProfileMocks.moments = [timelineMoment];

  render(
    <PublicSharePetProfile
      initialMoments={[timelineMoment]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  fireEvent.click(await screen.findByRole("button", { name: "Timeline" }));

  const carousel = screen.getByRole("region", {
    name: "First beach trip media carousel",
  });
  expect(carousel.className).toContain("aspect-[4/3]");
  expect(carousel.className).toContain("sm:aspect-[16/10]");
  expect(screen.getByText("Milo was born")).toBeTruthy();
  expect(screen.getByText("First beach trip")).toBeTruthy();
  expect(screen.getAllByRole("region")).toHaveLength(1);
});

it("keeps Birthday in About while hiding only its timeline milestone", async () => {
  const profile = {
    ...mockPets[0],
    birthday: "15 Sept 2021",
    visibility: {
      ...mockPets[0].visibility,
      showTimeline: true,
      showBirthdayOnTimeline: false,
    },
  };
  const adoptionMoment = {
    id: "adoption-moment",
    petId: profile.id,
    title: "First day home",
    date: "16 Sept 2022",
    type: "Adoption Day",
    caption: "The day Milo joined the family.",
    media: [],
    visibility: "Public",
    showOnPublicProfile: true,
    showInLifeTimeline: true,
    timelineNote: "Home at last.",
  } satisfies PetMoment;
  publicProfileMocks.profile = profile;
  publicProfileMocks.moments = [adoptionMoment];

  render(
    <PublicSharePetProfile
      initialMoments={[adoptionMoment]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("15 Sept 2021")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
  expect(screen.queryByText("Milo was born")).toBeNull();
  expect(screen.getByText("First day home")).toBeTruthy();
});

it("shows the birthday timeline milestone only when explicitly enabled", async () => {
  const profile = {
    ...mockPets[0],
    birthday: "15 Sept 2021",
    visibility: {
      ...mockPets[0].visibility,
      showTimeline: true,
      showBirthdayOnTimeline: true,
    },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("15 Sept 2021")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
  expect(screen.getByText("Milo was born")).toBeTruthy();
});

it("omits Birthday and its milestone when no birthday is saved", async () => {
  const profile = {
    ...mockPets[0],
    birthday: "",
    estimatedBirthYear: undefined,
    visibility: {
      ...mockPets[0].visibility,
      showTimeline: true,
      showBirthdayOnTimeline: true,
    },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByRole("button", { name: "Timeline" });
  expect(screen.queryByText("Birthday")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
  expect(screen.queryByText("Milo was born")).toBeNull();
});

it("hides the whole timeline when its saved visibility is off", async () => {
  const profile = {
    ...mockPets[0],
    visibility: {
      ...mockPets[0].visibility,
      showTimeline: false,
      showBirthdayOnTimeline: true,
    },
  };
  const timelineMoment = {
    id: "hidden-timeline-moment",
    petId: profile.id,
    title: "First day home",
    date: "16 Sept 2022",
    type: "First Day Home",
    caption: "A happy day.",
    media: [],
    visibility: "Public",
    showOnPublicProfile: true,
    showInLifeTimeline: true,
    timelineNote: "Home at last.",
  } satisfies PetMoment;
  publicProfileMocks.profile = profile;
  publicProfileMocks.moments = [timelineMoment];

  render(
    <PublicSharePetProfile
      initialMoments={[timelineMoment]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(profile.bio);
  expect(screen.queryByRole("button", { name: "Timeline" })).toBeNull();
  expect(screen.queryByText("Life Timeline")).toBeNull();
});

it("does not present missing bio, owner name, or tribute as owner-authored", async () => {
  const profile = {
    ...mockPets[0],
    bio: "",
    lifecycleStatus: "Memorial" as const,
    previousLifecycleStatus: "Memorial" as const,
    owner: { ...mockPets[0].owner, name: "" },
    contactOverride: { useOwnerDefaults: false },
    memorial: {
      passedAwayDate: "",
      memorialMessage: "",
      showMemorialOnPublicProfile: true,
    },
    visibility: { ...mockPets[0].visibility, showOwnerName: true },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("Memorial profile")).toBeTruthy();
  expect(document.body.textContent).not.toContain("safe MyPetLink profile ready");
  expect(document.body.textContent).not.toContain("Milo's owner");
  expect(document.body.textContent).not.toContain("lovingly remembered");
  expect(screen.queryByText(/Cared for by/)).toBeNull();
});

it("continues rendering real bio, owner name, and memorial tribute", async () => {
  const profile = {
    ...mockPets[0],
    bio: "Loved sunny walks.",
    lifecycleStatus: "Memorial" as const,
    previousLifecycleStatus: "Memorial" as const,
    owner: { ...mockPets[0].owner, name: "Aina" },
    contactOverride: { useOwnerDefaults: false },
    memorial: {
      passedAwayDate: "",
      memorialMessage: "Forever in our hearts.",
      showMemorialOnPublicProfile: true,
    },
    visibility: { ...mockPets[0].visibility, showOwnerName: true },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(await screen.findByText("Loved sunny walks.")).toBeTruthy();
  expect(screen.getByText("Cared for by Aina")).toBeTruthy();
  expect(screen.getByText("Forever in our hearts.")).toBeTruthy();
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
    name: "View Safety Profile",
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
  // Lost Mode contact actions never leak into the normal profile state.
  expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Send found location/ })
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
    screen.queryByRole("link", { name: "View Safety Profile" })
  ).toBeNull();
});

it("offers immediate Lost Mode contact actions for the explicitly viewed pet", async () => {
  const profile = {
    ...mockPets[0],
    lostModeEnabled: true,
    contactOverride: {
      useOwnerDefaults: false,
      ownerDisplayName: "Aina",
      phoneNumber: "+60198765432",
      whatsappNumber: "+60111222333",
    },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`${profile.name} is currently missing`);
  // Contact actions are built from this pet's own approved numbers.
  const whatsapp = screen.getByRole("link", {
    name: `WhatsApp ${profile.name}'s owner`,
  });
  expect(whatsapp.getAttribute("href")).toContain("wa.me/60111222333");
  expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain(
    `I found ${profile.name}.`
  );
  const call = screen.getByRole("link", { name: `Call ${profile.name}'s owner` });
  expect(call.getAttribute("href")).toBe("tel:+60198765432");
  expect(
    screen.getByRole("button", {
      name: `Send found location to ${profile.name}'s owner`,
    })
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "View Safety Profile" })).toBeTruthy();
});

it("respects per-pet contact privacy settings inside the Lost Mode card", async () => {
  const profile = {
    ...mockPets[0],
    lostModeEnabled: true,
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "+60198765432",
      whatsappNumber: "+60111222333",
    },
    visibility: {
      ...mockPets[0].visibility,
      showPhone: false,
      showWhatsapp: true,
    },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`${profile.name} is currently missing`);
  expect(
    screen.getByRole("link", { name: `WhatsApp ${profile.name}'s owner` })
  ).toBeTruthy();
  expect(
    screen.queryByRole("link", { name: `Call ${profile.name}'s owner` })
  ).toBeNull();
});

it("keeps the Safety Profile reachable when Lost Mode has no allowed contact method", async () => {
  const profile = {
    ...mockPets[0],
    lostModeEnabled: true,
    owner: {
      ...mockPets[0].owner,
      phone: "",
      whatsapp: "",
    },
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "",
      whatsappNumber: "",
    },
  };
  publicProfileMocks.profile = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`${profile.name} is currently missing`);
  expect(
    screen.getByText(/The owner has not shared direct contact details here/)
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: /owner$/ })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Send found location/ })
  ).toBeNull();
  expect(screen.getByRole("link", { name: "View Safety Profile" })).toBeTruthy();
});

it("does not render broken contact actions when optional owner numbers are empty", async () => {
  const profile = {
    ...mockPets[0],
    owner: {
      ...mockPets[0].owner,
      phone: "",
      whatsapp: "",
      emergencyContact: "",
    },
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: "",
      whatsappNumber: "",
    },
    visibility: {
      ...mockPets[0].visibility,
      showPhone: true,
      showWhatsapp: true,
    },
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
  expect(screen.queryByRole("link", { name: "Call Owner" })).toBeNull();
  expect(screen.queryByRole("link", { name: "WhatsApp Owner" })).toBeNull();
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

it("closes the loop for a visitor with one invitation after the pet's content, above the public-information notice", async () => {
  const profile = mockPets[0];
  publicProfileMocks.profile = profile;

  const { container } = render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  const heading = await screen.findByRole("heading", { name: createCtaName });
  expect(
    screen.getByRole("button", { name: "Create your pet's profile" })
  ).toBeTruthy();

  // Exactly one invitation, so the page never reads as an advertisement.
  expect(screen.getAllByRole("heading", { name: createCtaName })).toHaveLength(1);

  const notice = screen.getByText(
    /Powered by MyPetLink\. This profile only shows owner-approved public information\./
  );
  const section = heading.closest("section")!;
  expect(
    section.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();

  // The pet still leads the page.
  const petHeading = screen.getByRole("heading", { name: profile.name });
  expect(
    petHeading.compareDocumentPosition(section) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();

  expect(container.textContent).toContain(
    "Keep their profile, moments and care details together with MyPetLink."
  );
});

it("does not invite the pet's own owner to create a profile", async () => {
  const profile = mockPets[0];
  publicProfileMocks.profile = profile;
  publicProfileMocks.authenticated = true;
  publicProfileMocks.ownedPet = profile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${profile.name}`);
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: createCtaName })).toBeNull()
  );
});

it("still invites an authenticated visitor who does not own the pet", async () => {
  const profile = mockPets[0];
  publicProfileMocks.profile = profile;
  publicProfileMocks.authenticated = true;
  publicProfileMocks.ownedPet = null;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  expect(
    await screen.findByRole("heading", { name: createCtaName })
  ).toBeTruthy();
});

it("keeps the invitation off memorial and archived profiles", async () => {
  const memorialProfile = {
    ...mockPets[0],
    lifecycleStatus: "Memorial" as const,
    memorial: {
      ...mockPets[0].memorial,
      showMemorialOnPublicProfile: true,
    },
  };
  publicProfileMocks.profile = memorialProfile;

  const { unmount } = render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={memorialProfile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${memorialProfile.name}`);
  expect(screen.queryByRole("heading", { name: createCtaName })).toBeNull();
  unmount();

  const archivedProfile = {
    ...mockPets[0],
    lifecycleStatus: "Archived" as const,
  };
  publicProfileMocks.profile = archivedProfile;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={archivedProfile}
      initialRecords={[]}
    />
  );

  await screen.findByText(`About ${archivedProfile.name}`);
  expect(screen.queryByRole("heading", { name: createCtaName })).toBeNull();
});

it("keeps the invitation off an unavailable profile", async () => {
  const profile = mockPets[0];
  publicProfileMocks.profile = null;

  render(
    <PublicSharePetProfile
      initialMoments={[]}
      initialProfile={profile}
      initialRecords={[]}
    />
  );

  await screen.findByText("Pet profile not found");
  expect(screen.queryByRole("heading", { name: createCtaName })).toBeNull();
});
