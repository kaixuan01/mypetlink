import type { CareCompletionStatus, CareRecord, RecordPayload } from "@/types";

/**
 * One Log as done save, from before its first asynchronous step until its
 * outcome is settled.
 *
 * - `editorGeneration`: the editor this attempt belongs to. A result for an
 *   attempt whose editor is no longer on screen is ignored.
 * - `payload`: the immutable draft it submitted.
 * - `phase`: `preparing` while files stage (nothing sent: a failure here
 *   wrote nothing); `sending` once the create request left; then `unknown`
 *   when the response was lost or the service failed after it may have
 *   written, or `refused` when the service answered that this request wrote
 *   nothing. A refusal says nothing about any other request.
 * - `mediaFileIds`: the exact attachments the request carried — files kept
 *   from before and files uploaded for this attempt — by their stored media
 *   ids, never by name or size.
 */
export type CareSaveAttempt = {
  id: number;
  editorGeneration: number;
  targetId: string;
  payload: Readonly<RecordPayload>;
  phase: "preparing" | "sending" | "unknown" | "refused";
  mediaFileIds: readonly string[];
  /** Whether this attempt uploaded files of its own. */
  uploadedFiles: boolean;
};

/**
 * What a completion-status read proves about one attempt. Only `confirmed`
 * may close the editor; every other result keeps the owner's draft.
 */
export type CareSaveResolution =
  | {
      kind: "confirmed";
      /**
       * `attachments`: the completing record carries the files this attempt
       * uploaded, so it is this owner's save. `details`: the same details are
       * logged, but which request wrote them cannot be shown.
       */
      proof: "attachments" | "details";
      completion: CareRecord;
    }
  | { kind: "different-attachments"; completion: CareRecord }
  | { kind: "conflict"; completion: CareRecord }
  | { kind: "not-found" }
  | {
      kind: "target-changed";
      state: "archived" | "no-due-date" | "pet-archived";
      completion: CareRecord | null;
    };

export function assessCompletionRecovery(
  attempt: CareSaveAttempt,
  status: CareCompletionStatus
): CareSaveResolution {
  if (status.target.id !== attempt.targetId) {
    // Never let a read for another item settle this attempt.
    return { kind: "not-found" };
  }

  if (
    status.state === "archived" ||
    status.state === "pet-archived" ||
    status.state === "no-due-date"
  ) {
    return { kind: "target-changed", state: status.state, completion: status.completion };
  }

  if (status.state === "pending" || !status.completion) {
    return { kind: "not-found" };
  }

  const completion = status.completion;
  if (!detailsMatch(completion, attempt.payload)) {
    return { kind: "conflict", completion };
  }

  if (!sameMediaSet(completion.documents ?? [], attempt.mediaFileIds)) {
    return { kind: "different-attachments", completion };
  }

  return {
    kind: "confirmed",
    proof:
      attempt.uploadedFiles && attempt.mediaFileIds.length > 0
        ? "attachments"
        : "details",
    completion,
  };
}

/** Whether a stored record holds exactly the details a save sent. */
export function detailsMatch(record: CareRecord, payload: RecordPayload) {
  const text = (value?: string) => (value ?? "").trim();
  return (
    record.type === payload.type &&
    text(record.title) === text(payload.title) &&
    text(record.careName) === text(payload.careName) &&
    record.date === payload.date &&
    text(record.dueDate) === text(payload.dueDate) &&
    text(record.provider) === text(payload.provider) &&
    text(record.notes) === text(payload.notes) &&
    record.publicVisibility === payload.publicVisibility
  );
}

/**
 * Attachments compared by their stored media ids, as sets: the order files
 * appear in does not change which files they are.
 */
export function sameMediaSet(
  documents: ReadonlyArray<{ id: string }>,
  mediaFileIds: readonly string[]
) {
  const stored = new Set(documents.map((document) => document.id));
  const sent = new Set(mediaFileIds);
  return (
    stored.size === sent.size &&
    documents.length === stored.size &&
    mediaFileIds.length === sent.size &&
    [...sent].every((id) => stored.has(id))
  );
}
