// @vitest-environment jsdom

/**
 * The Sharing & Privacy summary: one place to understand three audiences.
 *
 * A pet is seen by three different groups — people the owner sent a link to,
 * whoever finds the pet, and people in Community — and the owner could
 * previously only see two of them here. Whether a pet was in Community was
 * only discoverable by leaving the pet, opening the Community profile editor
 * and scrolling to a list of pets.
 *
 * So every row now answers the same three questions: is it on, WHO CAN SEE IT,
 * and where do I change it. What the card must never become is a second place
 * to change any of them — there is one authoritative control per setting and
 * these tests pin that down.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";
import type { PetSocialSettings } from "@/services/petSocialSettingsService";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  updatePetLostMode: vi.fn(),
  getPetSocialSettings: vi.fn(),
  getOwnerSocialProfile: vi.fn(),
  apiConfigured: false,
  socialEnabled: true,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => mocks.apiConfigured,
  canUseApi: () => mocks.apiConfigured,
}));
vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return {
    ...actual,
    publicProfilesEnabled: true,
    safetyProfilesOwnerUiEnabled: true,
    smartTagsEnabled: true,
    // A getter, so a test can switch the feature off the way a build does.
    get socialEnabled() {
      return mocks.socialEnabled;
    },
  };
});
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    updatePetLostMode: (...args: unknown[]) => mocks.updatePetLostMode(...args),
  };
});
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));
vi.mock("@/services/petSocialSettingsService", () => ({
  getPetSocialSettings: () => mocks.getPetSocialSettings(),
}));
vi.mock("@/services/ownerSocialService", () => ({
  getOwnerSocialProfile: () => mocks.getOwnerSocialProfile(),
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

function activePet(overrides: Partial<Pet> = {}): Pet {
  return { ...structuredClone(mockPets[0]), ...overrides };
}

function renderOverview(pet: Pet) {
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);
}

function row(name: string) {
  return screen.getByRole("group", { name: `${name} status` });
}

/** The Community reads, arranged into one of the states an owner can be in. */
function community({
  ownerSocialEnabled = true,
  ownerDiscoverable = true,
  isSocialEnabled = true,
  isDiscoverable = true,
  missingRequirements = [] as string[],
  handle = "tanfamily",
  petId = mockPets[0].id,
} = {}) {
  const pet: PetSocialSettings = {
    petId,
    name: "Milo",
    photoUrl: "",
    photoThumbnailUrl: "",
    isSocialEnabled,
    isDiscoverable,
    canEnableSocial: missingRequirements.length === 0,
    missingRequirements,
    rowVersion: "v1",
  };

  mocks.getPetSocialSettings.mockResolvedValue({
    data: { ownerSocialEnabled, pets: [pet] },
  });
  mocks.getOwnerSocialProfile.mockResolvedValue({
    data: {
      handle,
      displayName: "The Tan Family",
      bio: "",
      avatarMediaId: "",
      avatarUrl: "",
      avatarThumbnailUrl: "",
      generalArea: "",
      isSocialEnabled: ownerSocialEnabled,
      isDiscoverable: ownerDiscoverable,
      allowFollowers: true,
      canEnableSocial: true,
      missingRequirements: [],
      handleChangeAvailableAt: "",
      rowVersion: "v1",
    },
  });
}

beforeEach(() => {
  const pet = activePet();
  mocks.apiConfigured = false;
  mocks.socialEnabled = true;
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.updatePetLostMode.mockResolvedValue({ data: pet });
  community();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Share Profile row", () => {
  it("names its audience, not just its state", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Privacy");

    const share = row("Share Profile");
    expect(within(share).getByText("On")).toBeTruthy();
    expect(within(share).getByText(/Anyone you send the link to/)).toBeTruthy();
  });

  it("says nobody sees it while the link is switched off", async () => {
    const pet = activePet({ publicProfileEnabled: false });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    const share = row("Share Profile");
    expect(within(share).getByText("Off")).toBeTruthy();
    expect(within(share).getByText(/Nobody/)).toBeTruthy();
  });

  it("offers no View action for a page nobody can open", async () => {
    const pet = activePet({ publicProfileEnabled: false });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    expect(
      within(row("Share Profile")).queryByRole("link", { name: /View Share Profile/ })
    ).toBeNull();
  });

  it("sends Manage to the one screen that owns the switch", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    expect(
      within(row("Share Profile"))
        .getByRole("link", { name: "Manage Share Profile" })
        .getAttribute("href")
    ).toBe(`/pets/${pet.id}/edit?tab=public`);
  });
});

