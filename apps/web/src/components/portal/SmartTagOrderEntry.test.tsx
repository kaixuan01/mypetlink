// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/portal/TagOrderFlow", () => ({
  TagOrderFlow: ({ preselectedPetId }: { preselectedPetId?: string }) => (
    <div data-testid="real-order-wizard">
      Real order wizard; preferred pet: {preselectedPetId ?? "none"}
    </div>
  ),
}));

const { SmartTagOrderEntry } = await import("./SmartTagOrderEntry");

beforeEach(() => {
  window.history.replaceState({}, "", "/tags/order");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SmartTagOrderEntry", () => {
  it("opens the real wizard directly without a preliminary pet chooser", () => {
    render(<SmartTagOrderEntry />);

    expect(screen.getByTestId("real-order-wizard")).toBeTruthy();
    expect(screen.queryByText("Who is this physical tag for?")).toBeNull();
  });

  it("passes the pet-specific preference to the real wizard after refresh", () => {
    window.history.replaceState({}, "", "/tags/order?petId=pet_owned");

    render(<SmartTagOrderEntry />);

    expect(screen.getByText(/preferred pet: pet_owned/)).toBeTruthy();
  });

  it("keeps legacy pet query links compatible", () => {
    window.history.replaceState({}, "", "/tags/order?pet=pet_legacy");

    render(<SmartTagOrderEntry />);

    expect(screen.getByText(/preferred pet: pet_legacy/)).toBeTruthy();
  });
});
