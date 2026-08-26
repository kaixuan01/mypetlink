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
      <OwnerKeyboardViewport />
    </div>
  );
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
