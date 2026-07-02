// Phase 0 mock media handling. Real cloud storage arrives in Phase 1; until
// then images are downscaled in the browser and persisted as data URLs in the
// same localStorage mock collections as the rest of the pet data. Downscaling
// keeps each image small enough to stay well within the localStorage quota.

export const MAX_IMAGE_SOURCE_BYTES = 8 * 1024 * 1024; // 8MB raw file guard
const MAX_IMAGE_DIMENSION = 720;
const OUTPUT_QUALITY = 0.82;

export type ImageReadResult = {
  dataUrl: string;
};

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

// Reads an image File, downscales it so its longest edge is at most
// MAX_IMAGE_DIMENSION, and returns a compressed JPEG data URL. Rejects
// non-image files and files larger than the source guard.
export async function readImageAsDataUrl(file: File): Promise<string> {
  if (!isImageFile(file)) {
    throw new Error("Please choose an image file.");
  }

  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error("Image is too large. Please choose a file under 8MB.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const { width, height } = scaleToFit(
      image.naturalWidth,
      image.naturalHeight,
      MAX_IMAGE_DIMENSION
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not process this image. Please try another file.");
    }

    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Could not read this image. Please try another file."));
    image.src = src;
  });
}

function scaleToFit(width: number, height: number, max: number) {
  if (width <= max && height <= max) {
    return { width, height };
  }

  const ratio = width > height ? max / width : max / height;

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}
