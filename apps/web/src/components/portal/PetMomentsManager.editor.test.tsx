// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  createPetMoment: vi.fn(),
  getPetMoments: vi.fn(),
  trackEvent: vi.fn(),
  updatePetMoment: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/momentService", () => ({
  createMomentSaveSession: () => ({
    idempotencyKey: `key-${Math.random()}`,
    uploads: new Map(),
    offered: new Set(),
  }),
  releaseMomentSaveSession: vi.fn(async () => undefined),
  MomentSaveCancelledError: class MomentSaveCancelledError extends Error {},
  claimCollaboratorInvites: () => [],
  createPetMoment: (...args: unknown[]) => mocks.createPetMoment(...args),
  deletePetMoment: vi.fn(),
  getFriendlyMomentErrorMessage: () => "Please try again.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  updatePetMoment: (...args: unknown[]) => mocks.updatePetMoment(...args),
}));
vi.mock("@/lib/analytics", () => ({
  AnalyticsEvent: { MomentCreated: "moment_created" },
  trackEvent: (...args: unknown[]) => mocks.trackEvent(...args),
}));
vi.mock("@/components/portal/MomentMediaField", () => ({
  MomentMediaField: () => <div data-testid="moment-media-field" />,
}));
vi.mock("@/components/portal/PetMomentCard", () => ({
  PetMomentCard: ({
    moment,
    onEdit,
  }: {
    moment: { title: string };
    onEdit?: () => void;
  }) => (
    <article>
      <span>{moment.title}</span>
      {onEdit ? <button onClick={onEdit}>Edit</button> : null}
    </article>
  ),
}));

const { PetMomentsManager } = await import("./PetMomentsManager");

function completeCreateForm(title = "First swim") {
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: title },
  });
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2026-07-10" },
  });
  fireEvent.change(screen.getByLabelText("Moment category"), {
    target: { value: "Funny Moment" },
  });
}

