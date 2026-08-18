// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  updatePetLostMode: vi.fn(),
  writeText: vi.fn(),
  shareCardsEnabled: true,
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return {
    ...actual,
    get shareCardsEnabled() {
      return mocks.shareCardsEnabled;
    },
  };
});

vi.mock("@/components/share/PetShareCard", () => ({
  PetShareCard: () => <button type="button">Share Card</button>,
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
  mocks.shareCardsEnabled = true;
  const pet = structuredClone(mockPets[0]);
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.updatePetLostMode.mockImplementation(
    async (_id: string, enabled: boolean, lostMode: typeof pet.lostMode) => ({
      data: { ...pet, lostModeEnabled: enabled, lostMode },
    })
  );
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps one Public Profile action set and hides unreleased owner tools", async () => {
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

  // Sharing is reached through one entry point, not a row of competing actions.
  expect(screen.getAllByRole("link", { name: "View Profile" })).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show Profile QR" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Smart Tag" })).toBeNull();
  expect(screen.queryByText("Edit Public Profile Settings")).toBeNull();
  expect(screen.queryByText("Edit Safety Settings")).toBeNull();

  const publicView = screen.getByRole("link", { name: "View Profile" });
  expect(publicView.getAttribute("target")).toBe("_blank");
  expect(publicView.getAttribute("rel")).toBe("noopener noreferrer");

  fireEvent.click(screen.getByRole("button", { name: `Share ${pet.name}` }));
  expect(screen.getByRole("button", { name: "Share Card" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /Show Profile QR/ })).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: /Copy Profile Link/ }));
  await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByText(`${pet.name}'s profile link copied.`)
  ).toBeTruthy();
});

it("does not expose public actions when the pet profile is private", async () => {
  const pet = { ...structuredClone(mockPets[0]), publicProfileEnabled: false };
  mocks.getPetById.mockResolvedValue({ data: pet });
  render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );

  await screen.findByText("Private");
  expect(screen.getByText(/sharing actions are unavailable/i)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Manage Public Profile" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show Profile QR" })).toBeNull();
  expect(screen.queryByRole("link", { name: "View Profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
});

it("hides Share Card controls while the rollout flag is off", async () => {
  mocks.shareCardsEnabled = false;
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  await screen.findByText("Sharing & Safety");
  expect(screen.getByRole("link", { name: "View Profile" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: `Share ${pet.name}` }));
  expect(screen.getByRole("button", { name: /Copy Profile Link/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
});

it("round-trips the shared Lost Mode control from the pet Overview", async () => {
  const pet = structuredClone(mockPets[0]);
  render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );

  await screen.findByText("Lost Mode");
  fireEvent.click(
    screen.getByRole("button", { name: `Mark ${pet.name} as Lost` })
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
