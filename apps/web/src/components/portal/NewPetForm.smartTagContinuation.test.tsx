// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getFriendlyApiErrorMessage: () => "Pet profiles unavailable.",
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));

vi.mock("@/lib/planLimits", () => ({
  getPetLimitStateFromPets: () => ({ canCreate: true }),
}));

vi.mock("@/components/portal/PetProfileForm", () => ({
  PetProfileForm: ({ returnToSmartTagOrder }: { returnToSmartTagOrder?: boolean }) => (
    <div>Continuation: {String(Boolean(returnToSmartTagOrder))}</div>
  ),
}));

const { NewPetForm } = await import("./NewPetForm");

beforeEach(() => {
  mocks.getPets.mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("preserves the safe Smart Tag continuation for post-create routing", async () => {
  window.history.replaceState(
    {},
    "",
    "/pets/new?returnTo=%2Ftags%2Forder"
  );

  render(<NewPetForm />);

  expect(await screen.findByText("Continuation: true")).toBeTruthy();
  expect(screen.getByText(/bring you back to choose a physical Smart Tag/i)).toBeTruthy();
});

it("rejects an external return URL", async () => {
  window.history.replaceState(
    {},
    "",
    "/pets/new?returnTo=https%3A%2F%2Fevil.example%2Ftags%2Forder"
  );

  render(<NewPetForm />);

  await waitFor(() => expect(screen.getByText("Continuation: false")).toBeTruthy());
  expect(screen.queryByText(/bring you back to choose a physical Smart Tag/i)).toBeNull();
});