describe("PetMomentsManager shared edit flow", () => {
  beforeEach(() => {
    mocks.createPetMoment.mockReset();
    mocks.getPetMoments.mockReset();
    mocks.trackEvent.mockReset();
    mocks.updatePetMoment.mockReset();
    mocks.getPetMoments.mockResolvedValue({ data: [mockMoments[0]] });
    mocks.createPetMoment.mockResolvedValue({
      data: { ...mockMoments[0], id: "moment_created", title: "First swim" },
    });
    window.history.replaceState({}, "", `/pets/${mockPets[0].id}/moments`);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens Create in context without a second load and saves into the current list", async () => {
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);

    const opener = await screen.findByRole("button", { name: "Add Moment" });
    expect(mocks.getPetMoments).toHaveBeenCalledOnce();
    fireEvent.click(opener);

    expect(
      screen.getByRole("dialog", { name: `Add a Moment for ${mockPets[0].name}` })
    ).toBeTruthy();
    expect(new URL(window.location.href).searchParams.get("edit")).toBe("new");
    expect(screen.getByText("No pet moments yet")).toBeTruthy();
    expect(screen.queryByText(/getting this pet.*profile ready/i)).toBeNull();
    expect(mocks.getPetMoments).toHaveBeenCalledOnce();

    completeCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));

    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledOnce());
    expect(mocks.createPetMoment.mock.calls[0][0]).toBe(mockPets[0].id);
    expect(mocks.createPetMoment.mock.calls[0][1]).toMatchObject({
      title: "First swim",
      date: "10 Jul 2026",
      type: "Funny Moment",
      visibility: "Private",
      showInLifeTimeline: false,
    });
    expect(mocks.createPetMoment.mock.calls[0][1]).not.toHaveProperty(
      "showOnPublicProfile"
    );
    expect(mocks.trackEvent).toHaveBeenCalledWith("moment_created", {
      source: "owner_portal",
    });
    expect(await screen.findByText("First swim")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /add a moment/i })).toBeNull()
    );
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
  });

  it("keeps a failed Create open with entered state and editor URL intact", async () => {
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.createPetMoment.mockRejectedValueOnce(new Error("failed"));
    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
    completeCreateForm("Keep this title");
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Keep this caption" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));

    expect(await screen.findByText("Please try again.")).toBeTruthy();
    expect(screen.getByDisplayValue("Keep this title")).toBeTruthy();
    expect(screen.getByDisplayValue("Keep this caption")).toBeTruthy();
    expect(new URL(window.location.href).searchParams.get("edit")).toBe("new");
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("retries a failed Create as the same attempt", async () => {
    const created = { ...mockMoments[0], id: "moment-new", title: "Retry me" };
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.createPetMoment
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce({ data: created });
    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
    completeCreateForm("Retry me");
    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));
    expect(await screen.findByText("Please try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));
    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Moment added.")).toBeTruthy();

    // The retry carried the first press's save session: one idempotency key.
    const [firstSession, retrySession] = mocks.createPetMoment.mock.calls.map((call) => call[2]);
    expect(firstSession).toBeDefined();
    expect(retrySession).toBe(firstSession);
  });

  describe("a save from an editor closed and replaced while it ran", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    /** Opens editor A, saves it (held), closes A, opens editor B with a draft. */
    async function closeAWhileSavingThenOpenB() {
      const saveA = deferred<{ data: typeof mockMoments[0] }>();
      mocks.getPetMoments.mockResolvedValue({ data: [] });
      mocks.createPetMoment.mockReturnValueOnce(saveA.promise);
      render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);

      fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
      completeCreateForm("From A");
      fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));
      await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: "Saving..." })).toBeTruthy();

      // Close A while its request is still out.
      fireEvent.click(screen.getByLabelText("Close moment editor"));
      fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: /add a moment/i })).toBeNull()
      );

      // Open B and start a different draft.
      fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
      await screen.findByRole("dialog", { name: /add a moment/i });
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "B's draft" } });
      return saveA;
    }

    it("B does not inherit A's saving state", async () => {
      await closeAWhileSavingThenOpenB();

      expect(screen.queryByRole("button", { name: "Saving..." })).toBeNull();
      const submit = screen.getByRole("button", { name: "Add Moment" }) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });

    it("A succeeding leaves B open and untouched; the list still gains A's Moment", async () => {
      const saveA = await closeAWhileSavingThenOpenB();
      const pushes = vi.spyOn(window.history, "back");

      saveA.resolve({ data: { ...mockMoments[0], id: "moment-a", title: "From A" } });

      // Global: A's Moment exists, so the list shows it.
      expect(await screen.findByText("From A")).toBeTruthy();
      // Editor-owned: B stays open with its own draft, no success in B, no
      // close, no second step back in history.
      expect(screen.getByRole("dialog", { name: /add a moment/i })).toBeTruthy();
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("B's draft");
      expect(screen.queryByText("Moment added.")).toBeNull();
      expect(pushes).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Saving..." })).toBeNull();
      pushes.mockRestore();
    });

    it("A failing puts no error into B", async () => {
      const saveA = await closeAWhileSavingThenOpenB();

      saveA.reject(new Error("failed"));
      await act(async () => {});

      expect(screen.queryByText("Please try again.")).toBeNull();
      expect(screen.getByRole("dialog", { name: /add a moment/i })).toBeTruthy();
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("B's draft");
    });

    it("A settling does not clear B's own saving state", async () => {
      const saveA = await closeAWhileSavingThenOpenB();
      const saveB = deferred<{ data: typeof mockMoments[0] }>();
      mocks.createPetMoment.mockReturnValueOnce(saveB.promise);
      completeCreateForm("B's draft");
      fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));
      await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("button", { name: "Saving..." })).toBeTruthy();

      saveA.reject(new Error("failed"));
      await act(async () => {});

      // A's `finally` must not stop B's spinner or re-enable B's button.
      expect(screen.getByRole("button", { name: "Saving..." })).toBeTruthy();

      saveB.resolve({ data: { ...mockMoments[0], id: "moment-b", title: "B's draft" } });
      expect(await screen.findByText("Moment added.")).toBeTruthy();
    });
  });

  it("deep-links the shared editor, saves, closes, and refreshes the rendered card", async () => {
    const updated = { ...mockMoments[0], title: "Updated memory" };
    mocks.updatePetMoment.mockResolvedValue({ data: updated });
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );

    await screen.findByText(mockMoments[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(new URL(window.location.href).searchParams.get("edit")).toBe(mockMoments[0].id);
    expect(screen.getByRole("dialog", { name: "Update this Moment" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Updated memory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updatePetMoment).toHaveBeenCalledOnce());
    expect(mocks.updatePetMoment.mock.calls[0][0]).toBe(mockMoments[0].id);
    expect(await screen.findByText("Updated memory")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Update this Moment" })).toBeNull();
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
  });

  it("restores the shared editor from a direct edit URL after moments load", async () => {
    window.history.replaceState(
      {},
      "",
      `/pets/${mockPets[0].id}/moments?edit=${mockMoments[0].id}`
    );

    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );

    const editor = await screen.findByRole("dialog", {
      name: "Update this Moment",
    });
    expect(within(editor).getByDisplayValue(mockMoments[0].title)).toBeTruthy();
    expect(mocks.getPetMoments).toHaveBeenCalledOnce();
  });

  it("normalizes the legacy Create route into the Moments editor history state", async () => {
    window.history.replaceState(
      {},
      "",
      `/pets/${mockPets[0].id}/moments/new`
    );
    mocks.getPetMoments.mockResolvedValue({ data: [] });

    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);

    expect(
      await screen.findByRole("dialog", {
        name: `Add a Moment for ${mockPets[0].name}`,
      })
    ).toBeTruthy();
    expect(window.location.pathname).toBe(
      `/pets/${mockPets[0].id}/moments`
    );
    expect(new URL(window.location.href).searchParams.get("edit")).toBe("new");
    expect(window.history.state.myPetLinkMomentEditor).toBe("new");
    expect(screen.getByText("No pet moments yet")).toBeTruthy();
  });

  it("uses browser Back to close a clean editor before leaving Moments", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    window.history.back();

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Update this Moment" })
      ).toBeNull()
    );
    expect(window.location.pathname).toBe(
      `/pets/${mockPets[0].id}/moments`
    );
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
  });

  it("protects dirty browser Back, supports Keep editing, then discards to Moments", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Unsaved browser Back caption" },
    });

    window.history.back();

    const firstConfirmation = await screen.findByRole("dialog", {
      name: "Discard your changes?",
    });
    expect(new URL(window.location.href).searchParams.get("edit")).toBe(
      mockMoments[0].id
    );
    fireEvent.click(
      within(firstConfirmation).getByRole("button", { name: "Keep editing" })
    );
    expect(screen.getByDisplayValue("Unsaved browser Back caption")).toBeTruthy();

    window.history.back();
    const secondConfirmation = await screen.findByRole("dialog", {
      name: "Discard your changes?",
    });
    fireEvent.click(
      within(secondConfirmation).getByRole("button", {
        name: "Discard changes",
      })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Update this Moment" })
      ).toBeNull()
    );
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
  });

  it("isolates Edit state from a later Create session", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByDisplayValue(mockMoments[0].title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Update this Moment" })
      ).toBeNull()
    );

    window.history.pushState(
      { myPetLinkMomentEditor: "new" },
      "",
      `/pets/${mockPets[0].id}/moments?edit=new`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));

    await screen.findByRole("dialog", {
      name: `Add a Moment for ${mockPets[0].name}`,
    });
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Caption") as HTMLTextAreaElement).value).toBe("");
  });

  it("does not leak discarded Create state into a later Edit session", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);

    window.history.pushState(
      { myPetLinkMomentEditor: "new" },
      "",
      `/pets/${mockPets[0].id}/moments?edit=new`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await screen.findByRole("dialog", { name: /add a moment/i });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Discarded create title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Discard your changes?" })
      ).getByRole("button", { name: "Discard changes" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /add a moment/i })).toBeNull()
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByDisplayValue(mockMoments[0].title)).toBeTruthy();
    expect(screen.queryByDisplayValue("Discarded create title")).toBeNull();
  });

  it("reuses one history entry across repeated open and close cycles", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back");
    const updated = { ...mockMoments[0], title: "Saved after cycles" };
    mocks.updatePetMoment.mockResolvedValue({ data: updated });
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);

    for (let cycle = 0; cycle < 2; cycle += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Update this Moment" })
        ).toBeNull()
      );
    }

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Saved after cycles" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText("Saved after cycles")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Update this Moment" })
      ).toBeNull()
    );
    expect(pushState).toHaveBeenCalledTimes(3);
    expect(back).toHaveBeenCalledTimes(3);
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
  });

  it("composes dirty discard confirmation with focus and scroll locking intact", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);
    const opener = screen.getByRole("button", { name: "Edit" });
    opener.focus();
    fireEvent.click(opener);
    const editor = screen.getByRole("dialog", { name: "Update this Moment" });
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Unsaved caption" },
    });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.click(cancel);

    await screen.findByRole("dialog", {
      name: "Discard your changes?",
    });
    expect(editor.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Discard your changes?" })
      ).toBeNull()
    );
    expect(screen.getByRole("dialog", { name: "Update this Moment" })).toBeTruthy();
    expect(document.activeElement).toBe(cancel);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes the dirty editor only after discard confirmation", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);
    const opener = screen.getByRole("button", { name: "Edit" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Discard this unsaved caption" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const confirmation = await screen.findByRole("dialog", {
      name: "Discard your changes?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Discard changes" })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Update this Moment" })
      ).toBeNull()
    );
    expect(new URL(window.location.href).searchParams.has("edit")).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });
});
