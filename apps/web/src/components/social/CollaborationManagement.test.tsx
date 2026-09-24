// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  list: vi.fn(),
  invite: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/services/momentCollaborationService", async () => {
  const actual = await vi.importActual<typeof import("@/services/momentCollaborationService")>(
    "@/services/momentCollaborationService"
  );
  return {
    ...actual,
    getCollaborationCandidates: (...args: unknown[]) => mocks.candidates(...args),
    getMomentCollaborations: (...args: unknown[]) => mocks.list(...args),
    inviteCollaborator: (...args: unknown[]) => mocks.invite(...args),
    revokeCollaboration: (...args: unknown[]) => mocks.revoke(...args),
  };
});

import { CollaboratorPicker } from "@/components/social/CollaboratorPicker";
import { MomentCollaboratorsField } from "@/components/social/MomentCollaboratorsField";
import {
  type CollaborationCandidate,
  type CollaborationInvite,
  type MomentCollaborationList,
} from "@/services/momentCollaborationService";

const household = (handle: string, displayName: string) => ({
  handle,
  displayName,
  avatarUrl: null,
  avatarThumbnailUrl: null,
});

const lee: CollaborationCandidate = {
  household: household("leefamily", "The Lee Family"),
  isFollowed: true,
  invitationState: null,
  pets: [
    { name: "Mochi", publicSlug: "mochi-publee1", photoUrl: null },
    { name: "Milo", publicSlug: "milo-publee2", photoUrl: null },
  ],
};
const declined: CollaborationCandidate = {
  household: household("ngfamily", "The Ng Family"),
  isFollowed: false,
  invitationState: "Unavailable",
  pets: [{ name: "Pip", publicSlug: "pip-pubng1", photoUrl: null }],
};

function list(overrides: Partial<MomentCollaborationList> = {}): MomentCollaborationList {
  return {
    viewerRole: "author",
    author: household("tanfamily", "The Tan Family"),
    maxHouseholds: 3,
    liveHouseholds: 0,
    canInvite: true,
    inviteUnavailableReason: null,
    items: [],
    ...overrides,
  };
}

const collaboration = (id: string, status: "Pending" | "Accepted" | "Declined", name: string) => ({
  id,
  status,
  household: household(name.toLowerCase().replace(/\s/g, ""), name),
  pets: [{ name: "Mochi", publicSlug: "mochi-publee1", photoUrl: null, isAccepted: status === "Accepted" }],
  createdAt: "2026-09-20T00:00:00Z",
  expiresAt: "2026-10-04T00:00:00Z",
  respondedAt: null,
  endedAt: null,
});