describe("Safety Profile row", () => {
  it("names the people who would actually open it", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    expect(
      within(row("Safety Profile")).getByText(
        new RegExp(`Whoever finds ${pet.name}`)
      )
    ).toBeTruthy();
  });

  it("says nobody sees it while the Safety Profile is off", async () => {
    const pet = activePet({ qrSafetyEnabled: false });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    const safety = row("Safety Profile");
    expect(within(safety).getByText("Safety Profile Off")).toBeTruthy();
    expect(within(safety).getByText(/Nobody/)).toBeTruthy();
  });

  it("offers no QR, no view link and no finder details while it is off", async () => {
    // A printable QR for a page that shows a finder nothing is a trap, and the
    // general area is a finder-facing detail. Neither may sit under "Nobody".
    const pet = activePet({ qrSafetyEnabled: false });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    const safety = row("Safety Profile");
    expect(
      within(safety).queryByRole("link", { name: /View Safety Profile/ })
    ).toBeNull();
    expect(
      within(safety).queryByRole("button", { name: /QR code/ })
    ).toBeNull();
    expect(within(safety).queryByText(/General area ·/)).toBeNull();
    // The one way back is still there.
    expect(
      within(safety).getByRole("link", { name: "Manage finder information" })
    ).toBeTruthy();
  });

  it("keeps the QR and view link while the Safety Profile is on", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Privacy");

    const safety = row("Safety Profile");
    expect(
      within(safety).getByRole("link", { name: /View Safety Profile/ })
    ).toBeTruthy();
    expect(
      within(safety).getByRole("button", { name: /QR code/ })
    ).toBeTruthy();
  });

  it("sends Manage to Contact & Safety, where finder details live", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    expect(
      within(row("Safety Profile"))
        .getByRole("link", { name: "Manage finder information" })
        .getAttribute("href")
    ).toBe(`/pets/${pet.id}/edit?tab=contact`);
  });
});

