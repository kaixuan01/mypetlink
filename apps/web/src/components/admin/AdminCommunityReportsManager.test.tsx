// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { adminCapabilities } from "@/lib/adminCapabilities";
import type { CommunityReportDetail, CommunityReportSummary } from "@/services/adminCommunityReportService";
import { AdminCommunityReportsManager, availableModerationActions } from "./AdminCommunityReportsManager";

const mock = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), act: vi.fn(),
  reportId: "", query: { page: 1, pageSize: 20, search: "", sortBy: "queue", sortDir: "desc", filters: {} as Record<string, string> },
  access: { isSuperAdmin: false, roles: [], granted: new Set<string>() },
  setFilter: vi.fn(), setFilters: vi.fn(), clear: vi.fn(), setPage: vi.fn(), setSize: vi.fn(), setExtra: vi.fn(),
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (original) => ({
  ...await original<typeof import("@/components/admin/table/useAdminTableQuery")>(),
  useAdminTableQuery: () => ({
    query: mock.query,
    hasActiveFilters: Object.keys(mock.query.filters).length > 0,
    actions: { setFilter: mock.setFilter, setFilters: mock.setFilters, clearAllFilters: mock.clear, setPage: mock.setPage, setPageSize: mock.setSize, setExtraParam: mock.setExtra, getExtraParam: () => mock.reportId },
  }),
}));
vi.mock("@/services/adminCommunityReportService", async (original) => ({
  ...await original<typeof import("@/services/adminCommunityReportService")>(),
  listCommunityReports: mock.list,
  getCommunityReport: mock.get,
  actOnCommunityReport: mock.act,
}));
vi.mock("@/services/authService", async (original) => ({
  ...await original<typeof import("@/services/authService")>(),
  getAdminCapabilities: () => mock.access,
}));

const household = {
  ownerId: "11111111-1111-4111-8111-111111111111", handle: "luna-family", displayName: "Luna Family",
  communityEnabled: true, communityRestricted: false, communityRestrictedAt: null, accountActive: true,
};
const summary: CommunityReportSummary = {
  id: "22222222-2222-4222-8222-222222222222", targetType: "Comment", reason: "SpamOrScam", status: "Open", resolution: null,
  createdAt: "2026-09-20T09:00:00Z", reviewedAt: null, snapshotHandle: "old-handle", snapshotDisplayName: "Old Name",
  reportedHousehold: household, openReportsOnTarget: 2,
};
const detail: CommunityReportDetail = {
  id: summary.id, targetType: "Comment", reason: "SpamOrScam", status: "Open", resolution: null,
  createdAt: summary.createdAt, reviewedAt: null, reportedHousehold: household, openReportsOnTarget: 2,
  details: "<script>alert('report')</script>", reviewNote: null, reviewedByName: null, rowVersion: "AQID",
  evidence: { handle: "old-handle", displayName: "Old Name", title: null, text: "<img src=x onerror=alert(1)>", avatarUrl: null },
  householdPubliclyVisible: true,
  currentComment: { body: "Current Comment", removed: false, removedAt: null, removedBy: null, publiclyVisible: true },
  currentMoment: { title: "Parent Moment", caption: "Current caption", visibility: "Public", archivedAt: null, deleted: false, hidden: false, hiddenAt: null, publiclyVisible: true, media: [] },
  targetHistory: [{ id: "33333333-3333-4333-8333-333333333333", targetType: "Comment", reason: "Other", status: "Resolved", resolution: "Dismissed", createdAt: summary.createdAt, reviewedAt: summary.createdAt }],
  targetHistoryTotal: 3, householdHistory: [], householdHistoryTotal: 4, involvesYou: false,
  availableActions: ["Dismiss", "RemoveComment", "RestrictHousehold"],
};

function grant(...capabilities: string[]) {
  mock.access = { isSuperAdmin: false, roles: [], granted: new Set(capabilities) };
}

