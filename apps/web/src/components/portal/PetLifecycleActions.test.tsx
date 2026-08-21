// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { getPetLifecycleConfirmation } from "@/lib/petLifecycleActions";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  restorePetProfile: vi.fn(),
  updatePetLifecycle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    restorePetProfile: (...args: unknown[]) => mocks.restorePetProfile(...args),
    updatePetLifecycle: (...args: unknown[]) => mocks.updatePetLifecycle(...args),
  };
});

const { PetLifecycleActions } = await import("./PetLifecycleActions");

function pet(status: Pet["lifecycleStatus"]): Pet {
  return {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: status,
    previousLifecycleStatus: status === "Memorial" ? "Memorial" : "Active",
  };
}

function openHeaderMenu(value: Pet) {
  render(<PetLifecycleActions asMenu pet={value} />);
  fireEvent.click(
    screen.getByRole("button", { name: `More actions for ${value.name}` })
  );
}

beforeEach(() => {
  mocks.updatePetLifecycle.mockImplementation(
    async (_id: string, status: Pet["lifecycleStatus"]) => ({
      data: pet(status),
    })
  );
  mocks.restorePetProfile.mockResolvedValue({ data: { pet: pet("Active") } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Pet Detail Header lifecycle menu", () => {
  it.each([
    ["Active", ["Move to Memorial", "Archive Pet"]],
    ["Memorial", ["Restore to Active", "Archive Pet"]],
    ["Archived", ["Restore to List"]],
  ] as const)("offers only valid actions for %s pets", (status, labels) => {
    openHeaderMenu(pet(status));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(labels);
  });

  it("uses the shared confirmation copy and existing Memorial endpoint", async () => {
    const active = pet("Active");
    const copy = getPetLifecycleConfirmation("memorial", active.name);
    openHeaderMenu(active);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Memorial" }));

    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.confirmLabel }));

    await waitFor(() =>
      expect(mocks.updatePetLifecycle).toHaveBeenCalledWith(
        active.id,
        "Memorial"
      )
    );
  });
});
