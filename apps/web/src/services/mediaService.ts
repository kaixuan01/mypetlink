import { prepareImageFileForUpload } from "@/lib/imageUpload";
import { apiRequest } from "@/services/apiClient";
import type {
  BackendCompleteMediaUploadResponse,
  BackendMediaDownloadUrlResponse,
  BackendMediaUploadCategory,
  BackendMediaUploadResponse,
} from "@/services/apiDtos";

const IMAGE_CATEGORIES = new Set<BackendMediaUploadCategory>([
  "PetProfilePhoto",
  "PetCoverPhoto",
  "MomentImage",
  "TagProductImage",
]);
const VIDEO_CATEGORIES = new Set<BackendMediaUploadCategory>(["MomentVideo"]);
const DOCUMENT_CATEGORIES = new Set<BackendMediaUploadCategory>([
  "VaccinationDocument",
  "MedicalDocument",
  "OrderReceipt",
]);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4"]);
const DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type MediaUploadInput = {
  file: File;
  category: BackendMediaUploadCategory;
  petId?: string;
  momentId?: string;
  careRecordId?: string;
  orderId?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type UploadedMediaFile = BackendCompleteMediaUploadResponse & {
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
};

export async function initializeMediaUpload(input: MediaUploadInput) {
  const file = await prepareFileForUpload(input.category, input.file);

  validateUploadFile(input.category, file);

  const response = await apiRequest<BackendMediaUploadResponse>(
    "/api/v1/media/uploads",
    {
      method: "POST",
      body: {
        petId: input.petId,
        momentId: input.momentId,
        careRecordId: input.careRecordId,
        orderId: input.orderId,
        category: input.category,
        originalFileName: file.name,
        contentType: normalizeContentType(file),
        fileSizeBytes: file.size,
        width: input.width,
        height: input.height,
        durationSeconds: input.durationSeconds,
      },
    }
  );

  if (!response.data) {
    throw new Error("Upload could not be started. Please try again.");
  }

  return { upload: response.data, file };
}

export async function completeMediaUpload(mediaId: string) {
  const response = await apiRequest<BackendCompleteMediaUploadResponse>(
    `/api/v1/media/uploads/${encodeURIComponent(mediaId)}/complete`,
    { method: "POST" }
  );

  if (!response.data) {
    throw new Error("Upload could not be completed. Please try again.");
  }

  return response.data;
}

export async function deleteMedia(mediaId: string) {
  await apiRequest<void>(`/api/v1/media/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
  });
}

export async function createPrivateDownloadUrl(mediaId: string) {
  const response = await apiRequest<BackendMediaDownloadUrlResponse>(
    `/api/v1/media/${encodeURIComponent(mediaId)}/download`
  );

  if (!response.data) {
    throw new Error("File link could not be created. Please try again.");
  }

  return response.data;
}

export async function uploadMediaFile(
  input: MediaUploadInput
): Promise<UploadedMediaFile> {
  const { upload, file } = await initializeMediaUpload(input);

  await putFile(upload, file, input.signal, input.onProgress);

  const completed = await completeMediaUpload(upload.mediaId);

  return {
    ...completed,
    originalFileName: file.name,
    contentType: normalizeContentType(file),
    fileSizeBytes: file.size,
  };
}

async function prepareFileForUpload(
  category: BackendMediaUploadCategory,
  file: File
) {
  if (IMAGE_CATEGORIES.has(category)) {
    return prepareImageFileForUpload(file);
  }

  return file;
}

function validateUploadFile(category: BackendMediaUploadCategory, file: File) {
  const contentType = normalizeContentType(file);

  if (IMAGE_CATEGORIES.has(category)) {
    if (!IMAGE_TYPES.has(contentType)) {
      throw new Error("Please choose a JPG, PNG, or WebP image.");
    }

    if (file.size > IMAGE_MAX_BYTES) {
      throw new Error("Image is too large. Please choose a file under 10MB.");
    }

    return;
  }

  if (VIDEO_CATEGORIES.has(category)) {
    if (!VIDEO_TYPES.has(contentType)) {
      throw new Error("Please choose an MP4 video.");
    }

    if (file.size > VIDEO_MAX_BYTES) {
      throw new Error("Video is too large. Please choose a file under 50MB.");
    }

    return;
  }

  if (DOCUMENT_CATEGORIES.has(category)) {
    if (!DOCUMENT_TYPES.has(contentType)) {
      throw new Error("Please choose a PDF, JPG, or PNG file.");
    }

    if (file.size > DOCUMENT_MAX_BYTES) {
      throw new Error("File is too large. Please choose a file under 10MB.");
    }
  }
}

function normalizeContentType(file: File) {
  if (file.type) {
    return file.type.toLowerCase();
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  if (extension === "mp4") {
    return "video/mp4";
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  return "application/octet-stream";
}

function putFile(
  upload: BackendMediaUploadResponse,
  file: File,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();

    xhr.open(upload.method, upload.uploadUrl);

    for (const [name, value] of Object.entries(upload.requiredHeaders ?? {})) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }

      reject(new Error("Upload failed. Please try again."));
    };

    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Upload failed. Please check your connection."));
    };

    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("Upload was cancelled."));
    };

    signal?.addEventListener("abort", abort);
    xhr.send(file);
  });
}
