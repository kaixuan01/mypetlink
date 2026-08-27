// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSoftwareKeyboardControl,
  OwnerKeyboardViewport,
  ownerKeyboardInsetProperty,
  ownerKeyboardOpenAttribute,
} from "./OwnerKeyboardViewport";

const originalInnerHeight = window.innerHeight;
const originalVisualViewport = window.visualViewport;

class TestVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(ownerKeyboardOpenAttribute);
  document.documentElement.style.removeProperty(ownerKeyboardInsetProperty);
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: originalInnerHeight,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: originalVisualViewport,
  });
});

describe("OwnerKeyboardViewport", () => {
  it("does not infer a keyboard from focus alone", () => {
    const viewport = installViewport();
    renderKeyboardHarness();

    screen.getByLabelText("Pet name").focus();
    viewport.dispatchEvent(new Event("resize"));

    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("");
  });

  it("tracks resizes-content shrink and restore without accumulating offsets", () => {
    const viewport = installViewport();
    renderKeyboardHarness();
    screen.getByLabelText("Pet name").focus();

    resizeViewport(viewport, { viewportHeight: 500, windowHeight: 500 });
    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(true);
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("0px");

    resizeViewport(viewport, { viewportHeight: 800, windowHeight: 800 });
    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(false);

    resizeViewport(viewport, { viewportHeight: 480, windowHeight: 480 });
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("0px");
    resizeViewport(viewport, { viewportHeight: 800, windowHeight: 800 });
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("");
  });

  it("exposes only the measured occluded inset for visual-only resizing", () => {
    const viewport = installViewport();
    renderKeyboardHarness();
    screen.getByLabelText("Pet name").focus();

    resizeViewport(viewport, { viewportHeight: 500, windowHeight: 800 });

    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("300px");
  });

  it("ignores non-keyboard controls and safely handles unavailable visualViewport", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    renderKeyboardHarness();

    screen.getByLabelText("Remember choice").focus();
    window.dispatchEvent(new Event("resize"));

    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(false);
  });

  it("checks controls safely when DOM constructors are unavailable", () => {
    vi.stubGlobal("HTMLTextAreaElement", undefined);
    vi.stubGlobal("HTMLInputElement", undefined);
    vi.stubGlobal("HTMLElement", undefined);

    expect(isSoftwareKeyboardControl({} as Element)).toBe(false);
  });

  // CARE-R1: tapping "+ Add document" while the keyboard is still up moves
  // focus to the file input. Android then restores the layout viewport as the
  // keyboard leaves while the visual viewport is still small behind the chooser
  // transition. Measuring that gap as keyboard occlusion wrote a ~500px inset
  // and collapsed the Care editor to a single line of body.
  it("stops treating a viewport gap as a keyboard once a native picker holds focus", () => {
    const viewport = installViewport();
    renderKeyboardHarness();

    screen.getByLabelText("Notes").focus();
    resizeViewport(viewport, { viewportHeight: 500, windowHeight: 500 });
    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(true);

    screen.getByLabelText("Care document").focus();
    document.dispatchEvent(new Event("focusin"));
    resizeViewport(viewport, { viewportHeight: 300, windowHeight: 800 });

    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("");
    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(false);
  });

  it("keeps an open keyboard latched while focus moves between text controls", () => {
    const viewport = installViewport();
    renderKeyboardHarness();

    screen.getByLabelText("Notes").focus();
    resizeViewport(viewport, { viewportHeight: 500, windowHeight: 800 });
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("300px");

    // Focus is briefly unsettled between two text fields while the keyboard
    // stays up; the measured inset must survive that gap.
    (document.activeElement as HTMLElement).blur();
    document.dispatchEvent(new Event("focusout"));

    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("300px");
  });

  it("re-measures on restore when no resize follows a hidden page", () => {
    const viewport = installViewport();
    renderKeyboardHarness();

    screen.getByLabelText("Pet name").focus();
    resizeViewport(viewport, { viewportHeight: 300, windowHeight: 800 });
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("500px");

    setVisibility("hidden");
    // The picker returns the viewport while the page is hidden, so nothing
    // dispatches resize before the owner sees the form again.
    viewport.height = 800;
    setVisibility("visible");

    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("");
    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(false);
  });

  it("keeps a still-open keyboard after an ordinary app resume", () => {
    const viewport = installViewport();
    renderKeyboardHarness();

    screen.getByLabelText("Notes").focus();
    resizeViewport(viewport, { viewportHeight: 500, windowHeight: 800 });

    setVisibility("hidden");
    setVisibility("visible");

    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("300px");
  });

  it("removes listeners and transient document state on teardown", () => {
    const viewport = installViewport();
    const removeViewportListener = vi.spyOn(viewport, "removeEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderKeyboardHarness();
    screen.getByLabelText("Pet name").focus();
    resizeViewport(viewport, { viewportHeight: 500, windowHeight: 500 });

    unmount();

    expect(removeViewportListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );
    expect(removeViewportListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function)
    );
    expect(removeWindowListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );
    expect(
      document.documentElement.hasAttribute(ownerKeyboardOpenAttribute)
    ).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue(
        ownerKeyboardInsetProperty
      )
    ).toBe("");
  });
});

function renderKeyboardHarness() {
  return render(
    <div>
      <input aria-label="Pet name" />
      <input aria-label="Remember choice" type="checkbox" />
      <input aria-label="Care document" type="file" />
      <textarea aria-label="Notes" />
      <OwnerKeyboardViewport />
    </div>
  );
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function installViewport() {
  const viewport = new TestVisualViewport();
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  return viewport;
}

function resizeViewport(
  viewport: TestVisualViewport,
  {
    viewportHeight,
    windowHeight,
  }: { viewportHeight: number; windowHeight: number }
) {
  viewport.height = viewportHeight;
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: windowHeight,
  });
  viewport.dispatchEvent(new Event("resize"));
}
