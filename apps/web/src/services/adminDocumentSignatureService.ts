import { apiRequest, apiRequestBlob, isApiClientError } from "@/services/apiClient";

// The signed-in administrator's own signature. Every call is about your own
// signature only; the image is fetched privately and never has a public link.

export type DocumentSignature = {
  id: string;
  signatoryName: string;
  signatoryPosition: string;
  imageWidth: number;
  imageHeight: number;
  savedAt: string;
};

export type DocumentSignatureStatus = {
  signature: DocumentSignature | null;
  maxUploadBytes: number;
};

export type SaveDocumentSignatureInput = {
  signatoryName: string;
  signatoryPosition: string;
  /** Leave out to keep the current image and change only the wording. */
  image?: { base64: string; contentType: string } | null;
  /** The version being replaced, or null when there is none. */
  currentSignatureId: string | null;
};

/** Kept in step with the server, which checks these again. */
export const signatureTextMaxLength = 60;
export const signatureImageTypes = ["image/png", "image/jpeg"] as const;

const endpoint = "/api/v1/admin/document-signature";

async function data<T>(request: Promise<{ data?: T | null }>) {
  const response = await request;
  if (!response.data) throw new Error("No signature details were returned.");
  return response.data;
}

export function getDocumentSignature() {
  return data(apiRequest<DocumentSignatureStatus>(endpoint));
}

export function saveDocumentSignature(input: SaveDocumentSignatureInput) {
  return data(
    apiRequest<DocumentSignatureStatus>(endpoint, {
      method: "PUT",
      body: {
        signatoryName: input.signatoryName,
        signatoryPosition: input.signatoryPosition,
        imageBase64: input.image?.base64 ?? null,
        contentType: input.image?.contentType ?? null,
        currentSignatureId: input.currentSignatureId,
      },
    })
  );
}

export function removeDocumentSignature(signatureId: string) {
  return data(
    apiRequest<DocumentSignatureStatus>(`${endpoint}/remove`, { method: "POST", body: { signatureId } })
  );
}

/** Your signature image, as a blob for an on-screen preview. */
export async function getDocumentSignatureImage() {
  return (await apiRequestBlob(`${endpoint}/image`)).blob;
}

/** Reads a chosen file as base64, without the data URL prefix. */
export function readSignatureFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("The image could not be read. Choose it again."));
    reader.readAsDataURL(file);
  });
}

export function documentSignatureError(error: unknown, fallback = "We couldn’t save your signature. Please try again."): string {
  if (!isApiClientError(error)) return fallback;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You don’t have permission to keep a signature on file.";
  if (error.status === 0) return "We couldn’t connect right now. Check your connection and try again.";
  if (error.status === 400 || error.status === 409) return error.message || fallback;
  return fallback;
}
