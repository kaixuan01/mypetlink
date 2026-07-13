// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/layouts/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/portal/DashboardClient", () => ({
  DashboardClient: (props: {
    initialPets: unknown[];
    initialRecords: unknown[];
    initialMoments: unknown[];
    initialTags: unknown[];
    initialOrders: unknown[];
  }) => (
    <output data-testid="dashboard-initial-data">
      {Object.values(props).reduce((total, items) => total + items.length, 0)}
    </output>
  ),
}));

const { default: DashboardPage } = await import("./page");

it("passes no local pet, record, moment, tag, or order data into the dashboard page", () => {
  render(<DashboardPage />);

  expect(screen.getByTestId("dashboard-initial-data").textContent).toBe("0");
});
