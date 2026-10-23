// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetListItem } from "@/types";

const flags = vi.hoisted(() => ({ weeklyRecapEnabled: true }));

vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return {
    ...actual,
    get weeklyRecapEnabled() {
      return flags.weeklyRecapEnabled;
    },
  };
});

const { DashboardRecentMoments } = await import("./DashboardRecentMoments");

const pets = [
  { id: "milo", name: "Milo", lostModeEnabled: false },
  { id: "oyen", name: "Oyen", lostModeEnabled: false },
] as PetListItem[];

beforeEach(() => {
  flags.weeklyRecapEnabled = true;
});

afterEach(() => cleanup());

function renderPanel(props: Partial<Parameters<typeof DashboardRecentMoments>[0]> = {}) {
  render(
    <DashboardRecentMoments
      onRetry={() => {}}
      pets={pets}
      scopePetIds={["milo", "oyen"]}
      state={{ status: "ready", loads: [] }}
      {...props}
    />
  );
}

describe("Weekly Recap from Home", () => {
  it("names the pet in view and claims nothing about its week", () => {
    renderPanel({ scopePetIds: ["milo"], singlePetId: "milo" });

    const link = screen.getByRole("link", { name: /See Milo's week/ });
    expect(link.getAttribute("href")).toBe("/recap?pet=milo&from=dashboard");
    expect(link.textContent).not.toMatch(/\d|ready/i);
  });

  it("offers the recap without a pet when several are in view", () => {
    renderPanel();

    expect(screen.getByRole("link", { name: /Weekly recap/ }).getAttribute("href")).toBe("/recap?from=dashboard");
  });

  it("gives no prompt for a pet in Lost Mode, while loading, or while the feature is off", () => {
    render(
      <DashboardRecentMoments
        onRetry={() => {}}
        pets={[{ ...pets[0], lostModeEnabled: true }]}
        scopePetIds={["milo"]}
        singlePetId="milo"
        state={{ status: "ready", loads: [] }}
      />
    );
    expect(screen.queryByRole("link", { name: /week|recap/i })).toBeNull();
    cleanup();

    renderPanel({ state: { status: "loading" } });
    expect(screen.queryByRole("link", { name: /Weekly recap/ })).toBeNull();
    cleanup();

    flags.weeklyRecapEnabled = false;
    renderPanel();
    expect(screen.queryByRole("link", { name: /Weekly recap/ })).toBeNull();
  });
});
