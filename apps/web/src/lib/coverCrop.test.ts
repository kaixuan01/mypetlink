import { describe, expect, it } from "vitest";
import {
  calculateCoverCropMetrics,
  PET_COVER_ASPECT_RATIO,
} from "@/lib/coverCrop";

describe("cover crop geometry", () => {
  it("detects vertical-only movement for the production Topu cover ratio", () => {
    const metrics = calculateCoverCropMetrics({
      naturalWidth: 1080,
      naturalHeight: 607,
      containerWidth: 500,
      containerHeight: 500 / PET_COVER_ASPECT_RATIO,
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.canMoveX).toBe(false);
    expect(metrics?.canMoveY).toBe(true);
    expect(metrics?.overflowX).toBeCloseTo(0);
    expect(metrics?.overflowY).toBeGreaterThan(80);
  });

  it("detects horizontal-only movement for a panoramic cover", () => {
    const metrics = calculateCoverCropMetrics({
      naturalWidth: 1600,
      naturalHeight: 400,
      containerWidth: 500,
      containerHeight: 200,
    });

    expect(metrics?.canMoveX).toBe(true);
    expect(metrics?.canMoveY).toBe(false);
    expect(metrics?.overflowX).toBe(300);
    expect(metrics?.overflowY).toBe(0);
  });

  it("ignores sub-pixel overflow and rejects incomplete measurements", () => {
    expect(
      calculateCoverCropMetrics({
        naturalWidth: 1001,
        naturalHeight: 400,
        containerWidth: 500,
        containerHeight: 200,
      })?.canMoveX
    ).toBe(false);
    expect(
      calculateCoverCropMetrics({
        naturalWidth: 0,
        naturalHeight: 400,
        containerWidth: 500,
        containerHeight: 200,
      })
    ).toBeNull();
  });
});
