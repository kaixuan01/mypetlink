"use client";

import { useEffect } from "react";

export const ownerKeyboardOpenAttribute = "data-owner-keyboard-open";
export const ownerKeyboardInsetProperty = "--owner-keyboard-inset";

const viewportRoundingTolerance = 1;
const nonKeyboardInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

export function OwnerKeyboardViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    clearKeyboardState(root);

    if (!viewport) {
      return undefined;
    }

    const activeViewport = viewport;
    let baselineHeight = activeViewport.height;
    let keyboardOpen = false;

    function updateKeyboardState() {
      if (activeViewport.scale !== 1) {
        return;
      }

      const currentHeight = activeViewport.height;
      const bottomOcclusion = Math.max(
        0,
        window.innerHeight - currentHeight - activeViewport.offsetTop
      );
      const viewportShrank =
        currentHeight < baselineHeight - viewportRoundingTolerance;
      const bottomIsOccluded =
        bottomOcclusion > viewportRoundingTolerance;
      const keyboardControlFocused = isSoftwareKeyboardControl(
        document.activeElement
      );
      // An already-open keyboard stays open across the brief moments when focus
      // has not settled on the next text control yet. It must not survive focus
      // landing on a control that never raises a keyboard: a native picker
      // (file chooser, date wheel) shrinks the visual viewport the same way a
      // keyboard does, and treating that as keyboard occlusion writes an inset
      // large enough to collapse the owner form shells.
      const keyboardPlausible =
        keyboardControlFocused ||
        (keyboardOpen && !isNonKeyboardControl(document.activeElement));

      if (keyboardPlausible && (viewportShrank || bottomIsOccluded)) {
        keyboardOpen = true;
        root.setAttribute(ownerKeyboardOpenAttribute, "");
        root.style.setProperty(
          ownerKeyboardInsetProperty,
          `${bottomOcclusion}px`
        );
        return;
      }

      keyboardOpen = false;
      baselineHeight = currentHeight;
      clearKeyboardState(root);
    }

    // Returning from a native picker or another app can restore the viewport
    // while the page is hidden, so no resize arrives to re-measure with. Re-run
    // the same measurement on restore instead of trusting the last value seen
    // before the page was backgrounded.
    function handlePageVisible() {
      if (document.visibilityState === "visible") {
        updateKeyboardState();
      }
    }

    document.addEventListener("focusin", updateKeyboardState);
    document.addEventListener("focusout", updateKeyboardState);
    document.addEventListener("visibilitychange", handlePageVisible);
    activeViewport.addEventListener("resize", updateKeyboardState);
    activeViewport.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);
    window.addEventListener("pageshow", updateKeyboardState);

    return () => {
      document.removeEventListener("focusin", updateKeyboardState);
      document.removeEventListener("focusout", updateKeyboardState);
      document.removeEventListener("visibilitychange", handlePageVisible);
      activeViewport.removeEventListener("resize", updateKeyboardState);
      activeViewport.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
      window.removeEventListener("pageshow", updateKeyboardState);
      clearKeyboardState(root);
    };
  }, []);

  return null;
}

export function isSoftwareKeyboardControl(element: Element | null) {
  if (
    typeof HTMLTextAreaElement !== "undefined" &&
    element instanceof HTMLTextAreaElement
  ) {
    return !element.disabled && !element.readOnly;
  }

  if (
    typeof HTMLInputElement !== "undefined" &&
    element instanceof HTMLInputElement
  ) {
    return (
      !element.disabled &&
      !element.readOnly &&
      !nonKeyboardInputTypes.has(element.type)
    );
  }

  return (
    typeof HTMLElement !== "undefined" &&
    element instanceof HTMLElement &&
    element.isContentEditable
  );
}

/**
 * Controls that open a native surface (picker, chooser, wheel) or no surface at
 * all, rather than the software keyboard. Focus landing on one of these is
 * positive evidence that any keyboard has gone, even while the viewport is
 * still mid-transition.
 */
export function isNonKeyboardControl(element: Element | null) {
  if (
    typeof HTMLInputElement !== "undefined" &&
    element instanceof HTMLInputElement
  ) {
    return nonKeyboardInputTypes.has(element.type);
  }

  return (
    (typeof HTMLSelectElement !== "undefined" &&
      element instanceof HTMLSelectElement) ||
    (typeof HTMLButtonElement !== "undefined" &&
      element instanceof HTMLButtonElement)
  );
}

function clearKeyboardState(root: HTMLElement) {
  root.removeAttribute(ownerKeyboardOpenAttribute);
  root.style.removeProperty(ownerKeyboardInsetProperty);
}
