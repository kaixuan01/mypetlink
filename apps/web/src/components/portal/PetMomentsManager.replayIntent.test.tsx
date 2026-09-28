// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { CollaborationInvite } from "@/services/momentCollaborationService";

/**
 * Owner Portal Add Moment, retried after a lost answer, with collaborators.
 *
 * The manager, its save session and `createPetMoment` are the real ones. The
 * editor dialog is reduced to "submit this draft", the API is a server that
 * commits a create, can lose its answer, validates a request before looking
 * its key up, and replays the ORIGINAL Moment; the invitation sender records
 * who was invited.
 */

const server = vi.hoisted(() => ({
  byKey: new Map<string, Record<string, unknown>>(),
  loseNextAnswer: false,
  invited: [] as string[][],
}));

vi.mock("@/services/apiConfig", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiConfig")>("@/services/apiConfig");
  return { ...actual, canUseApi: () => true, isApiConfigured: () => true };
});

vi.mock("@/services/petService", async () => {
  const actual = await vi.importActual<typeof import("@/services/petService")>("@/services/petService");
  return { ...actual, getPets: async () => ({ data: [mockPets[0]] }) };
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

vi.mock("@/lib/analytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics")>("@/lib/analytics");
  return { ...actual, trackEvent: vi.fn() };
});

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return {
    ...actual,
    apiRequest: async (path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
      if ((options.method ?? "GET") === "GET") {
        return { data: [], meta: { requestId: "r" } };
      }
      const body = options.body ?? {};
      if (String(body.title ?? "").length > 160) {
        throw new actual.ApiClientError(400, "validation_failed", "Title is too long.");
      }
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
        throw new actual.ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now.");
      }
      return { data: saved, meta: { requestId: "r" } };
    },
  };
});

vi.mock("@/components/portal/MomentEditorDialog", () => ({
  MomentEditorDialog: ({
    onSubmit,
    error,
  }: {
    onSubmit: (payload: unknown, extras: { collaboratorInvites: CollaborationInvite[] }) => void;
    error?: string;
  }) => {
    const submit = (handle: string, title = "Beach day") =>
      onSubmit(
        { title, date: "28 Sep 2026", type: "Other", caption: "", media: [], visibility: "Public", showInLifeTimeline: false },
        {
          collaboratorInvites: [
            {
              household: { handle, displayName: handle, avatarUrl: null, avatarThumbnailUrl: null },
              pets: [],
            },
          ],
        }
      );
    return (
      <div aria-label="Moment editor" role="dialog">
        {error ? <p role="alert">{error}</p> : null}
        <button onClick={() => submit("bravo")} type="button">save with bravo</button>
        <button onClick={() => submit("charlie")} type="button">save with charlie</button>
        <button onClick={() => submit("charlie", "x".repeat(161))} type="button">
          save with charlie, title too long
        </button>
      </div>
    );
  },
}));

import { PetMomentsManager } from "@/components/portal/PetMomentsManager";

beforeEach(() => {
  server.byKey = new Map();
  server.loseNextAnswer = false;
  server.invited = [];
  window.history.replaceState({}, "", `/pets/${mockPets[0].id}/moments`);
});

afterEach(cleanup);

describe("Owner Portal Add Moment: collaborator intent belongs to the key", () => {
  it("lost answer, then a refused retry, then a replay — bravo, never charlie", async () => {
    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));

    server.loseNextAnswer = true;
    fireEvent.click(await screen.findByRole("button", { name: "save with bravo" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "save with charlie, title too long" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Title is too long."));

    fireEvent.click(screen.getByRole("button", { name: "save with charlie" }));
    expect(await screen.findByText("Moment added.")).toBeTruthy();

    expect(server.byKey.size).toBe(1);
    await waitFor(() => expect(server.invited).toEqual([["bravo"]]));
  });

  it("a first request refused outright lets the corrected draft choose again", async () => {
    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));

    fireEvent.click(await screen.findByRole("button", { name: "save with charlie, title too long" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "save with bravo" }));
    expect(await screen.findByText("Moment added.")).toBeTruthy();

    await waitFor(() => expect(server.invited).toEqual([["bravo"]]));
  });
});
