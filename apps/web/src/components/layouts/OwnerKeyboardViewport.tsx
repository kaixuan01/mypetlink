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

      if (
        (keyboardControlFocused || keyboardOpen) &&
        (viewportShrank || bottomIsOccluded)
      ) {
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

    document.addEventListener("focusin", updateKeyboardState);
    document.addEventListener("focusout", updateKeyboardState);
    activeViewport.addEventListener("resize", updateKeyboardState);
    activeViewport.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("resize", updateKeyboardState);

    return () => {
      document.removeEventListener("focusin", updateKeyboardState);
      document.removeEventListener("focusout", updateKeyboardState);
      activeViewport.removeEventListener("resize", updateKeyboardState);
      activeViewport.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("resize", updateKeyboardState);
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

function clearKeyboardState(root: HTMLElement) {
  root.removeAttribute(ownerKeyboardOpenAttribute);
  root.style.removeProperty(ownerKeyboardInsetProperty);
}
