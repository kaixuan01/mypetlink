// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      expect(
        screen.getByRole("option", { name: "Adoption Day" })
      ).toBeTruthy();
      const audience = screen.getByRole("group", {
        name: "Who can see this Moment?",
      });
      expect(within(audience).getAllByRole("radio")).toHaveLength(2);
      expect(within(audience).getByLabelText("Only me")).toBeTruthy();
      expect(within(audience).getByLabelText("Anyone with the link")).toBeTruthy();
      expect(screen.getByLabelText("Caption")).toBeTruthy();
      expect(screen.getByTestId("shared-moment-media")).toBeTruthy();
      expect(screen.getByLabelText("Show in Life Timeline")).toBeTruthy();
      expect(
        screen.getByRole("button", {
          name: mode === "edit" ? "Save Changes" : "Add Moment",
        }).closest("footer")?.className
      ).toContain("safe-area-inset-bottom");
      expect(
        screen.getByText(
          "Include this Moment in your pet's Life Timeline. Private Moments stay private."
        )
      ).toBeTruthy();
      expect(screen.queryByText("Family Only")).toBeNull();
      expect(screen.queryByText("Show on Public Profile")).toBeNull();
      expect(screen.queryByText(/Preview: this moment/i)).toBeNull();
      expect(
        screen.queryByText(/Private and family-only memories stay inside/i)
      ).toBeNull();
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
    expect(
      (screen.getByLabelText("Anyone with the link") as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (screen.getByLabelText("Show in Life Timeline") as HTMLInputElement)
        .checked
    ).toBe(false);
    fireEvent.click(screen.getByLabelText("Show in Life Timeline"));
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
      showInLifeTimeline: true,
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("showOnPublicProfile");
  });

  it.each([
    { visibility: "Private" as const, timeline: false },
    { visibility: "Private" as const, timeline: true },
    { visibility: "Public" as const, timeline: false },
    { visibility: "Public" as const, timeline: true },
  ])(
    "creates $visibility with Timeline $timeline",
    async ({ visibility, timeline }) => {
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

      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "First swim" },
      });
      fireEvent.change(screen.getByLabelText("Date"), {
        target: { value: "2026-07-10" },
      });
      fireEvent.change(screen.getByLabelText("Moment category"), {
        target: { value: "Funny Moment" },
      });
      if (visibility === "Public") {
        fireEvent.click(screen.getByLabelText("Anyone with the link"));
      }
      if (timeline) {
        fireEvent.click(screen.getByLabelText("Show in Life Timeline"));
      }
      fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        visibility,
        showInLifeTimeline: timeline,
      });
      expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("showOnPublicProfile");
    }
  );

  it.each([
    { source: "Private" as const, selected: "Only me" },
    { source: "Public" as const, selected: "Anyone with the link" },
    { source: "Family Only" as const, selected: "Only me" },
  ])("hydrates $source as an effective owner audience", ({ source, selected }) => {
    render(
      <MomentEditorDialog
        initialMoment={{ ...existingMoment, visibility: source }}
        mode="edit"
        onRequestClose={vi.fn()}
        onSubmit={vi.fn()}
        petName="Topu"
        submitting={false}
      />
    );

    expect((screen.getByLabelText(selected) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText("Family Only")).toBeNull();
  });

  it.each([
    { from: "Public" as const, toLabel: "Only me", expected: "Private" },
    {
      from: "Private" as const,
      toLabel: "Anyone with the link",
      expected: "Public",
    },
  ])(
    "preserves Timeline ON when changing $from audience",
    async ({ from, toLabel, expected }) => {
      const onSubmit = vi.fn();
      render(
        <MomentEditorDialog
          initialMoment={{
            ...existingMoment,
            visibility: from,
            showInLifeTimeline: true,
          }}
          mode="edit"
          onRequestClose={vi.fn()}
          onSubmit={onSubmit}
          petName="Topu"
          submitting={false}
        />
      );

      fireEvent.click(screen.getByLabelText(toLabel));
      expect(
        (screen.getByLabelText("Show in Life Timeline") as HTMLInputElement)
          .checked
      ).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        visibility: expected,
        showInLifeTimeline: true,
      });
    }
  );

  it("saves legacy Family Only as Private without exposing compatibility state", async () => {
    const onSubmit = vi.fn();
    render(
      <MomentEditorDialog
        initialMoment={{ ...existingMoment, visibility: "Family Only" }}
        mode="edit"
        onRequestClose={vi.fn()}
        onSubmit={onSubmit}
        petName="Topu"
        submitting={false}
      />
    );

    expect(
      (screen.getByLabelText("Only me") as HTMLInputElement).checked
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0].visibility).toBe("Private");
  });

  it("round-trips a September Moment date without clearing or changing it", async () => {
    const onSubmit = vi.fn();
    const septemberMoment = {
      ...existingMoment,
      date: "02 Sept 2020",
    };
    render(
      <MomentEditorDialog
        initialMoment={septemberMoment}
        mode="edit"
        onRequestClose={vi.fn()}
        onSubmit={onSubmit}
        petName="Topu"
        submitting={false}
      />
    );

    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(
      "2020-09-02"
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0].date).toBe("02 Sept 2020");
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
