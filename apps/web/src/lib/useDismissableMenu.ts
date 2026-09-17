"use client";

import { useCallback, useEffect, type RefObject } from "react";

type DismissableMenuOptions = {
  open: boolean;
  onClose: (returnFocus: boolean) => void;
  /** The panel itself; a pointer inside it must not dismiss it. */
  menuRef: RefObject<HTMLElement | null>;
  /** The control that opens it, which focus returns to on Escape. */
  triggerRef: RefObject<HTMLElement | null>;
};

/**
 * The two ways out of an open menu: Escape, and a pointer somewhere else.
 *
 * Extracted because the same twenty lines had been written in several places —
 * the owner profile menu, the admin row actions, the species filter — and a
 * menu that forgets one of them is a menu a keyboard user cannot leave. This is
 * deliberately *not* `useModalDialogFocus`: that one traps Tab, locks body
 * scroll and makes the page inert, which is right for a dialog and wrong for a
 * dropdown you are meant to be able to tab straight out of.
 *
 * Focus return is the caller's choice, because the two exits differ: Escape is
 * a deliberate cancel and should put focus back on the trigger, while clicking
 * elsewhere means the reader has already chosen where to be.
 */
export function useDismissableMenu({
  open,
  onClose,
  menuRef,
  triggerRef,
}: DismissableMenuOptions) {
  const close = useCallback(
    (returnFocus: boolean) => onClose(returnFocus),
    [onClose]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }

    function onPointerDown(event: Event) {
      const target = event.target as Node;

      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }

      close(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, menuRef, open, triggerRef]);
}