beforeEach(() => {
  mock.reportId = "";
  mock.query = { page: 1, pageSize: 20, search: "", sortBy: "queue", sortDir: "desc", filters: {} };
  grant(adminCapabilities.communityReportsView, adminCapabilities.communityReportsResolve, adminCapabilities.communityModerationEnforce);
  mock.list.mockResolvedValue({ items: [summary], total: 1 });
  mock.get.mockResolvedValue(detail);
  mock.act.mockResolvedValue({ outcome: "Applied", reportsResolved: 2 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Community report queue", () => {
  it("shows a loading state, server results and paging without client ordering", async () => {
    mock.list.mockReturnValue(new Promise(() => {}));
    const view = render(<AdminCommunityReportsManager />);
    expect(screen.getByText("Loading records.")).toBeDefined();
    view.unmount();
    mock.list.mockResolvedValue({ items: [summary], total: 45 });
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByText("Luna Family")).toBeDefined();
    expect(screen.getByText("Page 1 of 3")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(mock.setPage).toHaveBeenCalledWith(2);
    expect(mock.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }), expect.any(AbortSignal));
    expect(Object.keys(mock.list.mock.calls[0][0])).not.toContain("sortBy");
  });

  it("sends supported filters to the server and resets them", async () => {
    mock.query.filters = { status: "Open", targetType: "Moment", reason: "PrivacyConcern", reportedOwnerId: household.ownerId, createdFrom: "2026-09-01", createdTo: "2026-09-25" };
    render(<AdminCommunityReportsManager />);
    await screen.findByText("Luna Family");
    expect(mock.list).toHaveBeenCalledWith(expect.objectContaining({ status: "Open", targetType: "Moment", reason: "PrivacyConcern", reportedOwnerId: household.ownerId, createdFrom: "2026-09-01T00:00:00.000Z", createdTo: "2026-09-25T23:59:59.999Z" }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(mock.clear).toHaveBeenCalled();
  });

  it("rejects an invalid household or date range before requesting the queue", () => {
    mock.query.filters = { reportedOwnerId: "not-a-household", createdFrom: "2026-09-25", createdTo: "2026-09-01" };
    render(<AdminCommunityReportsManager />);
    expect(screen.getByRole("alert")).toHaveProperty("textContent", "Enter a valid reported household ID.");
    expect(mock.list).not.toHaveBeenCalled();
  });

  it("distinguishes empty, filtered empty and error", async () => {
    mock.list.mockResolvedValue({ items: [], total: 0 });
    const view = render(<AdminCommunityReportsManager />);
    expect(await screen.findByText("No Community reports yet.")).toBeDefined();
    view.unmount();
    mock.query.filters = { status: "Open" };
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByText("No reports match these filters.")).toBeDefined();
    cleanup();
    mock.list.mockRejectedValue(new Error("offline"));
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Couldn’t load Community reports.");
    const beforeRetry = mock.list.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(mock.list).toHaveBeenCalledTimes(beforeRetry + 1));
  });

  it("explains lost view permission", async () => {
    mock.list.mockRejectedValue(new ApiClientError(403, "forbidden", "private detail"));
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByText("You no longer have access to Community reports.")).toBeDefined();
    expect(screen.queryByText("private detail")).toBeNull();
  });
});

