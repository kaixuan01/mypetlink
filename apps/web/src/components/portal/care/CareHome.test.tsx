// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/portal/care/CarePlanner", () => ({
  CarePlanner: ({ initialPetId }: { initialPetId?: string }) => (
    <div data-testid="planner">planner for {initialPetId ?? "all pets"}</div>
  ),
}));
vi.mock("@/components/portal/GenericPetSection", () => ({
  GenericPetSection: () => <div data-testid="history">history picker</div>,
}));

const { CareHome } = await import("./CareHome");

afterEach(() => cleanup());

describe("Care", () => {
  it("opens on the planner for all pets", async () => {
    window.history.replaceState({}, "", "/records");
    render(<CareHome />);

    expect(await screen.findByText("planner for all pets")).toBeTruthy();
    expect(screen.queryByTestId("history")).toBeNull();
  });

  it("honours a pet filter and the All records view from the address", async () => {
    window.history.replaceState({}, "", "/records?pet=pet-oyen");
    const first = render(<CareHome />);
    expect(await screen.findByText("planner for pet-oyen")).toBeTruthy();
    first.unmount();

    window.history.replaceState({}, "", "/records?view=all");
    render(<CareHome />);
    expect(await screen.findByTestId("history")).toBeTruthy();
  });

  it("switches views and records the choice for Back", async () => {
    window.history.replaceState({}, "", "/records");
    render(<CareHome />);
    await screen.findByTestId("planner");

    // Tabs may sit in the More menu when there is no measured width (jsdom).
    const tab = screen.getAllByText("All records").map((node) => node.closest("button,[role=menuitem]")).find(Boolean)!;
    fireEvent.click(tab);

    expect(await screen.findByTestId("history")).toBeTruthy();
    expect(window.location.search).toBe("?view=all");
  });
});
