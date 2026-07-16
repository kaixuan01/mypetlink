"use client";

import { useEffect, useRef, type RefObject } from "react";

type ModalDialogFocusOptions = {
  /** The dialog container; Tab focus is kept inside it. */
  dialogRef: RefObject<HTMLElement | null>;
  /** Focused when the dialog opens. Falls back to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called when Escape is pressed; decide there whether to close. */
  onEscape: () => void;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Shared accessibility behavior for modal dialogs: locks body scroll, moves
 * focus into the dialog on open, keeps Tab/Shift+Tab cycling inside it,
 * reports Escape presses, and returns focus to the previously focused element
 * when the dialog unmounts. Call it from a component that mounts only while
 * the dialog is open.
 */
export function useModalDialogFocus({
  dialogRef,
  initialFocusRef,
  onEscape,
}: ModalDialogFocusOptions) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const getFocusable = () =>
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

    (initialFocusRef?.current ?? getFocusable()?.[0])?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusable();

      if (!focusable?.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActive?.focus?.();
    };
  }, [dialogRef, initialFocusRef]);
}