describe("Community report detail", () => {
  beforeEach(() => { mock.reportId = summary.id; });

  it.each(["Comment", "Moment", "Household"] as const)("separates report, current state and evidence for %s", async (targetType) => {
    mock.get.mockResolvedValue({ ...detail, targetType });
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByRole("heading", { name: "Evidence at time of report" })).toBeDefined();
    expect(screen.getByRole("heading", { name: /Reported content · Current state/ })).toBeDefined();
    const evidence = screen.getByRole("heading", { name: "Evidence at time of report" }).closest("section")!;
    expect(within(evidence).getByText("<img src=x onerror=alert(1)>")).toBeDefined();
    expect(evidence.querySelector("img")).toBeNull();
    expect(screen.getByText("<script>alert('report')</script>")).toBeDefined();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("Reports about this content (3)")).toBeDefined();
    expect(screen.getByText("Reports involving this household (4)")).toBeDefined();
    expect(screen.queryByText(/reporter/i)).toBeNull();
    expect(screen.queryByText(/bucket|storage key|phone|email/i)).toBeNull();
  });

  it("does not show removed Comment evidence as current content", async () => {
    mock.get.mockResolvedValue({ ...detail, currentComment: { ...detail.currentComment!, removed: true, body: "", publiclyVisible: false } });
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByText(/Comment already removed/)).toBeDefined();
    expect(screen.queryByText("Current body")).toBeNull();
  });

  it("uses one unavailable state for a 404", async () => {
    mock.get.mockRejectedValue(new ApiClientError(404, "not_found", "hidden"));
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByText("Report not found or no longer available.")).toBeDefined();
    expect(screen.queryByText("hidden")).toBeNull();
  });

  it("intersects available actions with current capabilities and conflicts", async () => {
    grant(adminCapabilities.communityReportsView, adminCapabilities.communityReportsResolve);
    const view = render(<AdminCommunityReportsManager />);
    expect(await screen.findByRole("button", { name: "Remove Comment" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Restrict Community access" })).toBeNull();
    view.unmount();
    mock.get.mockResolvedValue({ ...detail, involvesYou: true });
    render(<AdminCommunityReportsManager />);
    expect(await screen.findByText(/This report involves your household/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Remove Comment" })).toBeNull();
  });

  it("uses the server action list and capability changes for every action family", () => {
    const all = { ...detail, availableActions: ["Dismiss", "RemoveComment", "HideMoment", "UnhideMoment", "RestrictHousehold", "LiftRestriction"] };
    grant(adminCapabilities.communityReportsView);
    expect(availableModerationActions(all, mock.access)).toEqual([]);
    grant(adminCapabilities.communityReportsView, adminCapabilities.communityReportsResolve);
    expect(availableModerationActions(all, mock.access)).toEqual(["Dismiss", "RemoveComment"]);
    grant(adminCapabilities.communityReportsView, adminCapabilities.communityModerationEnforce);
    expect(availableModerationActions(all, mock.access)).toEqual(["HideMoment", "UnhideMoment", "RestrictHousehold", "LiftRestriction"]);
    expect(availableModerationActions({ ...all, availableActions: ["UnhideMoment"] }, mock.access)).toEqual(["UnhideMoment"]);
    expect(availableModerationActions({ ...all, involvesYou: true }, mock.access)).toEqual([]);
  });

  it("degrades a failed media preview without showing storage paths", async () => {
    mock.get.mockResolvedValue({ ...detail, targetType: "Moment", currentMoment: { ...detail.currentMoment!, media: [{ mediaFileId: "file-one", type: "Image", url: "https://example.test/media/photo.jpg", caption: "At the park", altText: "A pet" }] } });
    render(<AdminCommunityReportsManager />);
    const preview = await screen.findByAltText("A pet");
    fireEvent.error(preview);
    expect(screen.getByText("Media preview unavailable.")).toBeDefined();
    expect(screen.queryByText("file-one")).toBeNull();
  });

  it.each([
    ["Dismiss", "Dismiss report"], ["RemoveComment", "Remove Comment"], ["HideMoment", "Hide Moment"],
    ["UnhideMoment", "Unhide Moment"], ["RestrictHousehold", "Restrict Community access"], ["LiftRestriction", "Lift Community restriction"],
  ] as const)("confirms %s with a note and current row version", async (action, label) => {
    mock.get.mockResolvedValue({ ...detail, availableActions: [action] });
    render(<AdminCommunityReportsManager />);
    fireEvent.click(await screen.findByRole("button", { name: label }));
    expect(screen.getByRole("dialog", { name: label })).toBeDefined();
    fireEvent.change(screen.getByRole("textbox", { name: /Internal moderator note/i }), { target: { value: "Reviewed evidence" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    await waitFor(() => expect(mock.act).toHaveBeenCalledWith(summary.id, action, "Reviewed evidence", "AQID"));
    await waitFor(() => expect(mock.get).toHaveBeenCalledTimes(2));
  });

  it("prevents repeated submission and handles AlreadyInEffect", async () => {
    let finish!: (value: { outcome: string; reportsResolved: number }) => void;
    mock.act.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<AdminCommunityReportsManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Internal moderator note/i }), { target: { value: "Already gone" } });
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Remove Comment" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mock.act).toHaveBeenCalledTimes(1);
    finish({ outcome: "AlreadyInEffect", reportsResolved: 2 });
    expect(await screen.findByText(/The Comment was already removed/)).toBeDefined();
  });

  it.each([
    [409, "community_report_already_resolved", /changed while you were reviewing/],
    [422, "moderation_action_not_applicable", /no longer available/],
    [403, "moderation_conflict_of_interest", /involves your household/],
  ] as const)("refreshes after %s and shows a safe error", async (status, code, message) => {
    mock.act.mockRejectedValue(new ApiClientError(status, code, "sensitive server detail"));
    render(<AdminCommunityReportsManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss report" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Internal moderator note/i }), { target: { value: "Reviewed" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dismiss report" }));
    expect(await screen.findByText(message)).toBeDefined();
    await waitFor(() => expect(mock.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("sensitive server detail")).toBeNull();
  });
});
