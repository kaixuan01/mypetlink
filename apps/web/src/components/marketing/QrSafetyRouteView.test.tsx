// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getFinderState: vi.fn(),
  getSafetyProfile: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", () => ({
  getPublicPetProfileBySafetyCode: (...args: unknown[]) =>
    mocks.getSafetyProfile(...args),
}));

vi.mock("@/services/tagService", () => ({
  getFinderState: (...args: unknown[]) => mocks.getFinderState(...args),
}));

vi.mock("@/components/portal/TagFinderView", () => ({
  FinderShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  TagFinderView: ({ source, tagCode }: { source: string; tagCode: string }) => (
    <div>Physical tag: {source}:{tagCode}</div>
  ),
}));

vi.mock("@/components/marketing/QrSafetyPageView", () => ({
  QrSafetyPageView: ({ pet }: { pet: { lostModeEnabled: boolean } }) => (
    <div>Lost status: {pet.lostModeEnabled ? "On" : "Off"}</div>
  ),
}));

const { QrSafetyRouteView } = await import("./QrSafetyRouteView");

beforeEach(() => {
  mocks.getSafetyProfile.mockResolvedValue({ data: mockPets[0] });
  mocks.getFinderState.mockResolvedValue({
    state: "not-found",
    tagCode: "unknown",
  });
});

it("preserves pet Safety Profiles before resolving the shared /q code as a physical QR", async () => {
  render(
    <QrSafetyRouteView
      initialProfile={mockPets[0]}
      safetyCode={mockPets[0].safetyCode}
    />
  );

  expect(await screen.findByText("Lost status: Off")).toBeTruthy();
  expect(mocks.getFinderState).not.toHaveBeenCalled();
});

it("falls back to the trusted QR tag resolver when no pet Safety Profile matches", async () => {
  mocks.getSafetyProfile.mockResolvedValue({ data: null });
  mocks.getFinderState.mockResolvedValue({
    state: "unassigned",
    tagCode: "MPL-QR-01",
  });

  render(
    <QrSafetyRouteView initialProfile={null} safetyCode="MPL-QR-01" />
  );

  expect(await screen.findByText("Physical tag: qr:MPL-QR-01")).toBeTruthy();
  expect(mocks.getFinderState).toHaveBeenCalledWith("MPL-QR-01", "qr");
});

it("leaves the page title to the tag view once a /q code resolves to a physical tag", async () => {
  mocks.getSafetyProfile.mockResolvedValue({ data: null });
  mocks.getFinderState.mockResolvedValue({
    state: "active",
    tagCode: "MPL-QR-02",
    profile: mockPets[0],
  });

  render(<QrSafetyRouteView initialProfile={null} safetyCode="MPL-QR-02" />);

  expect(await screen.findByText("Physical tag: qr:MPL-QR-02")).toBeTruthy();
  await waitFor(() =>
    expect(document.title).not.toContain("Safety Profile not found")
  );
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
