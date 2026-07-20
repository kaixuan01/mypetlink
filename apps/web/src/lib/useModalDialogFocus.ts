"use client";

import { useEffect, useRef, type RefObject } from "react";

type ModalDialogFocusOptions = {
  /** The dialog container; Tab focus is kept inside it. */
  dialogRef: RefObject<HTMLElement | null>;
  /** Focused when the dialog opens. Falls back to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called when Escape is pressed; decide there whether to close. */
  onEscape: () => void;
  /** Allows always-mounted dialog components to enable behavior only when open. */
  enabled?: boolean;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const modalStack: symbol[] = [];
let bodyLockCount = 0;
let originalBodyOverflow = "";

function lockBody() {
  if (bodyLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBody() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
  }
}

type InertState = {
  count: number;
  hadInert: boolean;
  ariaHidden: string | null;
};

const inertStates = new WeakMap<HTMLElement, InertState>();

function makeBackgroundInert(dialog: HTMLElement | null) {
  const elements: HTMLElement[] = [];
  // Some components pass the inner panel while the backdrop and panel share
  // an outer aria-modal container. Treat that whole container as the modal so
  // its interactive backdrop is not accidentally made inert.
  let branch: HTMLElement | null = dialog?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? dialog;

  while (branch?.parentElement && branch !== document.body) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
      const existing = inertStates.get(sibling);
      if (existing) existing.count += 1;
      else inertStates.set(sibling, {
        count: 1,
        hadInert: sibling.hasAttribute("inert"),
        ariaHidden: sibling.getAttribute("aria-hidden"),
      });
      elements.push(sibling);
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
    }
    branch = branch.parentElement;
  }

  return () => {
    for (const element of elements) {
      const state = inertStates.get(element);
      if (!state) continue;
      state.count -= 1;
      if (state.count > 0) continue;
      if (!state.hadInert) element.removeAttribute("inert");
      if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", state.ariaHidden);
      inertStates.delete(element);
    }
  };
}

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
  enabled = true,
}: ModalDialogFocusOptions) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return;
    const modalToken = Symbol("modal-dialog");
    const previousActive = document.activeElement as HTMLElement | null;
    modalStack.push(modalToken);
    lockBody();
    const restoreBackground = makeBackgroundInert(dialogRef.current);

    const getFocusable = () =>
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

    (initialFocusRef?.current ?? getFocusable()?.[0])?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      // Nested confirmation dialogs and menus may share this hook. Only the
      // topmost modal is allowed to trap focus or react to Escape.
      if (modalStack.at(-1) !== modalToken) {
        return;
      }

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
      document.removeEventListener("keydown", handleKeyDown);
      const index = modalStack.lastIndexOf(modalToken);
      if (index >= 0) modalStack.splice(index, 1);
      unlockBody();
      restoreBackground();

      // A closing nested modal returns focus to its trigger inside the parent;
      // a closing top-level modal returns it to the row action that opened it.
      if (previousActive?.isConnected) previousActive.focus();
    };
  }, [dialogRef, enabled, initialFocusRef]);
}
