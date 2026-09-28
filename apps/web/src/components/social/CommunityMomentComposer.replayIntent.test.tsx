// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollaborationInvite } from "@/services/momentCollaborationService";

/**
 * Community Share, retried after a lost answer, with collaborators.
 *
 * Only the edges are replaced: the editor dialog (so a test can submit a draft
 * with a chosen set of collaborators in one press), the API (a server that
 * commits a create, can lose its answer, and replays the ORIGINAL Moment for a
 * key it has seen), and the invitation sender (to record who was invited).
 * The composer, its save session and `createPetMoment` are the real ones.
 */

const server = vi.hoisted(() => ({
  byKey: new Map<string, Record<string, unknown>>(),
  loseNextAnswer: false,
  invited: [] as string[][],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/feed",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/services/apiConfig", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiConfig")>("@/services/apiConfig");
  return { ...actual, canUseApi: () => true };
});

vi.mock("@/services/petService", async () => {
  const actual = await vi.importActual<typeof import("@/services/petService")>("@/services/petService");
  return {
    ...actual,
    getPets: async () => ({ data: [{ id: "pet-1", name: "Mochi", species: "Cat", breed: "" }] }),
  };
});

vi.mock("@/services/ownerSocialService", async () => {
  const actual = await vi.importActual<typeof import("@/services/ownerSocialService")>("@/services/ownerSocialService");
  return {
    ...actual,
    getOwnerSocialProfile: async () => ({
      data: { handle: "tanfamily", displayName: "The Tan Family", isSocialEnabled: true },
    }),
  };
});

vi.mock("@/services/momentCollaborationService", async () => {
  const actual = await vi.importActual<typeof import("@/services/momentCollaborationService")>(
    "@/services/momentCollaborationService"
  );
  return {
    ...actual,
    sendCollaborationInvites: async (_momentId: string, invites: CollaborationInvite[]) => {
      server.invited.push(invites.map((invite) => invite.household.handle));
      return { failed: [] };
    },
  };
});

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return {
    ...actual,
    apiRequest: async (path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
      const body = options.body ?? {};
      const key = body.idempotencyKey as string;
      let saved = server.byKey.get(key);
      if (!saved) {
        saved = {
          id: `moment-${server.byKey.size + 1}`,
          petId: path.split("/")[4],
          title: body.title,
          date: "2026-09-28",
          type: body.type,
          visibility: body.visibility,
          showOnPublicProfile: body.visibility === "Public",
          showInLifeTimeline: false,
          media: [],
          createdAt: "2026-09-28T00:00:00Z",
          updatedAt: "2026-09-28T00:00:00Z",
          additionalPetIds: [],
        };
        server.byKey.set(key, saved);
      }
      if (server.loseNextAnswer) {
        server.loseNextAnswer = false;
        throw new actual.ApiClientError(0, "network_error", "We could not reach MyPetLink right now.");
      }
      return { data: saved, meta: { requestId: "r" } };
    },
  };
});

// The editor, reduced to "submit this draft with these collaborators".
vi.mock("@/components/portal/MomentEditorDialog", () => ({
  MomentEditorDialog: ({
    onSubmit,
    error,
  }: {
    onSubmit: (payload: unknown, extras: { collaboratorInvites: CollaborationInvite[] }) => void;
    error?: string;
  }) => {
    const submit = (visibility: "Public" | "Private", handles: string[]) =>
      onSubmit(
        { title: "Beach day", date: "28 Sep 2026", type: "Other", caption: "", media: [], visibility, showInLifeTimeline: false },
        {
          collaboratorInvites: handles.map((handle) => ({
            household: { handle, displayName: handle, avatarUrl: null, avatarThumbnailUrl: null },
            pets: [],
          })),
        }
      );
    return (
      <div role="dialog">
        {error ? <p role="alert">{error}</p> : null}
        <button onClick={() => submit("Public", [])} type="button">public, nobody</button>
        <button onClick={() => submit("Public", ["bravo"])} type="button">public, bravo</button>
        <button onClick={() => submit("Public", ["charlie"])} type="button">public, charlie</button>
        <button onClick={() => submit("Private", [])} type="button">private, nobody</button>
      </div>
    );
  },
}));

import { CommunityMomentComposer } from "@/components/social/CommunityMomentComposer";

/** First press: the server commits, the answer is lost. Second press: replay. */
async function firstLostThenRetry(first: string, retry: string) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<CommunityMomentComposer onClose={onClose} onCreated={onCreated} />);

  server.loseNextAnswer = true;
  fireEvent.click(await screen.findByRole("button", { name: first }));
  await screen.findByRole("alert");

  fireEvent.click(screen.getByRole("button", { name: retry }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  return { onCreated };
}

beforeEach(() => {
  server.byKey = new Map();
  server.loseNextAnswer = false;
  server.invited = [];
});

afterEach(cleanup);

describe("collaborator intent survives a replay unchanged", () => {
  it("A: nobody, then bravo added on retry — bravo is not invited", async () => {
    await firstLostThenRetry("public, nobody", "public, bravo");

    expect(server.byKey.size).toBe(1);
    expect(server.invited).toEqual([]);
  });

  it("B: bravo, then removed on retry — bravo is still invited, once", async () => {
    await firstLostThenRetry("public, bravo", "public, nobody");

    expect(server.invited).toEqual([["bravo"]]);
  });

  it("C: bravo, then charlie on retry — bravo, never charlie", async () => {
    await firstLostThenRetry("public, bravo", "public, charlie");

    expect(server.invited).toEqual([["bravo"]]);
  });

  it("D: bravo, retried unchanged — bravo invited exactly once", async () => {
    await firstLostThenRetry("public, bravo", "public, bravo");

    expect(server.invited).toEqual([["bravo"]]);
  });

  it("E: saved private, retried as public with bravo — nobody is invited, and it is confirmed private", async () => {
    const { onCreated } = await firstLostThenRetry("private, nobody", "public, bravo");

    expect(server.invited).toEqual([]);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ audience: "Private" }));
  });

  it("F: saved public with bravo, retried as private — bravo invited, confirmed public", async () => {
    const { onCreated } = await firstLostThenRetry("public, bravo", "private, nobody");

    expect(server.invited).toEqual([["bravo"]]);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ audience: "Public" }));
  });

  it("normal path: one press, the draft's collaborators are invited", async () => {
    const onClose = vi.fn();
    render(<CommunityMomentComposer onClose={onClose} />);

    fireEvent.click(await screen.findByRole("button", { name: "public, bravo" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(server.invited).toEqual([["bravo"]]);
  });
});
