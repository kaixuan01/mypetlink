// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PetMoment } from "@/types";

vi.mock("@/components/portal/MomentMediaField", () => ({
  MomentMediaField: () => <div data-testid="shared-moment-media">Media field</div>,
}));

const { MomentEditorDialog } = await import("./MomentEditorDialog");

const existingMoment: PetMoment = {
  id: "moment-1",
  petId: "pet-1",
  title: "Beach day",
  date: "12 Jul 2026",
  type: "Outdoor / Trip",
  caption: "A sunny afternoon",
  media: [],
  visibility: "Public",
  showOnPublicProfile: true,
  showInLifeTimeline: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.style.overflow = "";
});

describe("MomentEditorDialog", () => {
  it.each(["create", "edit"] as const)(
    "uses the same complete editor for %s mode",
    (mode) => {
      render(
        <MomentEditorDialog
          initialMoment={mode === "edit" ? existingMoment : undefined}
          mode={mode}
          onRequestClose={vi.fn()}
          onSubmit={vi.fn()}
          petName="Topu"
          submitting={false}
        />
      );

      expect(document.querySelector(`[data-moment-editor-mode="${mode}"]`)).toBeTruthy();
      expect(screen.getByLabelText("Title")).toBeTruthy();
      expect(screen.getByLabelText("Date")).toBeTruthy();
      expect(screen.getByLabelText("Moment category")).toBeTruthy();
      expect(screen.getByLabelText("Visibility")).toBeTruthy();
      expect(screen.getByLabelText("Caption")).toBeTruthy();
      expect(screen.getByTestId("shared-moment-media")).toBeTruthy();
      expect(screen.getByLabelText("Show on Public Profile")).toBeTruthy();
      expect(screen.getByLabelText("Show in Life Timeline")).toBeTruthy();
    }
  );

  it("initializes edit values and submits the shared payload mapping", async () => {
    const onSubmit = vi.fn();
    render(
      <MomentEditorDialog
        initialMoment={existingMoment}
        mode="edit"
        onRequestClose={vi.fn()}
        onSubmit={onSubmit}
        petName="Topu"
        submitting={false}
      />
    );

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Beach day");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-07-12");
    fireEvent.change(screen.getByLabelText("Caption"), {
      target: { value: "Updated caption" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Beach day",
      date: "12 Jul 2026",
      type: "Outdoor / Trip",
      caption: "Updated caption",
      visibility: "Public",
    });
  });

  it("reports dirty state, locks page scrolling, and routes Escape through the close guard", async () => {
    const onDirtyChange = vi.fn();
    const onRequestClose = vi.fn();
    const { unmount } = render(
      <MomentEditorDialog
        mode="create"
        onDirtyChange={onDirtyChange}
        onRequestClose={onRequestClose}
        onSubmit={vi.fn()}
        petName="Topu"
        submitting={false}
      />
    );

    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "First swim" },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledOnce();

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps validation and submission behavior identical in create mode", async () => {
    const onSubmit = vi.fn();
    render(
      <MomentEditorDialog
        mode="create"
        onRequestClose={vi.fn()}
        onSubmit={onSubmit}
        petName="Topu"
        submitting={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));
    expect(await screen.findByText("Add a moment title.")).toBeTruthy();
    expect(screen.getByText("Choose a moment date.")).toBeTruthy();
    expect(screen.getByText("Choose a moment category.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
