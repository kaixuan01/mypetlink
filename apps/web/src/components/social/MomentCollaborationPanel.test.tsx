// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  leave: vi.fn(),
}));

vi.mock("@/services/momentCollaborationService", async () => {
  const actual = await vi.importActual<typeof import("@/services/momentCollaborationService")>(
    "@/services/momentCollaborationService"
  );
  return {
    ...actual,
    getMomentCollaborations: (...args: unknown[]) => mocks.list(...args),
    acceptCollaboration: (...args: unknown[]) => mocks.accept(...args),
    declineCollaboration: (...args: unknown[]) => mocks.decline(...args),
    leaveCollaboration: (...args: unknown[]) => mocks.leave(...args),
  };
});

import { MomentCollaborationPanel } from "@/components/social/MomentCollaborationPanel";
import type { MomentCollaborationList } from "@/services/momentCollaborationService";

const tan = { handle: "tanfamily", displayName: "The Tan Family", avatarUrl: null, avatarThumbnailUrl: null };
const lee = { handle: "leefamily", displayName: "The Lee Family", avatarUrl: null, avatarThumbnailUrl: null };

function invitee(status: "Pending" | "Accepted"): MomentCollaborationList {
  return {
    viewerRole: "invitee",
    author: tan,
    maxHouseholds: 3,
    liveHouseholds: 0,
    canInvite: false,
    inviteUnavailableReason: null,
    items: [
      {
        id: "c1",
        status,
        household: lee,
        pets: [
          { name: "Mochi", publicSlug: "mochi-publee1", photoUrl: null, isAccepted: status === "Accepted" },
          { name: "Milo", publicSlug: "milo-publee2", photoUrl: null, isAccepted: false },
        ],
        createdAt: "2026-09-20T00:00:00Z",
        expiresAt: "2026-10-04T00:00:00Z",
        respondedAt: null,
        endedAt: null,
      },
    ],
  };
}

const none: MomentCollaborationList = { ...invitee("Pending"), viewerRole: "none", items: [] };

beforeEach(() => mocks.list.mockResolvedValue(invitee("Pending")));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a household's collaboration invitation on the Moment", () => {
  it("asks which requested pets join, all ticked to start", async () => {
    const onChanged = vi.fn();
    mocks.accept.mockResolvedValue(invitee("Accepted"));
    render(<MomentCollaborationPanel momentId="m1" onChanged={onChanged} signedIn />);

    const panel = await screen.findByRole("region", { name: "Collaboration invitation" });
    expect(panel.textContent).toContain("The Tan Family invited your household");
    const group = within(panel).getByRole("group", { name: "Requested pets" });
    const boxes = within(group).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, true]);

    fireEvent.click(within(group).getByRole("checkbox", { name: "Milo" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Accept selected" }));

    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("c1", ["mochi-publee1"]));
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByText("You joined this Moment.")).toBeTruthy();
    expect(await screen.findByRole("region", { name: "Your household is in this Moment" })).toBeTruthy();
  });

  it("needs at least one pet to accept", async () => {
    render(<MomentCollaborationPanel momentId="m1" onChanged={vi.fn()} signedIn />);

    const panel = await screen.findByRole("region", { name: "Collaboration invitation" });
    for (const box of within(panel).getAllByRole("checkbox")) fireEvent.click(box);

    expect((within(panel).getByRole("button", { name: "Accept selected" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getByText("Choose at least one pet to join.")).toBeTruthy();
  });

  it("confirms before declining and returns focus when kept", async () => {
    mocks.decline.mockResolvedValue(none);
    render(<MomentCollaborationPanel momentId="m1" onChanged={vi.fn()} signedIn />);

    const decline = await screen.findByRole("button", { name: "Decline" });
    fireEvent.click(decline);
    const dialog = await screen.findByRole("dialog", { name: "Decline this invitation?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep invitation" }));
    await waitFor(() => expect(document.activeElement).toBe(decline));
    expect(mocks.decline).not.toHaveBeenCalled();

    fireEvent.click(decline);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByTestId("collaboration-invitation")).toBeNull());
  });

  it("shows an error from a refused accept without leaving the page", async () => {
    const { MomentCollaborationError } = await import("@/services/momentCollaborationService");
    mocks.accept.mockImplementationOnce(async () => {
      throw new MomentCollaborationError("collaboration_unavailable", "This invitation is no longer available.", 409);
    });
    render(<MomentCollaborationPanel momentId="m1" onChanged={vi.fn()} signedIn />);

    fireEvent.click(await screen.findByRole("button", { name: "Accept selected" }));

    expect((await screen.findByRole("alert")).textContent).toBe("This invitation is no longer available.");
  });

  it("lets a joined household leave after confirming", async () => {
    mocks.list.mockResolvedValue(invitee("Accepted"));
    mocks.leave.mockResolvedValue(none);
    const onChanged = vi.fn();
    render(<MomentCollaborationPanel momentId="m1" onChanged={onChanged} signedIn />);

    const joined = await screen.findByRole("region", { name: "Your household is in this Moment" });
    expect(joined.textContent).toContain("With Mochi.");
    fireEvent.click(within(joined).getByRole("button", { name: "Leave collaboration" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave this Moment?" });
    expect(dialog.textContent).toContain("can't rejoin it later");
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith("c1"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows nothing to anybody else, and asks nothing when signed out", async () => {
    mocks.list.mockResolvedValue({ ...invitee("Pending"), viewerRole: "author" });
    const { container } = render(<MomentCollaborationPanel momentId="m1" onChanged={vi.fn()} signedIn />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();

    cleanup();
    mocks.list.mockClear();
    render(<MomentCollaborationPanel momentId="m1" onChanged={vi.fn()} signedIn={false} />);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
