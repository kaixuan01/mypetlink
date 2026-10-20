"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CareDocumentsField,
  categoryForType,
} from "@/components/portal/CareDocumentsField";
import { RecordCard } from "@/components/portal/RecordCard";
import { useOwnerHeaderPageContext } from "@/components/portal/OwnerHeaderActions";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormDialog } from "@/components/ui/FormDialog";
import { AnalyticsEvent, toAnalyticsRecordType, trackEvent } from "@/lib/analytics";
import {
  careRecordTypes,
  newCareRecordTypes,
  getCareRecordDateTerminology,
  getCareRecordEditorExamples,
  getCareRecordIdentityTerminology,
  isFutureCareRecordDate,
  isValidDateInputValue,
} from "@/lib/careRecordTerminology";
import {
  getEligibleFulfillmentCandidates,
  getExplicitlyFulfilledCareRecordIds,
  getMalaysiaTodayIsoDate,
} from "@/lib/careRecordStatus";
import {
  fromCareRecordAudience,
  toCareRecordAudience,
  type CareRecordAudience,
} from "@/lib/careRecordVisibility";
import {
  createRecord,
  deleteRecord,
  getCareCompletionStatus,
  getFriendlyRecordErrorMessage,
  getPetRecords,
  updateRecord,
} from "@/services/recordService";
import { isApiClientError } from "@/services/apiClient";
import { isUncertainRequestOutcome } from "@/lib/requestOutcome";
import {
  assessCompletionRecovery,
  type CareSaveAttempt,
} from "@/lib/careSaveRecovery";
import { isApiConfigured } from "@/services/apiConfig";
import { openPrivateMediaFile } from "@/services/mediaService";
import type {
  CareCompletionState,
  CareDocument,
  CareRecord,
  RecordPayload,
  RecordType,
} from "@/types";

type FormState = {
  type: "" | RecordType;
  careName: string;
  title: string;
  date: string;
  provider: string;
  dueDate: string;
  notes: string;
  audience: CareRecordAudience;
  fulfillsCareRecordId: string;
  documents: CareDocument[];
};

type FormErrors = Partial<Record<keyof FormState, string>>;

/**
 * Log as done: the due item being completed, loaded fresh through the
 * owner's session. Opening the form is not completion — nothing changes until
 * a save is confirmed by the server.
 */
type CompletionTarget = {
  record: CareRecord;
  petName: string;
};

type CompletionNotice = {
  message: string;
  retryRecordId?: string;
};

/**
 * What is known after a Log as done save did not come back cleanly. Every
 * state keeps the owner's draft and locks Save; none of them unlocks with
 * time, and none offers another write. `refused` means the service answered
 * that this request wrote nothing — which says nothing about an earlier
 * request for the same item, so it never unlocks an unlinked save either.
 */
type CompletionIssue =
  | { kind: "checking" }
  /** Nothing completes the item yet; the save may still be finishing. */
  | { kind: "unconfirmed" }
  /** The item's status could not be read. */
  | { kind: "status-unavailable" }
  /** Another record completes the item, with other details or attachments. */
  | {
      kind: "logged-differently";
      completion: CareRecord;
      attachmentsOnly: boolean;
      refused: boolean;
    }
  /** The item was deleted, lost its due date, or its pet was archived. */
  | {
      kind: "target-changed";
      state: Exclude<CareCompletionState, "pending" | "completed">;
      refused: boolean;
    };

/**
 * A Log as done save whose outcome is still unknown, kept with its draft when
 * the editor is closed so it can be reviewed again — and so the same item is
 * never opened as a fresh form while that save may still finish.
 */
type HeldSave = {
  target: CompletionTarget;
  form: FormState;
  attempt: CareSaveAttempt;
  issue: CompletionIssue;
};

type RecordsManagerProps = {
  petId: string;
  initialRecords: CareRecord[];
};

const emptyForm: FormState = {
  type: "",
  careName: "",
  title: "",
  date: "",
  provider: "",
  dueDate: "",
  notes: "",
  audience: "Private",
  fulfillsCareRecordId: "",
  documents: [],
};

