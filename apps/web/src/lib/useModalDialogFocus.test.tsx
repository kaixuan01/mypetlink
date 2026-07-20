// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalDialogFocus } from "./useModalDialogFocus";

function Modal({ label, onClose }: { label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalDialogFocus({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });
  return <div aria-label={label} aria-modal="true" ref={dialogRef} role="dialog"><button ref={closeRef}>Close {label}</button></div>;
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("useModalDialogFocus", () => {
  it("locks scrolling, focuses the dialog, restores focus, and unlocks on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { getByRole, unmount } = render(<Modal label="Tag details" onClose={() => undefined} />);

    expect(document.body.style.overflow).toBe("hidden");
    expect(opener.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(getByRole("button", { name: "Close Tag details" }));
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(opener.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("sends Escape only to the topmost modal and keeps the body locked", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const outer = render(<Modal label="Details" onClose={outerClose} />);
    const inner = render(<Modal label="Confirmation" onClose={innerClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();

    inner.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(outerClose).toHaveBeenCalledOnce();
    outer.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not accumulate Escape listeners across repeated mount cycles", () => {
    const onClose = vi.fn();
    for (let index = 0; index < 4; index += 1) {
      const modal = render(<Modal label={`Details ${index}`} onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      modal.unmount();
    }

    expect(onClose).toHaveBeenCalledTimes(4);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("keeps shared background inert when nested modals unmount out of order", () => {
    const background = document.createElement("button");
    document.body.append(background);
    const outer = render(<Modal label="Details" onClose={() => undefined} />);
    const inner = render(<Modal label="Confirmation" onClose={() => undefined} />);

    expect(background.hasAttribute("inert")).toBe(true);
    outer.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    expect(background.hasAttribute("inert")).toBe(true);
    inner.unmount();
    expect(background.hasAttribute("inert")).toBe(false);
    background.remove();
  });
});