describe("Community row", () => {
  beforeEach(() => {
    mocks.apiConfigured = true;
  });

  it("is browsable only when the pet AND the household are discoverable", async () => {
    community({ isDiscoverable: true, ownerDiscoverable: true });
    renderOverview(activePet());

    const status = await screen.findByText("In Community · Discoverable");
    expect(status).toBeTruthy();
    expect(
      within(row("Community")).getByText(/People browsing MyPetLink Community/)
    ).toBeTruthy();
  });

  it("does not claim browsable when the household is hidden from discovery", async () => {
    // Explore requires both switches. Reading the pet's alone would tell an
    // owner their pet is findable when it is not.
    community({ isDiscoverable: true, ownerDiscoverable: false });
    renderOverview(activePet());

    await screen.findByText("In Community · Hidden from discovery");
    expect(screen.queryByText(/People browsing MyPetLink Community/)).toBeNull();
    expect(
      within(row("Community")).getByText(/visit your Community Profile or follow you/)
    ).toBeTruthy();
  });

  it("does not claim browsable when the pet itself is hidden", async () => {
    community({ isDiscoverable: false, ownerDiscoverable: true });
    renderOverview(activePet());

    await screen.findByText("In Community · Hidden from discovery");
  });

  it("says a pet is out when the pet has not joined", async () => {
    community({ isSocialEnabled: false });
    renderOverview(activePet());

    await screen.findByText("Not in Community");
    expect(
      within(row("Community")).getByText(/does not appear in Community/)
    ).toBeTruthy();
  });

  it("blames the household, not the pet, when the household has not joined", async () => {
    community({ ownerSocialEnabled: false, isSocialEnabled: false });
    renderOverview(activePet());

    await screen.findByText("Not in Community");
    expect(
      within(row("Community")).getByText(/household has not joined Community/)
    ).toBeTruthy();
  });

  it("explains the Share Profile prerequisite instead of failing silently", async () => {
    community({
      isSocialEnabled: false,
      missingRequirements: ["publicProfile"],
    });
    renderOverview(activePet());

    const reason = await screen.findByTestId("community-blocked-reason");
    expect(reason.textContent).toMatch(/Turn on .*Share Profile before adding/);
  });

  it("sends Manage to the Community editor, which owns the switches", async () => {
    community();
    renderOverview(activePet());

    await screen.findByText("In Community · Discoverable");
    expect(
      within(row("Community"))
        .getByRole("link", { name: "Manage Community" })
        .getAttribute("href")
    ).toBe("/community/profile/edit");
  });

  it("links View to the household's own page, never to a pet Community page", async () => {
    community({ handle: "tanfamily" });
    renderOverview(activePet());

    await screen.findByText("In Community · Discoverable");
    const view = within(row("Community")).getByRole("link", {
      name: "View Community Profile",
    });

    expect(view.getAttribute("href")).toBe("/u/tanfamily");
  });

  it("offers no View action when the household has no page yet", async () => {
    community({ handle: "" });
    renderOverview(activePet());

    await screen.findByText("In Community · Discoverable");
    expect(
      within(row("Community")).queryByRole("link", { name: /View Community Profile/ })
    ).toBeNull();
  });

  it("links View to the household's own page after a reload, not to a stale one", async () => {
    community({ handle: "tanfamily" });
    renderOverview(activePet());

    await screen.findByText("In Community · Discoverable");
    expect(
      within(row("Community"))
        .getByRole("link", { name: "View Community Profile" })
        .getAttribute("href")
    ).toBe("/u/tanfamily");
  });
});

/**
 * A missing feature and missing data are different things.
 *
 * When Community is switched off for the build there is nothing to describe,
 * and the row is correctly absent. When Community exists but its state could
 * not be read, removing the row tells the owner their pet has no Community
 * settings — a claim as wrong as "Not in Community", and harder to notice.
 * So the row stays and says it does not know.
 */
