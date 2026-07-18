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

it("keeps one complete action set on each public profile card", async () => {
  const pet = structuredClone(mockPets[0]);
  render(
    <PetManagementTabs
      moments={[]}
      pet={pet}
      records={[]}
      tags={[]}
    />
  );

  await screen.findByText("Public Share Profile");

  expect(
    screen.getAllByRole("link", { name: "View Public Profile" })
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("link", { name: "View Safety Profile" })
  ).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Copy Link" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Show QR" })).toHaveLength(2);
  expect(screen.queryByText("Edit Public Profile Settings")).toBeNull();
  expect(screen.queryByText("Edit Safety Settings")).toBeNull();

  const publicView = screen.getByRole("link", { name: "View Public Profile" });
  expect(publicView.getAttribute("target")).toBe("_blank");
  expect(publicView.getAttribute("rel")).toBe("noopener noreferrer");

  fireEvent.click(screen.getAllByRole("button", { name: "Copy Link" })[0]);
  await waitFor(() => expect(mocks.writeText).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Public Share Profile link copied.")).toBeTruthy();
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
