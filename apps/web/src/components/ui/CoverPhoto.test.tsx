// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  CoverPhoto,
  getCoverObjectPosition,
} from "@/components/ui/CoverPhoto";

afterEach(cleanup);

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

  it("uses responsive banner heights, cover fitting, and overflow containment", () => {
    render(<CoverPhoto alt="Responsive cover photo" src="/cover.jpg" />);

    const image = screen.getByAltText("Responsive cover photo");
    expect(image.className).toContain("object-cover");
    expect(image.parentElement?.className).toContain("h-40");
    expect(image.parentElement?.className).toContain("sm:h-52");
    expect(image.parentElement?.className).toContain("overflow-hidden");
    expect(image.parentElement?.className).toContain("w-full");
  });

  it("clamps invalid focal values to the supported percentage range", () => {
    expect(getCoverObjectPosition(-20, 140)).toBe("0% 100%");
    expect(getCoverObjectPosition(Number.NaN, undefined)).toBe("50% 50%");
  });
});
