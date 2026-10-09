// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities } from "@/lib/adminCapabilities";
import type { HouseholdModeration } from "@/services/adminCommunityModerationService";
import { AdminOwnerModerationSection } from "./AdminOwnerModerationSection";

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  warn: vi.fn(),
  restrict: vi.fn(),
  lift: vi.fn(),
  suspend: vi.fn(),
  reinstate: vi.fn(),
  access: { isSuperAdmin: false, roles: [] as string[], granted: new Set<string>() },
}));

vi.mock("@/services/authService", async (original) => ({
  ...await original<typeof import("@/services/authService")>(),
  getAdminCapabilities: () => mock.access,
}));

vi.mock("@/services/adminCommunityModerationService", async (original) => ({
  ...await original<typeof import("@/services/adminCommunityModerationService")>(),
  getHouseholdModeration: mock.get,
  issueCommunityWarning: mock.warn,
  restrictCommunity: mock.restrict,
  liftCommunityRestriction: mock.lift,
  suspendOwnerAccount: mock.suspend,
  reinstateOwnerAccount: mock.reinstate,
}));

const ownerId = "11111111-1111-4111-8111-111111111111";

function household(overrides: Partial<HouseholdModeration> = {}): HouseholdModeration {
  return {
    household: {
      ownerId,
      handle: "limfamily",
      displayName: "The Lim Family",
      communityEnabled: true,
      communityRestricted: false,
      communityRestrictedAt: null,
      accountActive: true,
    },
    accountStatus: "Active",
    communityStatus: "On",
    warningCount: 1,
    restrictedAt: null,
    restrictedUntil: null,
    history: [{
      id: "h1",
      action: "WarningIssued",
      reason: "Harassment",
      internalRemark: "Second time this week",
      performedByName: "Moderator One",
      createdAt: "2026-10-07T02:00:00Z",
      restrictedUntil: null,
      momentId: null,
      commentId: null,
      reportId: null,
      contentSnapshot: null,
    }],
    historyTotal: 1,
    availableActions: ["IssueWarning", "RestrictCommunity", "SuspendAccount"],
    ...overrides,
  };
}

function grant(...capabilities: string[]) {
  mock.access = { isSuperAdmin: false, roles: [], granted: new Set(capabilities) };
}

beforeEach(() => {
  grant(
    adminCapabilities.communityReportsView,
    adminCapabilities.communityReportsResolve,
    adminCapabilities.communityModerationEnforce,
    adminCapabilities.ownersSuspend
  );
  mock.get.mockResolvedValue(household());
  for (const action of [mock.warn, mock.restrict, mock.lift, mock.suspend, mock.reinstate]) {
    action.mockResolvedValue({ actionId: "a1", action: "Done", restrictedUntil: null });
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminOwnerModerationSection", () => {
  it("shows Community standing, warnings and history, with account suspension kept apart", async () => {
    render(<AdminOwnerModerationSection ownerUserId={ownerId} />);

    expect(await screen.findByText("Warning issued")).toBeTruthy();
    expect(screen.getByText("Second time this week")).toBeTruthy();
    expect(screen.getByText(/Reason: Harassment · By Moderator One/)).toBeTruthy();
    const account = screen.getByTestId("owner-account-suspension");
    expect(within(account).getByRole("button", { name: "Suspend account" })).toBeTruthy();
    // Community actions are not in the account block, and suspension is not among them.
    expect(within(account).queryByRole("button", { name: "Restrict Community" })).toBeNull();
    expect(screen.getByRole("button", { name: "Restrict Community" })).toBeTruthy();
  });

  it("restricts Community for a chosen time with a required reason", async () => {
    render(<AdminOwnerModerationSection ownerUserId={ownerId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Restrict Community" }));
    const dialog = screen.getByRole("dialog", { name: "Restrict Community" });
    const confirm = within(dialog).getByRole("button", { name: "Restrict Community" });
    expect(confirm).toHaveProperty("disabled", true);

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Reason" }), { target: { value: "Harassment" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "How long" }), { target: { value: "7d" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Internal remark/ }), { target: { value: "Pattern across three reports" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(mock.restrict).toHaveBeenCalledWith(ownerId, "Harassment", "7d", "Pattern across three reports"));
    expect(await screen.findByText("Community access restricted. The household has been told.")).toBeTruthy();
    expect(mock.suspend).not.toHaveBeenCalled();
  });

  it("asks before suspending a whole account and says what it means", async () => {
    const onAccountChanged = vi.fn();
    render(<AdminOwnerModerationSection onAccountChanged={onAccountChanged} ownerUserId={ownerId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Suspend account" }));
    const dialog = screen.getByRole("dialog", { name: "Suspend account" });
    expect(within(dialog).getByText(/no longer be able to sign in to MyPetLink at all/)).toBeTruthy();
    expect(within(dialog).queryByRole("combobox", { name: "How long" })).toBeNull();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Reason" }), { target: { value: "ScamOrFraud" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));

    await waitFor(() => expect(mock.suspend).toHaveBeenCalledWith(ownerId, "ScamOrFraud", ""));
    expect(onAccountChanged).toHaveBeenCalled();
  });

  it("offers only what the moderator's access and the household's state allow", async () => {
    grant(adminCapabilities.communityReportsView, adminCapabilities.communityReportsResolve);
    mock.get.mockResolvedValue(household({
      communityStatus: "Restricted",
      restrictedAt: "2026-10-07T02:00:00Z",
      restrictedUntil: "2026-10-14T02:00:00Z",
      availableActions: ["IssueWarning", "RestrictCommunity", "LiftCommunityRestriction", "SuspendAccount"],
    }));

    render(<AdminOwnerModerationSection ownerUserId={ownerId} />);

    expect(await screen.findByRole("button", { name: "Issue warning" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restrict Community" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lift Community restriction" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Suspend account" })).toBeNull();
    expect(screen.getByText("Restricted")).toBeTruthy();
  });

  it("is not shown at all without access to Community moderation", () => {
    grant(adminCapabilities.ownersView);
    const { container } = render(<AdminOwnerModerationSection ownerUserId={ownerId} />);
    expect(container.innerHTML).toBe("");
    expect(mock.get).not.toHaveBeenCalled();
  });
});
