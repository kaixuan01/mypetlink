// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  getPetMoments: vi.fn(),
  updatePetMoment: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/momentService", () => ({
  deletePetMoment: vi.fn(),
  getFriendlyMomentErrorMessage: () => "Please try again.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  updatePetMoment: (...args: unknown[]) => mocks.updatePetMoment(...args),
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

describe("PetMomentsManager shared edit flow", () => {
  beforeEach(() => {
    mocks.getPetMoments.mockReset();
    mocks.updatePetMoment.mockReset();
    mocks.getPetMoments.mockResolvedValue({ data: [mockMoments[0]] });
    window.history.replaceState({}, "", `/pets/${mockPets[0].id}/moments`);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
    expect(screen.getByRole("dialog", { name: "Update this memory" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Updated memory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updatePetMoment).toHaveBeenCalledOnce());
    expect(mocks.updatePetMoment.mock.calls[0][0]).toBe(mockMoments[0].id);
    expect(await screen.findByText("Updated memory")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Update this memory" })).toBeNull();
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
      name: "Update this memory",
    });
    expect(within(editor).getByDisplayValue(mockMoments[0].title)).toBeTruthy();
    expect(mocks.getPetMoments).toHaveBeenCalledOnce();
  });

  it("keeps the editor open until dirty changes are explicitly discarded", async () => {
    render(
      <PetMomentsManager pet={mockPets[0]} initialMoments={[mockMoments[0]]} />
    );
    await screen.findByText(mockMoments[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Unsaved caption" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Close moment editor" })[1]);

    const confirmation = await screen.findByRole("dialog", {
      name: "Discard your changes?",
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Update this memory" })).toBeTruthy();
  });
});
