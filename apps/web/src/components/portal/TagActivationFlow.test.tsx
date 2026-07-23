// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    mocks.getFinderState.mockReset();
    mocks.getPets.mockResolvedValue({
      data: [
        {
          id: "pet-1",
          name: "Topu",
          species: "Cat",
          lifecycleStatus: "Active",
          publicProfilePath: "/p/topu-code",
        },
      ],
    });
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
      await screen.findByRole("heading", { name: "Tag activated" })
    ).toBeTruthy();
    expect(mocks.activateTag).toHaveBeenCalledTimes(1);
    expect(mocks.getFinderState).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getAllTags).toHaveBeenCalled());
  });
});
