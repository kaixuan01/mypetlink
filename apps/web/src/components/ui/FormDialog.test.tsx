// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { FormDialog } from "./FormDialog";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function DialogHarness({
  dismissible = true,
  long = false,
}: {
  dismissible?: boolean;
  long?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Open editor
      </button>
      <FormDialog
        description="Update the details."
        dismissible={dismissible}
        eyebrow="Pet details"
        onRequestClose={() => setOpen(false)}
        open={open}
        primaryAction={{ label: "Save changes", type: "submit" }}
        title="Edit pet"
      >
        <input aria-label="Pet name" />
        {long
          ? Array.from({ length: 30 }, (_, index) => (
              <p key={index}>Long scrolling content {index + 1}</p>
            ))
          : null}
      </FormDialog>
    </div>
  );
}

function DirtyDialogHarness() {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Open dirty editor
      </button>
      <FormDialog
        onRequestClose={() => setConfirmOpen(true)}
        open={open}
        primaryAction={{ label: "Save changes" }}
        title="Edit pet"
      >
        <input aria-label="Pet name" />
      </FormDialog>
      <ConfirmDialog
        confirmLabel="Discard changes"
        destructive
        message="Your unsaved changes will be lost."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          setOpen(false);
        }}
        open={confirmOpen}
        title="Discard changes?"
      />
    </div>
  );
}

describe("FormDialog", () => {
  it("focuses the close button, locks and inerts the background, and never defaults to an input", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open editor" });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "Close dialog" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(document.activeElement?.tagName).toBe("BUTTON");
    expect(document.body.style.overflow).toBe("hidden");
    expect(trigger.hasAttribute("inert") || trigger.parentElement?.hasAttribute("inert")).toBe(
      true
    );
  });

  it("traps focus, dismisses with Escape, and restores focus to the trigger", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open editor" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Close dialog" });
    const primary = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    primary.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(primary);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps a non-dismissible dialog open without focusing its text field", async () => {
    render(<DialogHarness dismissible={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
    const title = screen.getByRole("heading", { name: "Edit pet" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(screen.queryByRole("button", { name: "Close dialog" })).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(title);
  });

  it("can preserve a product flow that does not close from the backdrop", () => {
    const onClose = vi.fn();
    render(
      <FormDialog
        closeOnBackdrop={false}
        onRequestClose={onClose}
        open
        primaryAction={{ label: "Save" }}
        title="Edit"
      >
        Short content
      </FormDialog>
    );

    const dialog = screen.getByRole("dialog", { name: "Edit" });
    expect(dialog.querySelector('button[aria-hidden="true"]')).toBeNull();
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit" })).toBeTruthy();
  });

  it("keeps a dirty editor stacked correctly through discard confirmation", async () => {
    render(<DirtyDialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dirty editor" });
    trigger.focus();
    fireEvent.click(trigger);

    const editor = screen.getByRole("dialog", { name: "Edit pet" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.click(cancel);
    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(editor.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Discard changes?" })
      ).toBeNull()
    );
    expect(screen.getByRole("dialog", { name: "Edit pet" })).toBeTruthy();
    expect(document.activeElement).toBe(cancel);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(cancel);
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps header and footer pinned around a separately scrollable long body", () => {
    render(<DialogHarness long />);
    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));

    const body = screen.getByTestId("form-dialog-body");
    const footer = screen.getByRole("button", { name: "Save changes" }).closest("footer");
    const shell = body.parentElement;

    expect(body.className).toContain("overflow-y-auto");
    expect(shell?.className).toContain("h-[100dvh]");
    expect(shell?.className).toContain("sm:max-h-[92dvh]");
    expect(footer?.className).toContain("safe-area-inset-bottom");
    expect(screen.getByText("Long scrolling content 30")).toBeTruthy();
  });

  it("uses side-by-side Cancel and Primary actions by default and supports explicit stacking", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FormDialog
        onRequestClose={onClose}
        open
        primaryAction={{ label: "Save" }}
        title="Edit"
      >
        Short content
      </FormDialog>
    );

    const inline = screen.getByRole("button", { name: "Save" }).parentElement;
    expect(inline?.dataset.formDialogFooterLayout).toBe("inline");
    expect(inline?.className).toContain("grid-cols-2");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).className).toContain(
      "break-words"
    );

    rerender(
      <FormDialog
        footerLayout="stacked"
        onRequestClose={onClose}
        open
        primaryAction={{ label: "Save" }}
        title="Edit"
      >
        <div role="alert">Resolve the validation error.</div>
      </FormDialog>
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save" }).parentElement?.dataset
        .formDialogFooterLayout
    ).toBe("stacked");
  });

  it("uses a custom footer instead of rendering default actions", () => {
    render(
      <FormDialog
        footer={<button type="button">Custom action</button>}
        onRequestClose={vi.fn()}
        open
        primaryAction={{ label: "Default primary" }}
        title="Edit"
      >
        Short content
      </FormDialog>
    );

    expect(screen.getByRole("button", { name: "Custom action" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Default primary" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
