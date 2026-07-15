// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CoverPhoto,
  getCoverObjectPosition,
} from "@/components/ui/CoverPhoto";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CoverPhoto", () => {
  it("applies a saved percentage focal position", () => {
    render(
      <CoverPhoto
        alt="Milo cover photo"
        positionX={28}
        positionY={74}
        src="/cover.jpg"
      />
    );

    expect(
      (screen.getByAltText("Milo cover photo") as HTMLImageElement).style
        .objectPosition
    ).toBe("28% 74%");
  });

  it("falls back to a centred focal position for legacy profiles", () => {
    render(<CoverPhoto alt="Legacy cover photo" src="/cover.jpg" />);

    expect(
      (screen.getByAltText("Legacy cover photo") as HTMLImageElement).style
        .objectPosition
    ).toBe("50% 50%");
  });

  it("uses one shared aspect ratio, cover fitting, and overflow containment", () => {
    render(<CoverPhoto alt="Responsive cover photo" src="/cover.jpg" />);

    const image = screen.getByAltText("Responsive cover photo");
    expect(image.className).toContain("object-cover");
    expect(image.parentElement?.className).toContain("overflow-hidden");
    expect(image.parentElement?.className).toContain("w-full");
    expect((image.parentElement as HTMLElement).style.aspectRatio).toBe(
      "2.5 / 1"
    );
  });

  it("clamps invalid focal values to the supported percentage range", () => {
    expect(getCoverObjectPosition(0, 0)).toBe("0% 0%");
    expect(getCoverObjectPosition(-20, 140)).toBe("0% 100%");
    expect(getCoverObjectPosition(Number.NaN, undefined)).toBe("50% 50%");
  });

  it("reports crop availability again when the preview container resizes", () => {
    let resizeCallback: ResizeObserverCallback = () => undefined;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const onCropMetricsChange = vi.fn();
    render(
      <CoverPhoto
        alt="Measured cover photo"
        onCropMetricsChange={onCropMetricsChange}
        src="/cover.jpg"
      />
    );

    const image = screen.getByAltText("Measured cover photo") as HTMLImageElement;
    const container = image.parentElement as HTMLDivElement;
    let width = 500;
    let height = 200;
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 400 },
    });
    container.getBoundingClientRect = () =>
      ({ width, height }) as DOMRect;

    fireEvent.load(image);
    expect(onCropMetricsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ canMoveX: true, canMoveY: false })
    );

    width = 250;
    height = 100;
    resizeCallback([], {} as ResizeObserver);
    expect(onCropMetricsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        containerWidth: 250,
        containerHeight: 100,
        canMoveX: true,
        canMoveY: false,
      })
    );
  });
});
