// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminCapabilities } from "@/lib/adminCapabilities";
import type {
  CommunityCommentContext,
  CommunityCommentSummary,
  CommunityMomentDetail,
  CommunityMomentSummary,
} from "@/services/adminCommunityModerationService";
import { AdminCommunityCommentsManager } from "./AdminCommunityCommentsManager";
import { AdminCommunityMomentsManager } from "./AdminCommunityMomentsManager";

const mock = vi.hoisted(() => ({
  listMoments: vi.fn(),
  getMoment: vi.fn(),
  removeMoment: vi.fn(),
  restoreMoment: vi.fn(),
  listComments: vi.fn(),
  getComment: vi.fn(),
  removeComment: vi.fn(),
  extra: {} as Record<string, string>,
  setExtra: vi.fn(),
  access: { isSuperAdmin: false, roles: [] as string[], granted: new Set<string>() },
}));

vi.mock("@/components/admin/table/useAdminTableQuery", async (original) => ({
  ...await original<typeof import("@/components/admin/table/useAdminTableQuery")>(),
  useAdminTableQuery: () => ({
    query: { page: 1, pageSize: 20, search: "", sortBy: "published", sortDir: "desc", filters: {} },
    hasActiveFilters: false,
    actions: {
      setFilter: vi.fn(), setFilters: vi.fn(), clearAllFilters: vi.fn(), setPage: vi.fn(), setPageSize: vi.fn(), setSearch: vi.fn(),
      setExtraParam: mock.setExtra,
      getExtraParam: (key: string) => mock.extra[key] ?? "",
    },
  }),
}));

vi.mock("@/services/authService", async (original) => ({
  ...await original<typeof import("@/services/authService")>(),
  getAdminCapabilities: () => mock.access,
}));

vi.mock("@/services/adminCommunityModerationService", async (original) => ({
  ...await original<typeof import("@/services/adminCommunityModerationService")>(),
  listCommunityMoments: mock.listMoments,
  getCommunityMoment: mock.getMoment,
  removeCommunityMoment: mock.removeMoment,
  restoreCommunityMoment: mock.restoreMoment,
  listCommunityComments: mock.listComments,
  getCommunityComment: mock.getComment,
  removeCommunityComment: mock.removeComment,
}));

const household = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  handle: "limfamily",
  displayName: "The Lim Family",
  communityEnabled: true,
  communityRestricted: false,
  communityRestrictedAt: null,
  accountActive: true,
};

const momentSummary: CommunityMomentSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Beach day",
  captionPreview: "Sand everywhere",
  author: household,
  petName: "Buddy",
  publishedAt: "2026-10-07T02:00:00Z",
  status: "Visible",
  removedAt: null,
  likeCount: 4,
  commentCount: 2,
};

const currentMoment = {
  id: momentSummary.id,
  title: "Beach day",
  caption: "Sand everywhere",
  visibility: "Public",
  publishedAt: momentSummary.publishedAt,
  archivedAt: null,
  deleted: false,
  hidden: false,
  hiddenAt: null,
  publiclyVisible: true,
  author: household,
  media: [],
};

const momentDetail: CommunityMomentDetail = {
  moment: currentMoment,
  petName: "Buddy",
  likeCount: 4,
  commentCount: 2,
  history: [],
  availableActions: ["RemoveMoment"],
};

const commentSummary: CommunityCommentSummary = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "Reply",
  body: "RUDE WORDS",
  author: household,
  momentId: momentSummary.id,
  momentTitle: "Beach day",
  parentCommentId: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-10-07T03:00:00Z",
  status: "Active",
  removedAt: null,
  publiclyVisible: true,
};

const commentContext: CommunityCommentContext = {
  comment: {
    id: commentSummary.id,
    momentId: momentSummary.id,
    body: "RUDE WORDS",
    createdAt: commentSummary.createdAt,
    removed: false,
    removedAt: null,
    removedBy: null,
    publiclyVisible: true,
    author: household,
    parentCommentId: commentSummary.parentCommentId,
    parentComment: {
      id: "44444444-4444-4444-8444-444444444444",
      body: "Lovely photo",
      createdAt: "2026-10-07T02:30:00Z",
      removed: false,
      publiclyVisible: true,
      author: { ...household, handle: "tanfamily", displayName: "The Tan Family" },
    },
    replyCount: null,
  },
  moment: currentMoment,
  threadReplies: [{ id: commentSummary.id, body: "RUDE WORDS", createdAt: commentSummary.createdAt, removed: false, author: household }],
  threadReplyTotal: 1,
  history: [],
  availableActions: ["RemoveComment"],
};