export function RecordsManager({ petId, initialRecords }: RecordsManagerProps) {
  const apiMode = isApiConfigured();
  const [records, setRecords] = useState<CareRecord[]>(
    apiMode ? [] : initialRecords
  );
  const [isOpen, setIsOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CareRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [completionTarget, setCompletionTarget] =
    useState<CompletionTarget | null>(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionNotice, setCompletionNotice] =
    useState<CompletionNotice | null>(null);
  const [completionIssue, setCompletionIssue] =
    useState<CompletionIssue | null>(null);
  const saveAttemptRef = useRef<CareSaveAttempt | null>(null);
  const saveSequenceRef = useRef(0);
  // Which editor is on screen. It changes whenever an editor opens or closes
  // (and when this page goes away); async work compares its own copy before
  // touching the editor, so a late result can never reach a newer one.
  const editorGenerationRef = useRef(0);
  // True while a save is staging files or waiting for its response.
  const savingRef = useRef(false);
  const [heldSave, setHeldSave] = useState<HeldSave | null>(null);
  // Any unresolved or conflicting outcome locks Save and the draft. Only a
  // confirmed save, or the owner closing the editor, ends it.
  const saveLocked = Boolean(completionIssue);
  const selectableRecordTypes =
    editingRecord?.type === "Allergy" ||
    completionTarget?.record.type === "Allergy"
      ? careRecordTypes
      : newCareRecordTypes;
  const [errors, setErrors] = useState<FormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<CareRecord | null>(null);
  const autoOpenKeyRef = useRef("");
  const completionAttemptRef = useRef(0);
  // The completion target can sit beyond the first page of history, so it is
  // offered for fulfilment even when the loaded list does not include it. The
  // server re-validates the link on save either way.
  const fulfillmentRecords = useMemo(
    () =>
      completionTarget &&
      !records.some((record) => record.id === completionTarget.record.id)
        ? [completionTarget.record, ...records]
        : records,
    [completionTarget, records]
  );
  const isCompletingTarget = Boolean(
    completionTarget &&
      !editingRecord &&
      form.fulfillsCareRecordId === completionTarget.record.id
  );

  const groupedRecords = useMemo(
    () =>
      careRecordTypes
        .map((type) => ({
          type,
          records: records.filter((record) => record.type === type),
        }))
        // Only meaningful groups belong in the default list. Legacy Allergy
        // records remain visible because their populated group still passes.
        .filter((group) => group.records.length > 0),
    [records]
  );
  const dateTerminology = getCareRecordDateTerminology(form.type);
  const editorExamples = getCareRecordEditorExamples(form.type);
  const identityTerminology = getCareRecordIdentityTerminology(form.type);
  const fulfilledRecordIds = useMemo(
    () => getExplicitlyFulfilledCareRecordIds(records),
    [records]
  );
  const fulfillmentCandidates = useMemo(
    () =>
      getEligibleFulfillmentCandidates(fulfillmentRecords, {
        petId,
        type: form.type,
        recordDate: form.date,
        currentRecordId: editingRecord?.id,
        currentCreatedAt: editingRecord?.createdAt,
      }),
    [
      editingRecord?.createdAt,
      editingRecord?.id,
      form.date,
      form.type,
      fulfillmentRecords,
      petId,
    ]
  );
  const selectedFulfillmentTarget = form.fulfillsCareRecordId
    ? fulfillmentRecords.find((record) => record.id === form.fulfillsCareRecordId)
    : undefined;
  const selectedFulfillmentIsEligible = form.fulfillsCareRecordId
    ? fulfillmentCandidates.some(
        (record) => record.id === form.fulfillsCareRecordId
      )
    : true;
  const visibleFulfillmentCandidates =
    selectedFulfillmentTarget && !selectedFulfillmentIsEligible
      ? [selectedFulfillmentTarget, ...fulfillmentCandidates]
      : fulfillmentCandidates;
  const showFulfillmentPicker =
    visibleFulfillmentCandidates.length > 0 || Boolean(form.fulfillsCareRecordId);
  // Malaysia's day, not the browser's: the service rejects a record dated
  // after Malaysia's today, so the form must agree with it.
  const today = getMalaysiaTodayIsoDate();
  const formId = "care-record-editor-form";

  // Leaving the page retires its editor: nothing still running can touch it.
  useEffect(
    () => () => {
      editorGenerationRef.current += 1;
    },
    []
  );

  /** A new editor (or none) is on screen; earlier async work no longer owns it. */
  const beginEditor = useCallback(() => {
    editorGenerationRef.current += 1;
    return editorGenerationRef.current;
  }, []);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setLoadError("");
      }
    });

    getPetRecords(petId)
      .then((response) => {
        if (active) {
          setRecords(response.data);
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError(getFriendlyRecordErrorMessage(caught));
          setRecords([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [petId]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError("");
  }

  function updateRecordType(type: FormState["type"]) {
    setForm((current) => {
      if (current.type === type) {
        return { ...current, type };
      }

      return {
        ...current,
        type,
        careName: current.type ? "" : current.careName,
        fulfillsCareRecordId: current.type
          ? ""
          : current.fulfillsCareRecordId,
        documents: current.documents.map((document) =>
          document.sourceFile
            ? { ...document, category: categoryForType(type) }
            : document
        ),
      };
    });
    setErrors((current) => ({
      ...current,
      type: undefined,
      careName: undefined,
      fulfillsCareRecordId: undefined,
    }));
    setFormError("");
  }

  const openAddForm = useCallback(() => {
    // A save in progress keeps its editor until it settles.
    if (savingRef.current) return;
    completionAttemptRef.current += 1;
    beginEditor();
    saveAttemptRef.current = null;
    setCompletionIssue(null);
    setCompletionTarget(null);
    setCompletionLoading(false);
    setCompletionNotice(null);
    setEditingRecord(null);
    setForm(emptyForm);
    setErrors({});
    setActionError("");
    setFormError("");
    setSuccess("");
    setIsOpen(true);
  }, [beginEditor]);

  const restoreHeldSave = useCallback(
    (held: HeldSave) => {
      completionAttemptRef.current += 1;
      // The owner deliberately reopens this save: it now belongs to this editor.
      const editor = beginEditor();
      setSuccess("");
      setActionError("");
      setCompletionNotice(null);
      setEditingRecord(null);
      setForm(held.form);
      setErrors({});
      setFormError("");
      setCompletionTarget(held.target);
      saveAttemptRef.current = { ...held.attempt, editorGeneration: editor };
      setCompletionIssue(held.issue);
      setHeldSave(null);
      setIsOpen(true);
    },
    [beginEditor]
  );

  /**
   * Log as done. Reads the due item's completion status through the owner's
   * session — the item, and the record completing it if there is one — and
   * opens the ordinary create form prefilled only while it is still pending.
   * The id that brought us here proves nothing.
   */
  const startCompletion = useCallback(
    async (recordId: string) => {
      if (savingRef.current) return;
      if (heldSave && heldSave.target.record.id === recordId) {
        // A save for this item may still finish: reopen it, never a fresh form.
        restoreHeldSave(heldSave);
        return;
      }

      const attempt = ++completionAttemptRef.current;
      setSuccess("");
      setActionError("");
      setCompletionNotice(null);
      setCompletionTarget(null);
      setCompletionIssue(null);
      saveAttemptRef.current = null;
      setCompletionLoading(true);

      let notice: CompletionNotice | null = null;
      try {
        const status = await getCareCompletionStatus(recordId);
        if (attempt !== completionAttemptRef.current) return;

        const target = status.target;

        if (target.petId !== petId) {
          notice = { message: "This care item isn't available." };
        } else if (status.state === "completed") {
          notice = {
            message: `This care item was already logged as done on ${status.completion?.date ?? "an earlier day"}.`,
          };
        } else if (status.state !== "pending") {
          notice = { message: targetStateMessage(status.state) };
        } else if (savingRef.current) {
          // A save started meanwhile keeps its editor.
          return;
        } else {
          beginEditor();
          setEditingRecord(null);
          setForm({
            ...emptyForm,
            type: target.type,
            careName: target.careName ?? "",
            title: target.title,
            date: getMalaysiaTodayIsoDate(),
            // A new event gets its own audience: an older public log is not
            // consent to publishing this one. Notes, provider and documents
            // describe the earlier visit and are never copied.
            audience: "Private",
            fulfillsCareRecordId: target.id,
          });
          setErrors({});
          setFormError("");
          setCompletionTarget({ record: target, petName: status.petName });
          setIsOpen(true);
        }
      } catch (caught) {
        if (attempt !== completionAttemptRef.current) return;
        notice =
          isApiClientError(caught) && [403, 404].includes(caught.status)
            ? { message: "This care item isn't available." }
            : {
                message:
                  "We couldn't open this care item right now. Please try again.",
                retryRecordId: recordId,
              };
      }

      setCompletionNotice(notice);
      setCompletionLoading(false);
    },
    [beginEditor, heldSave, petId, restoreHeldSave]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const autoOpenKey = `${petId}:${url.search}`;
    const wantsCreate = url.searchParams.get("create") === "1";
    const completeRecordId = url.searchParams.get("complete")?.trim() ?? "";

    if (
      (!wantsCreate && !completeRecordId) ||
      autoOpenKeyRef.current === autoOpenKey
    ) {
      return;
    }

    autoOpenKeyRef.current = autoOpenKey;
    queueMicrotask(
      completeRecordId
        ? () => void startCompletion(completeRecordId)
        : openAddForm
    );
    // Consumed once: Back, refresh and a shared address never reopen it.
    url.searchParams.delete("create");
    url.searchParams.delete("complete");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [openAddForm, petId, startCompletion]);

  function openEditForm(record: CareRecord) {
    if (savingRef.current) return;
    completionAttemptRef.current += 1;
    beginEditor();
    saveAttemptRef.current = null;
    setCompletionIssue(null);
    setCompletionTarget(null);
    setCompletionLoading(false);
    setCompletionNotice(null);
    setEditingRecord(record);
    setForm({
      type: record.type,
      careName: record.careName ?? "",
      title: record.title,
      date: parseDisplayDate(record.date),
      provider: record.provider,
      dueDate: record.dueDate ? parseDisplayDate(record.dueDate) : "",
      notes: record.notes,
      audience: toCareRecordAudience(record.publicVisibility),
      fulfillsCareRecordId: record.fulfillsCareRecordId ?? "",
      documents: record.documents ?? [],
    });
    setErrors({});
    setActionError("");
    setFormError("");
    setSuccess("");
    setIsOpen(true);
  }

  function closeEditor() {
    // While files are staging or the request awaits its response, the editor
    // stays: the save owns it until the save settles.
    if (savingRef.current) return;
    // Cancelling Log as done changes nothing and records nothing. A save whose
    // outcome is still unknown is kept, with its draft, to review later on
    // this page. Closing never cancels a request that was already sent.
    holdUnresolvedSave();
    beginEditor();
    setIsOpen(false);
    setEditingRecord(null);
    setCompletionTarget(null);
    setCompletionIssue(null);
    saveAttemptRef.current = null;
  }

  function holdUnresolvedSave() {
    const attempt = saveAttemptRef.current;
    if (attempt && attempt.phase === "unknown" && completionTarget) {
      // A check still in flight is dropped with the editor; the held save is
      // simply not confirmed yet, and reviewing it checks again.
      const issue: CompletionIssue =
        !completionIssue || completionIssue.kind === "checking"
          ? { kind: "unconfirmed" }
          : completionIssue;
      setHeldSave({ target: completionTarget, form, attempt, issue });
    }
  }

  /** Review a held save: reopen its draft and read its status again. */
  async function reviewHeldSave() {
    if (!heldSave || savingRef.current) return;
    const held = heldSave;
    restoreHeldSave(held);
    await checkCompletionOutcome(held.target);
  }

  /** The owner's explicit choice to stop tracking a held save. */
  function discardHeldSave() {
    setHeldSave(null);
  }

  /** Close the editor (keeping an unresolved save) and refresh the list. */
  async function viewCareRecords() {
    closeEditor();
    try {
      setRecords((await getPetRecords(petId)).data);
    } catch {
      // The list keeps what it had; the held save is still reviewable.
    }
  }

  function validate() {
    const nextErrors: FormErrors = {};

    if (!form.type) {
      nextErrors.type = "Choose a record type.";
    }

    if (!form.title.trim()) {
      nextErrors.title = "Add a short title.";
    }

    if (form.careName.trim().length > 120) {
      nextErrors.careName = "Care name must be 120 characters or fewer.";
    }

    if (!form.date) {
      nextErrors.date = "Choose the record date.";
    } else if (!isValidDateInputValue(form.date)) {
      nextErrors.date = `Choose a valid ${dateTerminology.primaryDateLabel.toLowerCase()}.`;
    } else if (isFutureCareRecordDate(form.date, today)) {
      nextErrors.date = dateTerminology.futureDateValidationMessage;
    }

    if (form.dueDate) {
      if (!isValidDateInputValue(form.dueDate)) {
        nextErrors.dueDate = `Choose a valid ${dateTerminology.nextDateLabel.toLowerCase()}.`;
      } else if (form.date && form.dueDate < form.date) {
        nextErrors.dueDate = `${dateTerminology.nextDateLabel} cannot be earlier than the ${dateTerminology.primaryDateLabel.toLowerCase()}.`;
      }
    }

    if (form.fulfillsCareRecordId && !selectedFulfillmentIsEligible) {
      nextErrors.fulfillsCareRecordId =
        "This due item is no longer eligible. Choose another item or None.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || saveLocked) return;
    setSuccess("");
    setActionError("");
    setFormError("");

    if (!validate()) {
      return;
    }

    const payload: RecordPayload = Object.freeze({
      type: form.type || "Other",
      ...(editingRecord || form.careName.trim()
        ? { careName: form.careName.trim() || undefined }
        : {}),
      title: form.title.trim(),
      date: formatDisplayDate(form.date),
      provider: form.provider.trim(),
      dueDate: form.dueDate ? formatDisplayDate(form.dueDate) : undefined,
      notes: form.notes.trim() || "No notes added.",
      publicVisibility: fromCareRecordAudience(form.audience),
      ...(editingRecord || form.fulfillsCareRecordId
        ? { fulfillsCareRecordId: form.fulfillsCareRecordId || undefined }
        : {}),
      ...(editingRecord || form.documents.length
        ? { documents: form.documents }
        : {}),
    });

    // The save owns this editor until it settles: the editor can't be
    // dismissed or replaced meanwhile, and every result below first checks
    // that this editor is still the one on screen.
    const editor = editorGenerationRef.current;
    const ownsEditor = () => editor === editorGenerationRef.current;
    savingRef.current = true;
    setIsSubmitting(true);

    const completing = isCompletingTarget ? completionTarget : null;
    // A Log as done save is registered before its first asynchronous step
    // (staging files), with the immutable draft it submits.
    const attempt: CareSaveAttempt | null = completing
      ? {
          id: ++saveSequenceRef.current,
          editorGeneration: editor,
          targetId: completing.record.id,
          payload,
          phase: "preparing",
          mediaFileIds: [],
          uploadedFiles: false,
        }
      : null;
    saveAttemptRef.current = attempt;
    setCompletionIssue(null);

    try {
      const isCreating = !editingRecord;
      const response = editingRecord
        ? await updateRecord(editingRecord.id, payload, petId)
        : await createRecord(petId, payload, {
            onSending: (request) => {
              // The request is leaving with exactly these stored files.
              if (attempt && saveAttemptRef.current?.id === attempt.id) {
                saveAttemptRef.current = {
                  ...attempt,
                  phase: "sending",
                  mediaFileIds: request.mediaFileIds,
                  uploadedFiles: request.uploadedMediaFileIds.length > 0,
                };
              }
            },
          });

      const savedRecord = response.data;

      if (savedRecord && isCreating) {
        // The service created it, whoever is looking now.
        trackEvent(AnalyticsEvent.CareRecordCreated, {
          source: "owner_portal",
          record_type: toAnalyticsRecordType(savedRecord.type),
        });
      }

      if (!ownsEditor()) return;

      if (savedRecord) {
        setRecords((current) =>
          editingRecord
            ? current.map((record) =>
                record.id === editingRecord.id ? savedRecord : record
              )
            : [savedRecord, ...current]
        );
      }

      saveAttemptRef.current = null;
      beginEditor();
      setForm(emptyForm);
      setErrors({});
      setIsOpen(false);
      setEditingRecord(null);
      setCompletionTarget(null);
      setSuccess(
        completing
          ? `${completionLabel(completing)} is logged as done.`
          : "Record saved. Your care history has been updated."
      );
    } catch (caught) {
      if (!ownsEditor()) return;
      if (attempt) {
        await settleFailedCompletion(caught, attempt.id, completing!);
      } else {
        setFormError(getFriendlyRecordErrorMessage(caught));
      }
    } finally {
      // The save is over, whichever editor is on screen now.
      savingRef.current = false;
      setIsSubmitting(false);
    }
  }

  /**
   * A Log as done save that did not come back cleanly.
   *
   * - Never sent (an upload failed first): nothing was written; the reason is
   *   shown and the owner can save again.
   * - Refused for another reason (validation, permission): nothing was
   *   written by this request; the reason is shown.
   * - Refused because of the due item, or outcome unknown (dropped
   *   connection, timeout, server failure): the item's status is read and
   *   compared with exactly what was sent, attachments included.
   *
   * The draft stays in the form throughout.
   */
  async function settleFailedCompletion(
    caught: unknown,
    attemptId: number,
    completing: CompletionTarget
  ) {
    const attempt = saveAttemptRef.current;
    if (!attempt || attempt.id !== attemptId) return;

    if (attempt.phase === "preparing") {
      saveAttemptRef.current = null;
      setFormError(getFriendlyRecordErrorMessage(caught));
      return;
    }

    const unknown = apiMode && isUncertainRequestOutcome(caught);
    const refusedForTheItem =
      !unknown &&
      isApiClientError(caught) &&
      caught.status === 400 &&
      Boolean(caught.details?.fulfillsCareRecordId?.length);

    if (!unknown && !refusedForTheItem) {
      saveAttemptRef.current = null;
      setFormError(getFriendlyRecordErrorMessage(caught));
      return;
    }

    if (refusedForTheItem) {
      setFormError(getFriendlyRecordErrorMessage(caught));
    }

    saveAttemptRef.current = { ...attempt, phase: unknown ? "unknown" : "refused" };
    await checkCompletionOutcome(completing);
  }

  /** Whether an attempt is still the one this editor is settling. */
  function isCurrentAttempt(attempt: CareSaveAttempt) {
    return (
      saveAttemptRef.current?.id === attempt.id &&
      attempt.editorGeneration === editorGenerationRef.current
    );
  }

  /**
   * Reads the due item's status and says only what it proves for this
   * attempt — never by elapsed time:
   *
   * - an active completing record with these details and exactly these
   *   attachments: confirmed, and only then does the editor close;
   * - one with other details or other attachments: this draft is not that
   *   record, and it is kept;
   * - the item deleted, undated or on an archived pet: the item changed;
   * - nothing completing it yet: for an unknown outcome, still unknown.
   *
   * A result for an attempt or editor that is no longer current is ignored.
   */
  async function checkCompletionOutcome(completing: CompletionTarget) {
    const attempt = saveAttemptRef.current;
    if (!attempt || !isCurrentAttempt(attempt)) return;

    setCompletionIssue({ kind: "checking" });
    let status;
    try {
      status = await getCareCompletionStatus(attempt.targetId);
    } catch {
      if (!isCurrentAttempt(attempt)) return;
      if (attempt.phase === "unknown") {
        setCompletionIssue({ kind: "status-unavailable" });
      } else {
        // Refused: this request wrote nothing, and the service's reason is shown.
        saveAttemptRef.current = null;
        setCompletionIssue(null);
      }
      return;
    }
    if (!isCurrentAttempt(attempt)) return;

    const resolution = assessCompletionRecovery(attempt, status);
    const refused = attempt.phase === "refused";

    switch (resolution.kind) {
      case "confirmed": {
        const confirmed = resolution.completion;
        setRecords((current) => [
          confirmed,
          ...current.filter((record) => record.id !== confirmed.id),
        ]);
        saveAttemptRef.current = null;
        beginEditor();
        setCompletionIssue(null);
        setFormError("");
        setForm(emptyForm);
        setErrors({});
        setIsOpen(false);
        setCompletionTarget(null);
        setSuccess(
          resolution.proof === "attachments"
            ? `${completionLabel(completing)} is logged as done with your details and attachments.`
            : "Care is already logged with these details."
        );
        return;
      }
      case "different-attachments":
      case "conflict":
        setFormError("");
        setCompletionIssue({
          kind: "logged-differently",
          completion: resolution.completion,
          attachmentsOnly: resolution.kind === "different-attachments",
          refused,
        });
        return;
      case "target-changed":
        setFormError("");
        setCompletionIssue({ kind: "target-changed", state: resolution.state, refused });
        return;
      case "not-found":
        if (refused) {
          // Refused for a reason the status does not explain (the item is
          // still waiting): the service's reason stands, and the owner can
          // correct the details. The link to the item is kept, so a second
          // linked save can't complete it twice.
          saveAttemptRef.current = null;
          setCompletionIssue(null);
          return;
        }
        setFormError("");
        setCompletionIssue({ kind: "unconfirmed" });
        return;
    }
  }

  async function openDocument(document: CareDocument) {
    setActionError("");
    try {
      await openPrivateMediaFile(document.id);
    } catch (caught) {
      setActionError(getFriendlyRecordErrorMessage(caught));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await deleteRecord(deleteTarget.id);

      if (response.data.deleted) {
        setRecords((current) =>
          current.filter((item) => item.id !== deleteTarget.id)
        );
        setActionError("");
        setSuccess("Record deleted.");
      }
    } catch (caught) {
      setSuccess("");
      setActionError(getFriendlyRecordErrorMessage(caught));
    } finally {
      setDeleteTarget(null);
    }
  }

  useOwnerHeaderPageContext({
    section: "records",
    petId,
    status: loading ? "loading" : loadError ? "error" : "ready",
    onCreate: openAddForm,
  });

  return (
    <>
      <div className="brand-card mb-6 rounded-[1.75rem] p-5">
        <div>
          <h2 className="text-xl font-black text-pet-ink">Care records</h2>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            Add vaccines, deworming, grooming, vet visits, medication, surgery,
            and lab tests as your pet&apos;s care changes.
          </p>
        </div>
      </div>

      {success ? (
        <div className="mb-6 rounded-[1.25rem] border border-pet-mint bg-[#e8f8f0] p-4 text-sm font-bold text-pet-sage">
          {success}
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-6 rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]">
          {actionError}
        </div>
      ) : null}

      {completionLoading ? (
        <div
          className="mb-6 rounded-[1.25rem] border border-pet-border bg-white p-4 text-sm font-bold text-pet-muted"
          data-care-completion-loading
          role="status"
        >
          Getting this care item ready…
        </div>
      ) : null}

      {heldSave && !isOpen ? (
        <div
          className="mb-6 flex flex-col gap-3 rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff6f3] p-4 sm:flex-row sm:items-center sm:justify-between"
          data-care-held-save
          role="status"
        >
          <p className="text-sm font-bold text-[#8f3025]">
            Your log for {completionLabel(heldSave.target)} isn&apos;t confirmed
            yet. Your details are kept on this page until you leave or reload
            it. Leaving doesn&apos;t cancel a save that was already sent.
          </p>
          <div className="flex flex-wrap gap-2">
            <CTAButton onClick={() => void reviewHeldSave()} variant="secondary">
              Review my save
            </CTAButton>
            <CTAButton onClick={discardHeldSave} variant="secondary">
              Discard my details
            </CTAButton>
          </div>
        </div>
      ) : null}

      {completionNotice ? (
        <div
          className="mb-6 flex flex-col gap-3 rounded-[1.25rem] border border-pet-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          data-care-completion-notice
          role="status"
        >
          <p className="text-sm font-bold text-pet-ink">
            {completionNotice.message}
          </p>
          {completionNotice.retryRecordId ? (
            <CTAButton
              className="self-start sm:self-auto"
              onClick={() =>
                void startCompletion(completionNotice.retryRecordId!)
              }
              variant="secondary"
            >
              Try again
            </CTAButton>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="brand-card rounded-[1.75rem] p-6">
          <p className="text-sm font-semibold text-pet-muted">
            Loading care records...
          </p>
        </div>
      ) : loadError ? (
        <section className="brand-card rounded-[1.75rem] p-6">
          <p className="text-sm font-bold uppercase text-pet-teal">
            Could not load records
          </p>
          <h2 className="mt-2 text-2xl font-black text-pet-ink">
            Your pet&apos;s care records are temporarily unavailable.
          </h2>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-pet-muted">
            {loadError}
          </p>
          <CTAButton
            className="mt-5"
            onClick={() => window.location.reload()}
            variant="secondary"
          >
            Try Again
          </CTAButton>
        </section>
      ) : records.length === 0 ? (
        <EmptyState
          icon="record"
          title="No care records yet"
          description="Add your pet's first record so important health details are easy to find later."
          actionLabel="Add first care record"
          actionOnClick={openAddForm}
        />
      ) : (
        <div className="grid gap-6">
          {groupedRecords.map(({ type, records: group }) => (
            <section key={type}>
              <div className="mb-3 flex items-baseline gap-1.5">
                <h2 className="text-xl font-black text-pet-ink">{type}</h2>
                <span
                  aria-label={`${group.length} ${group.length === 1 ? "record" : "records"}`}
                  className="text-sm font-bold text-pet-muted"
                >
                  <span aria-hidden="true">· {group.length}</span>
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {group.map((record) => (
                  <RecordCard
                    key={record.id}
                    effectiveStatus={
                      fulfilledRecordIds.has(record.id)
                        ? "fulfilled"
                        : record.status
                    }
                    onDelete={() => setDeleteTarget(record)}
                    onEdit={() => openEditForm(record)}
                    onOpenDocument={apiMode ? openDocument : undefined}
                    record={record}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <FormDialog
        cancelAction={{ label: "Cancel", disabled: isSubmitting }}
        closeLabel="Close care record editor"
        closeOnBackdrop={false}
        description={
          isCompletingTarget && completionTarget
            ? `${completionLabel(completionTarget)} was due ${completionTarget.record.dueDate}. Check the details, then save to log it as done.`
            : "Keep the details short and useful so they are easy to find later."
        }
        eyebrow={
          editingRecord
            ? "Edit Record"
            : isCompletingTarget
              ? "Log as done"
              : "Add Record"
        }
        maxWidthClassName="sm:max-w-2xl"
        dismissible={!isSubmitting}
        onRequestClose={closeEditor}
        open={isOpen}
        primaryAction={{
          disabled: isSubmitting || saveLocked,
          form: formId,
          label: editingRecord
            ? "Save Changes"
            : isCompletingTarget
              ? "Save care record"
              : "Save Record",
          pending: isSubmitting,
          pendingLabel: "Saving...",
          type: "submit",
        }}
        title={
          editingRecord
            ? "Update care record"
            : isCompletingTarget
              ? "Log completed care"
              : "Save a care record"
        }
      >
        <form className="grid gap-4" id={formId} onSubmit={handleSubmit}>
              {completionIssue && completionTarget ? (
                <CompletionIssuePanel
                  issue={completionIssue}
                  label={completionLabel(completionTarget)}
                  onCheckAgain={() => void checkCompletionOutcome(completionTarget)}
                  onViewRecords={() => void viewCareRecords()}
                />
              ) : null}

              {formError ? (
                <div
                  className="rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]"
                  role="alert"
                >
                  {formError}
                </div>
              ) : null}

              {/* The draft is read-only while a save is running or its outcome
                  is open, so what is checked is always what was sent. */}
              <fieldset
                className="m-0 grid min-w-0 gap-4 border-0 p-0"
                data-care-draft
                disabled={saveLocked || isSubmitting}
              >

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Record Type" error={errors.type}>
                  <select
                    className="brand-input brand-select"
                    onChange={(event) =>
                      updateRecordType(event.target.value as FormState["type"])
                    }
                    value={form.type}
                  >
                    <option value="">Select type</option>
                    {selectableRecordTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </Field>

                {identityTerminology ? (
                  <Field
                    label={identityTerminology.label}
                    helper={identityTerminology.helper}
                    error={errors.careName}
                  >
                    <input
                      className="brand-input"
                      maxLength={120}
                      onChange={(event) =>
                        updateField("careName", event.target.value)
                      }
                      placeholder={identityTerminology.placeholder}
                      type="text"
                      value={form.careName}
                    />
                  </Field>
                ) : null}

                <Field label="Title" error={errors.title}>
                  <input
                    className="brand-input"
                    onChange={(event) => updateField("title", event.target.value)}
                    placeholder={editorExamples.title}
                    type="text"
                    value={form.title}
                  />
                </Field>

                <Field
                  label={dateTerminology.primaryDateLabel}
                  helper={dateTerminology.primaryDateHelper}
                  error={errors.date}
                >
                  <DateInput
                    max={today}
                    onChange={(event) => updateField("date", event.target.value)}
                    value={form.date}
                  />
                </Field>

                <Field label="Provider / Clinic" error={errors.provider}>
                  <input
                    className="brand-input"
                    onChange={(event) =>
                      updateField("provider", event.target.value)
                    }
                    placeholder="Happy Paws Vet"
                    type="text"
                    value={form.provider}
                  />
                </Field>

                <Field
                  label={`${dateTerminology.nextDateLabel} (Optional)`}
                  helper={dateTerminology.nextDateHelper}
                  error={errors.dueDate}
                >
                  <DateInput
                    onChange={(event) =>
                      updateField("dueDate", event.target.value)
                    }
                    value={form.dueDate}
                  />
                </Field>

                <Field label="Who can see this record?" error={errors.audience}>
                  <select
                    className="brand-input brand-select"
                    onChange={(event) =>
                      updateField(
                        "audience",
                        event.target.value as CareRecordAudience
                      )
                    }
                    value={form.audience}
                  >
                    <option value="Private">Only me</option>
                    <option value="Public">Anyone with the link</option>
                  </select>
                </Field>
              </div>

              {showFulfillmentPicker ? (
                <fieldset
                  aria-describedby={
                    form.fulfillsCareRecordId && !selectedFulfillmentIsEligible
                      ? "care-fulfillment-helper care-fulfillment-error"
                      : "care-fulfillment-helper"
                  }
                  className="grid gap-3 rounded-[1.25rem] border border-pet-border bg-pet-cream p-4"
                >
                  <legend className="px-1 text-sm font-black text-pet-ink">
                    Completes a previous due item? (Optional)
                  </legend>
                  <p
                    className="text-xs font-medium leading-5 text-pet-muted"
                    id="care-fulfillment-helper"
                  >
                    Choose only when this record completed one specific earlier
                    scheduled item.
                  </p>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-pet-ink outline-none ring-pet-teal focus-within:ring-2">
                    <input
                      checked={!form.fulfillsCareRecordId}
                      className="h-4 w-4 accent-pet-teal"
                      name="care-fulfillment"
                      onChange={() => updateField("fulfillsCareRecordId", "")}
                      type="radio"
                      value=""
                    />
                    None
                  </label>
                  {visibleFulfillmentCandidates.map((candidate) => (
                    <label
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-2 outline-none ring-pet-teal focus-within:ring-2"
                      key={candidate.id}
                    >
                      <input
                        checked={form.fulfillsCareRecordId === candidate.id}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-pet-teal"
                        name="care-fulfillment"
                        onChange={() =>
                          updateField("fulfillsCareRecordId", candidate.id)
                        }
                        type="radio"
                        value={candidate.id}
                      />
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-black text-pet-ink">
                          {candidate.careName || candidate.title}
                        </span>
                        <span className="block text-xs font-semibold text-pet-muted">
                          {getFulfillmentDueLabel(candidate.type)} {candidate.dueDate}
                        </span>
                      </span>
                    </label>
                  ))}
                  {form.fulfillsCareRecordId && !selectedFulfillmentTarget ? (
                    <label className="flex min-h-11 items-start gap-3 rounded-xl bg-white px-3 py-2 opacity-75">
                      <input
                        checked
                        className="mt-0.5 h-4 w-4 shrink-0 accent-pet-teal"
                        disabled
                        name="care-fulfillment"
                        readOnly
                        type="radio"
                      />
                      <span className="text-sm font-bold text-pet-muted">
                        Previously selected due item (unavailable)
                      </span>
                    </label>
                  ) : null}
                  {form.fulfillsCareRecordId && !selectedFulfillmentTarget ? (
                    <p className="text-xs font-bold text-[#a63c2e]">
                      The previously selected due item is no longer available.
                      Choose None before saving.
                    </p>
                  ) : null}
                  {form.fulfillsCareRecordId && !selectedFulfillmentIsEligible ? (
                    <p
                      className="text-xs font-bold text-[#a63c2e]"
                      id="care-fulfillment-error"
                    >
                      {errors.fulfillsCareRecordId ??
                        "This due item is no longer eligible. Choose another item or None."}
                    </p>
                  ) : null}
                </fieldset>
              ) : null}

              <CareDocumentsField
                documents={form.documents}
                onChange={(documents) => updateField("documents", documents)}
                recordType={form.type}
              />

              <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
                Public records show only their type and date.
              </p>

              <Field label="Notes" error={errors.notes}>
                <textarea
                  className="brand-input min-h-28"
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder={editorExamples.notes}
                  value={form.notes}
                />
              </Field>
              </fieldset>
        </form>
      </FormDialog>

      <ConfirmDialog
        confirmLabel="Delete record"
        destructive
        message={
          deleteTarget
            ? `Delete "${deleteTarget.title}" from this pet's care records? This action cannot be undone.`
            : ""
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteTarget)}
        title="Delete care record?"
      />
    </>
  );
}

function Field({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const helperId = helper ? `${generatedId}-helper` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement<FieldControlProps>(children)
    ? cloneElement(children, {
        id: children.props.id ?? generatedId,
        "aria-describedby": [children.props["aria-describedby"], describedBy]
          .filter(Boolean)
          .join(" ") || undefined,
      })
    : children;

  return (
    <div className="grid gap-2">
      <label className="text-sm font-bold text-pet-ink" htmlFor={generatedId}>
        {label}
      </label>
      {helper ? (
        <span
          className="text-xs font-medium leading-5 text-pet-muted"
          id={helperId}
        >
          {helper}
        </span>
      ) : null}
      {control}
      {error ? (
        <span className="text-xs font-bold text-[#a63c2e]" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
};

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function parseDisplayDate(value: string) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/);

  if (!match) {
    return "";
  }

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(`${month.slice(0, 1).toUpperCase()}${month.slice(1, 3).toLowerCase()}`);

  if (monthIndex < 0) {
    return "";
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function completionLabel({ record, petName }: CompletionTarget) {
  const name = record.careName || record.title;
  return petName ? `${name} for ${petName}` : name;
}

function targetStateMessage(
  state: Exclude<CareCompletionState, "pending" | "completed">
) {
  switch (state) {
    case "archived":
      return "This care item was deleted, so there is nothing to log.";
    case "no-due-date":
      return "This care item no longer has a due date, so there is nothing to log as done.";
    default:
      return "This pet's profile is archived, so care can't be logged for it right now.";
  }
}

/**
 * The one explanation shown after a Log as done save that did not come back
 * cleanly, with only the actions that are safe for what is known: check again
 * or look at the care records. It never offers another write — a refusal of
 * this request doesn't show that an earlier request for the item has stopped.
 */
function CompletionIssuePanel({
  issue,
  label,
  onCheckAgain,
  onViewRecords,
}: {
  issue: CompletionIssue;
  label: string;
  onCheckAgain: () => void;
  onViewRecords: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The panel sits above a long form: bring each new explanation into view so
  // a locked Save is never left without its reason on screen.
  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [issue.kind]);
  const kept = "Your details are kept on this page.";
  const earlier = "An earlier save for this item may still appear in your care records.";
  let tone: "neutral" | "warning" = "neutral";
  let message: string;
  let checkAgain = false;
  let viewRecords = false;

  switch (issue.kind) {
    case "checking":
      message = "Checking whether your care record was saved…";
      break;
    case "unconfirmed":
      message = `We can't confirm this save yet — it may still be finishing. ${kept} Check again in a moment, or view your care records.`;
      checkAgain = true;
      viewRecords = true;
      break;
    case "status-unavailable":
      message = `We couldn't check whether this was saved. ${kept} Check again in a moment, or view your care records.`;
      checkAgain = true;
      viewRecords = true;
      break;
    case "logged-differently": {
      tone = "warning";
      const what = issue.attachmentsOnly
        ? "with the same details but different attachments"
        : "with different details";
      message = issue.refused
        ? `${label} was already logged as done on ${issue.completion.date} ${what}, so this save wasn't recorded. ${kept}`
        : `${label} is logged as done on ${issue.completion.date} ${what}. We can't tell yet whether your save went through. ${kept}`;
      checkAgain = !issue.refused;
      viewRecords = true;
      break;
    }
    case "target-changed": {
      tone = "warning";
      const changed =
        issue.state === "archived"
          ? "This care item was deleted"
          : issue.state === "no-due-date"
            ? "This care item's due date was removed"
            : "This pet's profile was archived";
      message = issue.refused
        ? `${changed}, so this save wasn't recorded. ${earlier} ${kept}`
        : `${changed} while you were saving. We can't tell yet whether your details were saved. ${kept}`;
      checkAgain = !issue.refused;
      viewRecords = true;
      break;
    }
  }

  return (
    <div
      aria-live="polite"
      className={[
        "grid gap-3 rounded-[1.25rem] border p-4",
        tone === "warning"
          ? "border-[#f3b4a8] bg-[#fff1ee]"
          : "border-pet-border bg-pet-cream",
      ].join(" ")}
      data-care-completion-issue={issue.kind}
      ref={panelRef}
      role="status"
    >
      <p
        className={[
          "text-sm font-bold leading-6",
          tone === "warning" ? "text-[#8f3025]" : "text-pet-ink",
        ].join(" ")}
      >
        {message}
      </p>
      {checkAgain || viewRecords ? (
        <div className="flex flex-wrap gap-2">
          {checkAgain ? (
            <CTAButton onClick={onCheckAgain} variant="secondary">
              Check again
            </CTAButton>
          ) : null}
          {viewRecords ? (
            <CTAButton onClick={onViewRecords} variant="secondary">
              View care records
            </CTAButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getFulfillmentDueLabel(type: RecordType) {
  if (type === "Medication") {
    return "Review due";
  }

  if (type === "Lab Test") {
    return "Follow-up due";
  }

  return "Due";
}
