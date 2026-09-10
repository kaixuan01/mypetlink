// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminRoutes } from "@/lib/routes";
import { EMPTY_ADMIN_DATA, type AdminDashboardData } from "@/services/adminService";
import { AdminDashboard } from "./AdminDashboard";

const state = vi.hoisted(() => ({
  dashboard: null as AdminDashboardData | null,
  error: "",
}));

vi.mock("@/components/admin/AdminOperationalContext", () => ({
  useAdminOperationalData: () => ({ dashboard: state.dashboard, error: state.error }),
}));

const summary = {
  totalOwners: 18,
  totalPets: 24,
  pendingPaymentProofs: 3,
  ordersPreparing: 2,
  activeTags: 12,
  lostOrDisabledTags: 1,
  unclaimedRetailTags: 8,
  lostModePets: 0,
};

const activity = {
  latestOrders: [{ id: "order-1", date: "9 Sep 2026", title: "MPL-001", detail: "Milo · Preparing", href: adminRoutes.orders }],
  latestPaymentProofs: [{ id: "proof-1", date: "9 Sep 2026", title: "MPL-002", detail: "Awaiting review", href: adminRoutes.paymentProofs }],
  recentTags: [{ id: "tag-1", date: "8 Sep 2026", title: "MPL-TAG-1", detail: "Activated", href: adminRoutes.smartTags }],
};

beforeEach(() => {
  state.dashboard = { summary, activity };
  state.error = "";
});
afterEach(cleanup);

describe("AdminDashboard", () => {
  it("orders actionable work before compact reference metrics and recent activity", () => {
    render(<AdminDashboard initialData={EMPTY_ADMIN_DATA} />);

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings.indexOf("Needs attention")).toBeLessThan(headings.indexOf("At a glance"));
    expect(headings.indexOf("At a glance")).toBeLessThan(headings.indexOf("Recent activity"));
    expect(screen.queryByText("Quick actions")).toBeNull();
  });

  it("shows only non-zero attention rows and links to existing operational destinations", () => {
    state.dashboard = {
      summary: { ...summary, ordersPreparing: 0 },
      activity,
    };
    render(<AdminDashboard initialData={EMPTY_ADMIN_DATA} />);

    const proof = screen.getByTestId("attention-item-payment-proofs");
    expect(proof.getAttribute("href")).toBe(adminRoutes.paymentProofsAwaitingReview);
    expect(screen.queryByTestId("attention-item-orders")).toBeNull();
  });

  it("uses a compact all-clear state when no current work needs attention", () => {
    state.dashboard = {
      summary: { ...summary, pendingPaymentProofs: 0, ordersPreparing: 0 },
      activity,
    };
    render(<AdminDashboard initialData={EMPTY_ADMIN_DATA} />);

    expect(screen.getByText("Nothing needs attention right now.")).toBeTruthy();
    expect(screen.queryByTestId(/attention-item/)).toBeNull();
  });

  it("groups contextual counts instead of rendering separate owner-style metric cards", () => {
    render(<AdminDashboard initialData={EMPTY_ADMIN_DATA} />);

    const owners = screen.getByRole("heading", { name: "Owners and pets" }).closest("section")!;
    expect(within(owners).getByText("Owners")).toBeTruthy();
    expect(within(owners).getByText("Pet profiles")).toBeTruthy();
    expect(within(owners).getByText("Lost Mode pets")).toBeTruthy();

    const tags = screen.getByRole("heading", { name: "Smart tags" }).closest("section")!;
    expect(within(tags).getByText("Active")).toBeTruthy();
    expect(within(tags).getByText("Unclaimed retail stock")).toBeTruthy();
    expect(within(tags).getByText("Lost or disabled")).toBeTruthy();
  });

  it("preserves all three recent activity feeds in one operational section", () => {
    render(<AdminDashboard initialData={EMPTY_ADMIN_DATA} />);

    expect(screen.getByRole("heading", { name: "Recent orders" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent payment proofs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent tag activity" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /MPL-001/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /MPL-002/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /MPL-TAG-1/ })).toBeTruthy();
  });

  it("uses compact shared empty panels for quiet recent feeds", () => {
    state.dashboard = { summary, activity: { latestOrders: [], latestPaymentProofs: [], recentTags: [] } };
    render(<AdminDashboard initialData={EMPTY_ADMIN_DATA} />);

    expect(screen.getByText("No orders yet.")).toBeTruthy();
    expect(screen.getByText("No payment proof submissions yet.")).toBeTruthy();
    expect(screen.getByText("No tag activity yet.")).toBeTruthy();
  });
});
