/**
 * The single place MyPetLink talks to the browser's built-in sharing.
 *
 * Every share flow reaches the device share sheet through here, so
 * availability checks, cancellation handling, and the outcome vocabulary stay
 * identical wherever sharing is offered.
 */

export type NativeShareOutcome =
  /** The share sheet opened and the visitor completed it. */
  | "completed"
  /** The share sheet opened and the visitor backed out; say nothing. */
  | "cancelled"
  /** This browser has no built-in sharing; offer copying instead. */
  | "unsupported"
  /** Sharing was available but refused to open; offer copying instead. */
  | "failed";

/**
 * Availability cannot change while a page is open, so there is nothing to
 * subscribe to. The store shape keeps server and client renders identical.
 */
export function subscribeToNativeShareAvailability() {
  return () => {};
}

export function getNativeShareAvailability() {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

/** Static rendering assumes no share sheet, so the first paint hydrates cleanly. */
export function getServerNativeShareAvailability() {
  return false;
}

/** Whether this browser will accept an image alongside the shared text. */
export function canShareFiles(file: File) {
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Backing out of the share sheet rejects with AbortError and is not an error. */
export function isNativeShareCancellation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export async function requestNativeShare(
  data: ShareData
): Promise<NativeShareOutcome> {
  if (!getNativeShareAvailability()) {
    return "unsupported";
  }

  try {
    await navigator.share(data);
    return "completed";
  } catch (error) {
    return isNativeShareCancellation(error) ? "cancelled" : "failed";
  }
}