function grant(...capabilities: string[]) {
  mock.access = { isSuperAdmin: false, roles: [], granted: new Set(capabilities) };
}

beforeEach(() => {
  mock.extra = {};
  grant(adminCapabilities.communityReportsView, adminCapabilities.communityReportsResolve, adminCapabilities.communityModerationEnforce);
  mock.listMoments.mockResolvedValue({ items: [momentSummary], total: 1 });
  mock.getMoment.mockResolvedValue(momentDetail);
  mock.removeMoment.mockResolvedValue({ actionId: "a1", action: "MomentRemoved", restrictedUntil: null });
  mock.listComments.mockResolvedValue({ items: [commentSummary], total: 1 });
  mock.getComment.mockResolvedValue(commentContext);
  mock.removeComment.mockResolvedValue({ actionId: "a2", action: "ReplyRemoved", restrictedUntil: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Community Moments", () => {
  it("lists shared Moments with their author, status and counts", async () => {
    render(<AdminCommunityMomentsManager />);
    expect(await screen.findByText("Beach day")).toBeTruthy();
    expect(screen.getAllByText("The Lim Family").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visible").length).toBeGreaterThan(0);
  });

  it("removes a Moment only after a confirmed reason", async () => {
    mock.extra = { moment: momentSummary.id };
    render(<AdminCommunityMomentsManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Moment" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Moment" });
    const confirm = within(dialog).getByRole("button", { name: "Remove Moment" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Reason" }), { target: { value: "SpamOrAdvertising" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mock.removeMoment).toHaveBeenCalledWith(momentSummary.id, "SpamOrAdvertising", ""));
    expect(await screen.findByText("Moment removed. Its author has been told why.")).toBeTruthy();
  });

  it("does not offer removal without Community enforcement access", async () => {
    grant(adminCapabilities.communityReportsView, adminCapabilities.communityReportsResolve);
    mock.extra = { moment: momentSummary.id };
    render(<AdminCommunityMomentsManager />);
    expect(await screen.findByText("Removing or restoring Moments needs Community enforcement access.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Moment" })).toBeNull();
  });
});

describe("Community Comments", () => {
  it("shows a reply in context: its parent comment, its Moment and its thread", async () => {
    mock.extra = { comment: commentSummary.id };
    render(<AdminCommunityCommentsManager />);
    expect(await screen.findByText("The comment this replies to")).toBeTruthy();
    expect(screen.getByText("Lovely photo")).toBeTruthy();
    expect(screen.getByText("Reviewing")).toBeTruthy();
    expect(screen.getByText("Sand everywhere")).toBeTruthy();
  });

  it("removes a reply with a reason and an internal remark", async () => {
    mock.extra = { comment: commentSummary.id };
    render(<AdminCommunityCommentsManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove reply" }));
    const dialog = screen.getByRole("dialog", { name: "Remove reply" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Reason" }), { target: { value: "Harassment" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Internal remark/ }), { target: { value: "Targets one household" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove reply" }));
    await waitFor(() => expect(mock.removeComment).toHaveBeenCalledWith(commentSummary.id, "Harassment", "Targets one household"));
    expect(await screen.findByText("The reply was removed. Its author has been told why.")).toBeTruthy();
  });

  it("never shows a removed comment's text in the list", async () => {
    mock.listComments.mockResolvedValue({ items: [{ ...commentSummary, body: null, status: "RemovedByMyPetLink" }], total: 1 });
    render(<AdminCommunityCommentsManager />);
    expect(await screen.findByText("Text removed")).toBeTruthy();
    expect(screen.queryByText("RUDE WORDS")).toBeNull();
    expect(screen.getAllByText("Removed by MyPetLink").length).toBeGreaterThan(0);
  });
});
