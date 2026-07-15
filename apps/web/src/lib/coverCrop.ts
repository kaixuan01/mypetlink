export const PET_COVER_ASPECT_RATIO = 5 / 2;
export const COVER_CROP_OVERFLOW_TOLERANCE_PX = 1;

export type CoverCropMetrics = {
  naturalWidth: number;
  naturalHeight: number;
  containerWidth: number;
  containerHeight: number;
  imageAspectRatio: number;
  containerAspectRatio: number;
  scaledWidth: number;
  scaledHeight: number;
  overflowX: number;
  overflowY: number;
  canMoveX: boolean;
  canMoveY: boolean;
};

type CoverCropDimensions = {
  naturalWidth: number;
  naturalHeight: number;
  containerWidth: number;
  containerHeight: number;
  tolerance?: number;
};

/**
 * Calculates the real movable area produced by `object-fit: cover`.
 * One image dimension exactly fits the container; only the overflowing axis
 * can produce a visible focal-position change.
 */
export function calculateCoverCropMetrics({
  naturalWidth,
  naturalHeight,
  containerWidth,
  containerHeight,
  tolerance = COVER_CROP_OVERFLOW_TOLERANCE_PX,
}: CoverCropDimensions): CoverCropMetrics | null {
  if (
    !isPositiveFinite(naturalWidth) ||
    !isPositiveFinite(naturalHeight) ||
    !isPositiveFinite(containerWidth) ||
    !isPositiveFinite(containerHeight)
  ) {
    return null;
  }

  const scale = Math.max(
    containerWidth / naturalWidth,
    containerHeight / naturalHeight
  );
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  const overflowX = Math.max(0, scaledWidth - containerWidth);
  const overflowY = Math.max(0, scaledHeight - containerHeight);
  const meaningfulTolerance = Math.max(0, tolerance);

  return {
    naturalWidth,
    naturalHeight,
    containerWidth,
    containerHeight,
    imageAspectRatio: naturalWidth / naturalHeight,
    containerAspectRatio: containerWidth / containerHeight,
    scaledWidth,
    scaledHeight,
    overflowX,
    overflowY,
    canMoveX: overflowX > meaningfulTolerance,
    canMoveY: overflowY > meaningfulTolerance,
  };
}

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}
