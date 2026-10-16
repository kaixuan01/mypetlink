// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getQrSafetyPath, ownerRoutes } from "@/lib/routes";

const pets = [
  {
    id: "pet-1",
    name: "Topu",
    species: "Cat",
    lifecycleStatus: "Active",
    publicProfilePath: "/p/topu-code",
    safetyCode: "SAFE-TOPU",
  },
  {
    id: "pet-2",
    name: "Milo & Luna's <b>Best Friend</b>",
    species: "Dog",
    lifecycleStatus: "Active",
    publicProfilePath: "/p/milo-code",
    safetyCode: "SAFE-MILO",
  },
];

const mocks = vi.hoisted(() => ({
  activateTag: vi.fn(),
  getAllTags: vi.fn(),
  getFinderState: vi.fn(),
  getPets: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => true,
  loginMockOwner: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));

vi.mock("@/services/tagService", () => ({
  activateTag: (...args: unknown[]) => mocks.activateTag(...args),
  getAllTags: (...args: unknown[]) => mocks.getAllTags(...args),
  getFinderState: (...args: unknown[]) => mocks.getFinderState(...args),
  getFriendlyTagErrorMessage: () => "Tag unavailable",
}));

const { TagActivationFlow } = await import("./TagActivationFlow");

describe("TagActivationFlow resolved-state reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPets.mockResolvedValue({ data: pets });
    mocks.getAllTags.mockResolvedValue({ data: [] });
    mocks.activateTag.mockResolvedValue({ data: { tagCode: "MPL-ACTIVATE-01" } });
  });

  afterEach(cleanup);

  it("uses the top-level result and does not resolve again after activation", async () => {
    render(
      <TagActivationFlow
        initialResult={{ state: "unassigned", tagCode: "MPL-ACTIVATE-01" }}
        source="qr"
        tagCode="MPL-ACTIVATE-01"
      />
    );

    await screen.findByRole("button", { name: "Activate Tag" });
    fireEvent.click(screen.getByRole("button", { name: "Activate Tag" }));

    expect(
      await screen.findByRole("heading", { name: "Smart Tag Activated!" })
    ).toBeTruthy();
    expect(mocks.activateTag).toHaveBeenCalledTimes(1);
    expect(mocks.getFinderState).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getAllTags).toHaveBeenCalled());
  });

  it.each(["qr", "legacy"] as const)(
    "shows only Safety Profile and pet detail actions for the selected pet after %s activation",
    async (source) => {
      render(
        <TagActivationFlow
          initialResult={{ state: "unassigned", tagCode: "MPL-ACTIVATE-01" }}
          source={source}
          tagCode="MPL-ACTIVATE-01"
        />
      );

      const pet = pets[1];
      fireEvent.click(await screen.findByRole("button", { name: new RegExp("Milo & Luna") }));
      fireEvent.click(screen.getByRole("button", { name: "Activate Tag" }));

      const heading = await screen.findByRole("heading", { name: "Smart Tag Activated!" });
      const card = within(heading.closest("article")!);
      expect(card.getByText(
        `${pet.name}'s Smart Tag is now active! Anyone who scans it can view ${pet.name}'s Safety Profile and contact you if needed.`
      )).toBeTruthy();
      expect(heading.closest("article")!.querySelector("b")).toBeNull();
      expect(card.getByText("MPL-ACTIVATE-01")).toBeTruthy();
      expect(card.getByText("Your Smart Tag is ready to use.")).toBeTruthy();
      expect(card.getAllByRole("link")).toHaveLength(2);
      expect(card.queryAllByRole("button")).toHaveLength(0);

      const safety = card.getByRole("link", { name: "View Safety Profile" });
      expect(safety.getAttribute("href")).toBe(getQrSafetyPath(pet));
      expect(safety.getAttribute("target")).toBe("_blank");
      expect(safety.getAttribute("rel")).toBe("noopener noreferrer");
      expect(card.getByRole("link", { name: "Back to My Pet" }).getAttribute("href"))
        .toBe(ownerRoutes.petProfile(pet.id));
      expect(card.queryByRole("link", { name: /Share Profile|Tag Scan Page|Dashboard|Test Smart Tag/ }))
        .toBeNull();
      expect(mocks.activateTag).toHaveBeenCalledExactlyOnceWith("MPL-ACTIVATE-01", pet.id);
      expect(mocks.getFinderState).not.toHaveBeenCalled();
    }
  );

  it("keeps the assigned pet context when activating a tag from an order", async () => {
    const pet = pets[1];
    mocks.getAllTags.mockResolvedValue({ data: [{
      tagCode: "MPL-ORDER-01", petId: pet.id, status: "Delivered", isArchived: false,
    }] });
    render(
      <TagActivationFlow
        initialResult={{ state: "pending", tagCode: "MPL-ORDER-01", status: "Delivered" }}
        source="qr"
        tagCode="MPL-ORDER-01"
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Activate Tag" }));
    await screen.findByRole("heading", { name: "Smart Tag Activated!" });
    expect(screen.getByRole("link", { name: "View Safety Profile" }).getAttribute("href"))
      .toBe(getQrSafetyPath(pet));
    expect(screen.getByRole("link", { name: "Back to My Pet" }).getAttribute("href"))
      .toBe(ownerRoutes.petProfile(pet.id));
    expect(screen.getByText("MPL-ORDER-01")).toBeTruthy();
    expect(mocks.activateTag).toHaveBeenCalledExactlyOnceWith("MPL-ORDER-01", undefined);
    expect(mocks.getFinderState).not.toHaveBeenCalled();
  });
});