beforeEach(() => {
  mocks.candidates.mockResolvedValue([lee, declined]);
  mocks.list.mockResolvedValue(list());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("choosing a household", () => {
  it("is a labelled combobox whose households are options and whose pets are chosen after", async () => {
    const onConfirm = vi.fn();
    render(<CollaboratorPicker confirmLabel="Add invitation" onCancel={vi.fn()} onConfirm={onConfirm} />);

    const box = screen.getByRole("combobox", { name: "Find a household" });
    expect(box.getAttribute("aria-controls")).toBeTruthy();
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain("The Lee Family");
    expect(options[0].textContent).toContain("Following");
    // Pets are listed under their household, never as results of their own.
    expect(options[0].textContent).toContain("Mochi, Milo");
    expect(options[1].getAttribute("aria-disabled")).toBe("true");
    expect(options[1].textContent).toContain("Can't be invited to this Moment again");

    // Keyboard: the first option is active; Enter chooses it.
    expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(box, { key: "Enter" });

    const group = await screen.findByRole("group", { name: /Which of The Lee Family.s pets/ });
    const add = screen.getByRole("button", { name: "Add invitation" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(group).getByRole("checkbox", { name: "Milo" }));
    fireEvent.click(add);

    expect(onConfirm).toHaveBeenCalledWith({
      household: lee.household,
      pets: [lee.pets[1]],
    });
  });

  it("searches only once two characters are typed", async () => {
    vi.useFakeTimers();
    try {
      render(<CollaboratorPicker confirmLabel="Add" onCancel={vi.fn()} onConfirm={vi.fn()} />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mocks.candidates).toHaveBeenLastCalledWith("", undefined);

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "l" } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mocks.candidates).toHaveBeenLastCalledWith("", undefined);

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "lee" } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mocks.candidates).toHaveBeenLastCalledWith("lee", undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it("points to Follow, not to a handle search that cannot find hidden households", async () => {
    mocks.candidates.mockResolvedValue([]);
    vi.useFakeTimers();
    try {
      render(<CollaboratorPicker confirmLabel="Add" onCancel={vi.fn()} onConfirm={vi.fn()} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "quietpaws" } });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const hint = screen.getByText(/No households found\./);
      expect(hint.textContent).toContain("follow them from their Community profile first");
      expect(hint.textContent).not.toMatch(/exact @handle/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the Collaborators section while creating", () => {
  it("is only offered for a public Moment", () => {
    render(
      <MomentCollaboratorsField invites={[]} isPublic={false} mode="create" onInvitesChange={vi.fn()} />
    );

    expect(screen.getByRole("region", { name: "Collaborators" })).toBeTruthy();
    expect(screen.getByText(/Collaborators can join public Moments/)).toBeTruthy();
    expect(screen.queryByTestId("invite-household")).toBeNull();
  });

  it("queues invitations and stops at three households", () => {
    const invites: CollaborationInvite[] = ["One", "Two", "Three"].map((name) => ({
      household: household(name.toLowerCase(), `House ${name}`),
      pets: [{ name: "Pet", publicSlug: `pet-${name}`, photoUrl: null }],
    }));
    const onInvitesChange = vi.fn();
    render(
      <MomentCollaboratorsField invites={invites} isPublic mode="create" onInvitesChange={onInvitesChange} />
    );

    const add = screen.getByTestId("invite-household") as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText("Maximum 3 collaborator households for this Moment.")).toBeTruthy();
    expect(add.getAttribute("aria-describedby")).toBe("moment-collaborators-note");

    fireEvent.click(screen.getByRole("button", { name: "Don't invite House Two" }));
    expect(onInvitesChange).toHaveBeenCalledWith([invites[0], invites[2]]);
  });
});

describe("the Collaborators section while editing", () => {
  it("groups joined, invited and earlier households with text statuses", async () => {
    mocks.list.mockResolvedValue(
      list({
        liveHouseholds: 2,
        items: [
          collaboration("a", "Accepted", "The Lee Family"),
          collaboration("b", "Pending", "The Ng Family"),
          collaboration("c", "Declined", "The Ong Family"),
        ],
      })
    );
    render(<MomentCollaboratorsField isPublic mode="edit" momentId="m1" />);

    expect(await screen.findByRole("heading", { name: "Joined" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Invited" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel invite" })).toBeTruthy();
    expect(screen.getByText(/^Invitation sent · expires/)).toBeTruthy();
    // An ended collaboration offers no action.
    expect(screen.getAllByRole("button", { name: /Remove|Cancel invite/ })).toHaveLength(2);
  });

  it("confirms before removing and restores focus if cancelled", async () => {
    mocks.list.mockResolvedValue(list({ items: [collaboration("a", "Accepted", "The Lee Family")] }));
    mocks.revoke.mockResolvedValue(list({ items: [{ ...collaboration("a", "Accepted", "The Lee Family"), status: "Revoked" as const }] }));
    render(<MomentCollaboratorsField isPublic mode="edit" momentId="m1" />);

    const remove = await screen.findByRole("button", { name: "Remove" });
    fireEvent.click(remove);
    const dialog = await screen.findByRole("dialog", { name: "Remove The Lee Family from this Moment?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(remove));
    expect(mocks.revoke).not.toHaveBeenCalled();

    fireEvent.click(remove);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("m1", "a"));
    expect(await screen.findByText("The Lee Family removed from this Moment.")).toBeTruthy();
  });

  it("explains why inviting is unavailable", async () => {
    mocks.list.mockResolvedValue(list({ canInvite: false, inviteUnavailableReason: "limit-reached", liveHouseholds: 3 }));
    render(<MomentCollaboratorsField isPublic mode="edit" momentId="m1" />);

    const add = (await screen.findByTestId("invite-household")) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText("Maximum 3 collaborator households for this Moment.")).toBeTruthy();
  });

  it("offers Try again when the list cannot load", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    render(<MomentCollaboratorsField isPublic mode="edit" momentId="m1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No collaborators yet.")).toBeTruthy();
  });
});
