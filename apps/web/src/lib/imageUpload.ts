// Images are downscaled in the browser for local previews and prepared as
// bounded JPEG files before direct cloud uploads.

export const MAX_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB raw file guard
const MAX_IMAGE_DIMENSION = 720;
const MAX_UPLOAD_IMAGE_DIMENSION = 1600;
const OUTPUT_QUALITY = 0.82;

export type ImageReadResult = {
  dataUrl: string;
};

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export async function readImageAsDataUrl(file: File): Promise<string> {
  const canvas = await drawImageToCanvas(file, MAX_IMAGE_DIMENSION);
  return canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
}

export async function prepareImageFileForUpload(file: File): Promise<File> {
  const canvas = await drawImageToCanvas(file, MAX_UPLOAD_IMAGE_DIMENSION);
  const blob = await canvasToBlob(canvas, "image/jpeg", OUTPUT_QUALITY);
  const fileName = toJpegFileName(file.name);

  return new File([blob], fileName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function drawImageToCanvas(file: File, maxDimension: number) {
  if (!isImageFile(file)) {
    throw new Error("Please choose an image file.");
  }

  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new Error("Image is too large. Please choose a file under 10MB.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const { width, height } = scaleToFit(
      image.naturalWidth,
      image.naturalHeight,
      maxDimension
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not process this image. Please try another file.");
    }

    context.drawImage(image, 0, 0, width, height);

    return canvas;
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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Could not process this image. Please try another file."));
      },
      type,
      quality
    );
  });
}

function toJpegFileName(fileName: string) {
  const trimmed = fileName.trim() || "image";
  const base = trimmed.replace(/\.[^.]+$/, "") || "image";

  return `${base}.jpg`;
}