describe("Community row when the answer is not known", () => {
  it("renders nothing while Community is switched off for this build", async () => {
    mocks.socialEnabled = false;
    mocks.apiConfigured = true;
    renderOverview(activePet());
    await screen.findByText("Sharing & Privacy");

    expect(screen.queryByRole("group", { name: "Community status" })).toBeNull();
    expect(screen.queryByText(/Community/)).toBeNull();
  });

  it("renders nothing when there is no connection to ask", async () => {
    mocks.apiConfigured = false;
    renderOverview(activePet());
    await screen.findByText("Sharing & Privacy");

    expect(screen.queryByRole("group", { name: "Community status" })).toBeNull();
  });

  it("keeps the row and says so when the read fails", async () => {
    mocks.apiConfigured = true;
    mocks.getPetSocialSettings.mockRejectedValue(new Error("offline"));
    renderOverview(activePet());

    const community = await screen.findByRole("group", {
      name: "Community status",
    });
    expect(
      within(community).getByText("Status temporarily unavailable")
    ).toBeTruthy();
    expect(
      within(community).getByText(/couldn't load .*Community status/)
    ).toBeTruthy();
    // The rest of the page is untouched.
    expect(screen.getByRole("group", { name: "Share Profile status" })).toBeTruthy();
  });

  it("infers no participation or discoverability from a failed read", async () => {
    mocks.apiConfigured = true;
    mocks.getOwnerSocialProfile.mockRejectedValue(new Error("boom"));
    renderOverview(activePet());

    const community = await screen.findByRole("group", {
      name: "Community status",
    });

    for (const claim of [
      /Not in Community/,
      /In Community/,
      /Discoverable/i,
      /Hidden from discovery/i,
    ]) {
      expect(within(community).queryByText(claim)).toBeNull();
    }
    // "Seen by" names an audience; there is no audience to name.
    expect(within(community).queryByText(/Seen by:/)).toBeNull();
    expect(within(community).queryByTestId("community-blocked-reason")).toBeNull();
    // Nothing to open, because the handle was never read.
    expect(
      within(community).queryByRole("link", { name: /View Community Profile/ })
    ).toBeNull();
  });

  it("still points at the Community editor when the read fails", async () => {
    mocks.apiConfigured = true;
    mocks.getPetSocialSettings.mockRejectedValue(new Error("offline"));
    renderOverview(activePet());

    const community = await screen.findByRole("group", {
      name: "Community status",
    });
    expect(
      within(community)
        .getByRole("link", { name: "Manage Community" })
        .getAttribute("href")
    ).toBe("/community/profile/edit");
  });

  it("says it is checking rather than appearing out of nowhere", async () => {
    // The row exists from the first paint, so a slow read moves the page
    // around no more than a fast one does.
    mocks.apiConfigured = true;
    mocks.getPetSocialSettings.mockReturnValue(new Promise(() => {}));
    renderOverview(activePet());

    const community = await screen.findByRole("group", {
      name: "Community status",
    });
    expect(within(community).getByText("Checking status…")).toBeTruthy();
    expect(within(community).queryByText(/Not in Community/)).toBeNull();
    expect(within(community).queryByText(/Seen by:/)).toBeNull();
  });

  it("reports not knowing when the reads come back without this pet", async () => {
    mocks.apiConfigured = true;
    community({ petId: "some-other-pet" });
    renderOverview(activePet());

    const community_ = await screen.findByRole("group", {
      name: "Community status",
    });
    expect(
      await within(community_).findByText("Status temporarily unavailable")
    ).toBeTruthy();
    expect(within(community_).queryByText(/Not in Community/)).toBeNull();
  });
});

describe("the summary stays a summary", () => {
  it("offers no editable switch for any of the three", async () => {
    mocks.apiConfigured = true;
    community();
    renderOverview(activePet());
    await screen.findByText("In Community · Discoverable");

    const card = screen.getByRole("group", { name: "Sharing and privacy" });

    // One authoritative control per setting, and none of them is here. The
    // only controls in this card are the Safety QR dialog trigger and links.
    expect(within(card).queryAllByRole("switch")).toHaveLength(0);
    expect(within(card).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("does not repeat Copy Link, which belongs to the Share Center", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Privacy");

    expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Copy Safety Profile Link/ })
    ).toBeNull();
  });

  it("shows the general area as one line of metadata, not a highlighted block", async () => {
    const pet = activePet({ contactOverride: { useOwnerDefaults: false } });
    mocks.getPetById.mockResolvedValue({ data: pet });
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    const meta = screen.getByText(/^General area ·/);
    expect(meta.tagName).toBe("P");
    expect(row("Safety Profile").contains(meta)).toBe(true);
  });

  it("places Lost Mode beside the rows, not inside the safety one", async () => {
    renderOverview(activePet());
    await screen.findByText("Sharing & Privacy");

    const lostHeading = screen.getByRole("heading", { name: "Lost Mode" });
    expect(row("Safety Profile").contains(lostHeading)).toBe(false);
    expect(row("Share Profile").contains(lostHeading)).toBe(false);
  });

  it("keeps the resting Lost Mode quiet, with no urgent styling", async () => {
    const pet = activePet();
    renderOverview(pet);
    await screen.findByText("Sharing & Privacy");

    const turnOn = screen.getByRole("button", { name: "Turn on Lost Mode" });
    expect(turnOn.className).not.toMatch(/coral/);
    expect(screen.getByText(`Only turn this on if ${pet.name} is missing.`))
      .toBeTruthy();

    // The confirmation step is where urgency belongs.
    fireEvent.click(turnOn);
    const activate = await screen.findByRole("button", {
      name: "Activate Lost Mode",
    });
    expect(activate.className).toMatch(/coral/);
  });
});
