// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getSafetyProfile: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", () => ({
  getPublicPetProfileBySafetyCode: (...args: unknown[]) =>
    mocks.getSafetyProfile(...args),
}));

vi.mock("@/components/marketing/QrSafetyPageView", () => ({
  QrSafetyPageView: ({ pet }: { pet: { lostModeEnabled: boolean } }) => (
    <div>Lost status: {pet.lostModeEnabled ? "On" : "Off"}</div>
  ),
}));

const { QrSafetyRouteView } = await import("./QrSafetyRouteView");

beforeEach(() => {
  mocks.getSafetyProfile.mockResolvedValue({ data: mockPets[0] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("refreshes Lost Mode when an already-open QR Safety Page regains focus", async () => {
  const initialProfile = { ...mockPets[0], lostModeEnabled: false };
  mocks.getSafetyProfile.mockResolvedValueOnce({ data: initialProfile });

  render(
    <QrSafetyRouteView
      initialProfile={initialProfile}
      safetyCode={initialProfile.safetyCode}
    />
  );

  expect(await screen.findByText("Lost status: Off")).toBeTruthy();
  await waitFor(() => expect(mocks.getSafetyProfile).toHaveBeenCalledOnce());

  mocks.getSafetyProfile.mockResolvedValue({
    data: { ...initialProfile, lostModeEnabled: true },
  });
  fireEvent.focus(window);

  expect(await screen.findByText("Lost status: On")).toBeTruthy();
  expect(mocks.getSafetyProfile).toHaveBeenCalledTimes(2);
});
