// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  updatePetLostMode: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    updatePetLostMode: (...args: unknown[]) =>
      mocks.updatePetLostMode(...args),
  };
});

vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));

vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

vi.mock("@/components/qr/QrCodeButton", () => ({
  QrCodeButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

beforeEach(() => {
  const pet = structuredClone(mockPets[0]);
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.updatePetLostMode.mockImplementation(
    async (_id: string, enabled: boolean, lostMode: typeof pet.lostMode) => ({
      data: { ...pet, lostModeEnabled: enabled, lostMode },
    })
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps one Public Profile source of truth and hides unreleased owner tools", async () => {
  const pet = structuredClone(mockPets[0]);
  render(
    <PetManagementTabs
      moments={[]}
      pet={pet}
      records={[]}
      tags={[]}
    />
  );

  await screen.findByText("Sharing & Safety");

  expect(screen.queryByRole("tab", { name: "Privacy" })).toBeNull();
  expect(screen.queryByText("Public profile visibility")).toBeNull();
  expect(screen.queryByText("Safety Profile visibility")).toBeNull();
  const publicProfile = screen.getByRole("group", {
    name: "Public Profile overview",
  });
  expect(screen.getAllByRole("heading", { name: "Public Profile" })).toHaveLength(1);
  expect(within(publicProfile).getByText("Shared")).toBeTruthy();
  expect(
    within(publicProfile).getByText("Anyone with the link can view this page.")
  ).toBeTruthy();
  expect(
    within(publicProfile).queryByText(/^(On|Off|Public|Private)$/)
  ).toBeNull();
  expect(screen.queryByText(/Public profile is (on|off)/i)).toBeNull();
  expect(
    within(publicProfile).getByRole("link", { name: "Manage sharing" }).getAttribute(
      "href"
    )
  ).toBe(`/pets/${pet.id}/edit?tab=public`);

  expect(within(publicProfile).getAllByRole("link")).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: /View profile/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
  expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show Profile QR" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Smart Tag" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Smart Tags" })).toBeNull();
  expect(screen.queryByText("Edit Public Profile Settings")).toBeNull();
  expect(screen.queryByText("Edit Safety Settings")).toBeNull();

  const publicView = screen.getByRole("link", { name: /View profile/ });
  expect(publicView.getAttribute("target")).toBe("_blank");
  expect(publicView.getAttribute("rel")).toBe("noopener noreferrer");

  const profilesGrid = screen.getByRole("group", {
    name: "Sharing and safety profiles",
  });
  expect(profilesGrid.className).not.toContain("lg:grid-cols-2");
});

it("does not expose public actions when the pet profile is private", async () => {
  const pet = { ...structuredClone(mockPets[0]), publicProfileEnabled: false };
  mocks.getPetById.mockResolvedValue({ data: pet });
  render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );

  const publicProfile = await screen.findByRole("group", {
    name: "Public Profile overview",
  });
  expect(within(publicProfile).getByText("Not shared")).toBeTruthy();
  expect(within(publicProfile).getByText(/This profile is not shared/)).toBeTruthy();
  expect(
    within(publicProfile).getByRole("link", { name: "Manage sharing" }).getAttribute(
      "href"
    )
  ).toBe(`/pets/${pet.id}/edit?tab=public`);
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show Profile QR" })).toBeNull();
  expect(screen.queryByRole("link", { name: /View profile/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
});

it("leaves Share Center ownership outside the Overview subcard", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  const publicProfile = await screen.findByRole("group", {
    name: "Public Profile overview",
  });
  expect(within(publicProfile).getByRole("link", { name: "View profile" })).toBeTruthy();
  expect(within(publicProfile).getByRole("link", { name: "Manage sharing" })).toBeTruthy();
  expect(within(publicProfile).queryByRole("button")).toBeNull();
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
});

it("opens the care-record create flow while View all keeps the list state", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  const add = await screen.findByRole("link", { name: "Add Care Record" });
  const viewAll = screen
    .getAllByRole("link", { name: /View all/ })
    .find((link) => link.getAttribute("href")?.includes("/records"));

  expect(add.getAttribute("href")).toBe(`/pets/${pet.id}/records?create=1`);
  expect(viewAll?.getAttribute("href")).toBe(`/pets/${pet.id}/records`);
});

it("keeps Memorial editing while Archived restore guidance points to the header menu", async () => {
  const memorial = {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: "Memorial" as const,
  };
  mocks.getPetById.mockResolvedValue({ data: memorial });
  const { unmount } = render(
    <PetManagementTabs moments={[]} pet={memorial} records={[]} tags={[]} />
  );

  expect(
    (await screen.findByRole("link", { name: "Edit Memorial" })).getAttribute(
      "href"
    )
  ).toBe(`/pets/${memorial.id}/edit?tab=public`);

  unmount();

  const archived = {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: "Archived" as const,
  };
  mocks.getPetById.mockResolvedValue({ data: archived });
  render(
    <PetManagementTabs moments={[]} pet={archived} records={[]} tags={[]} />
  );

  expect(
    await screen.findByText("Restore this profile from the menu at the top of this page.")
  ).toBeTruthy();
  expect(screen.queryByText(/Restore this profile from the pet edit page/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Open Profile Status" })).toBeNull();
  expect(
    screen.queryByRole("link", { name: /Restore/i })
  ).toBeNull();
});

it("uses current Moment semantics and recent-history Care copy", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  expect(
    await screen.findByText("Photo and video moments you choose to keep private or share.")
  ).toBeTruthy();
  expect(screen.queryByText(/family-only/i)).toBeNull();
  expect(screen.getByRole("heading", { name: "Recent care records" })).toBeTruthy();
  expect(
    screen.getByText("The latest vaccines, deworming, grooming, and vet visits you've added.")
  ).toBeTruthy();
});

it("round-trips the shared Lost Mode control from the pet Overview", async () => {
  const pet = structuredClone(mockPets[0]);
  render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );

  await screen.findByText("Lost Mode");
  fireEvent.click(
    screen.getByRole("button", { name: "Turn on Lost Mode" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Activate Lost Mode" }));

  expect(await screen.findByText("On")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: `Mark ${pet.name} as Found` })
  ).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(
    "Lost Mode is now on"
  );

  fireEvent.click(
    screen.getByRole("button", { name: `Mark ${pet.name} as Found` })
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark as Found" }));

  await waitFor(() =>
    expect(mocks.updatePetLostMode).toHaveBeenLastCalledWith(
      pet.id,
      false,
      expect.objectContaining(pet.lostMode)
    )
  );
  expect(await screen.findByText("Off")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Lost Mode is off");
});
