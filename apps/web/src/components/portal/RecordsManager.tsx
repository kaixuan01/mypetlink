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
import { RecordCard } from "@/components/portal/RecordCard";
import { useOwnerHeaderPageContext } from "@/components/portal/OwnerHeaderActions";
import { CTAButton } from "@/components/ui/CTAButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  careRecordTypes,
  newCareRecordTypes,
  getCareRecordDateTerminology,
  getLocalTodayDateInputValue,
  isFutureCareRecordDate,
  isValidDateInputValue,
} from "@/lib/careRecordTerminology";
import {
  createRecord,
  deleteRecord,
  getFriendlyRecordErrorMessage,
  getPetRecords,
  updateRecord,
} from "@/services/recordService";
import { isApiConfigured } from "@/services/apiConfig";
import type { CareRecord, RecordType } from "@/types";

type FormState = {
  type: "" | RecordType;
  title: string;
  date: string;
  provider: string;
  dueDate: string;
  notes: string;
  publicVisibility: CareRecord["publicVisibility"];
};

type FormErrors = Partial<Record<keyof FormState, string>>;

type RecordsManagerProps = {
  petId: string;
  initialRecords: CareRecord[];
};

const emptyForm: FormState = {
  type: "",
  title: "",
  date: "",
  provider: "",
  dueDate: "",
  notes: "",
  publicVisibility: "Public badge only",
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
  const selectableRecordTypes =
    editingRecord?.type === "Allergy" ? careRecordTypes : newCareRecordTypes;
  const [errors, setErrors] = useState<FormErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<CareRecord | null>(null);
  const autoOpenKeyRef = useRef("");

  const groupedRecords = useMemo(
    () =>
      careRecordTypes
        .map((type) => ({
          type,
          records: records.filter((record) => record.type === type),
        }))
        // Allergy is read-compatible for historical records, but it is not a
        // current dated care category and should not appear as an empty group.
        .filter((group) => group.type !== "Allergy" || group.records.length > 0),
    [records]
  );
  const dateTerminology = getCareRecordDateTerminology(form.type);
  const today = getLocalTodayDateInputValue();

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

  const openAddForm = useCallback(() => {
    setEditingRecord(null);
    setForm(emptyForm);
    setErrors({});
    setActionError("");
    setFormError("");
    setSuccess("");
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const autoOpenKey = `${petId}:${url.search}`;

    if (
      url.searchParams.get("create") !== "1" ||
      autoOpenKeyRef.current === autoOpenKey
    ) {
      return;
    }

    autoOpenKeyRef.current = autoOpenKey;
    queueMicrotask(openAddForm);
    url.searchParams.delete("create");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [openAddForm, petId]);

  function openEditForm(record: CareRecord) {
    setEditingRecord(record);
    setForm({
      type: record.type,
      title: record.title,
      date: parseDisplayDate(record.date),
      provider: record.provider,
      dueDate: record.dueDate ? parseDisplayDate(record.dueDate) : "",
      notes: record.notes,
      publicVisibility: record.publicVisibility,
    });
    setErrors({});
    setActionError("");
    setFormError("");
    setSuccess("");
    setIsOpen(true);
  }

  function validate() {
    const nextErrors: FormErrors = {};

    if (!form.type) {
      nextErrors.type = "Choose a record type.";
    }

    if (!form.title.trim()) {
      nextErrors.title = "Add a short title.";
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

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess("");
    setActionError("");
    setFormError("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    const payload = {
      type: form.type || "Other",
      title: form.title.trim(),
      date: formatDisplayDate(form.date),
      provider: form.provider.trim() || "Owner recorded",
      dueDate: form.dueDate ? formatDisplayDate(form.dueDate) : undefined,
      notes: form.notes.trim() || "No notes added.",
      publicVisibility: form.publicVisibility,
    };

    try {
      const response = editingRecord
        ? await updateRecord(editingRecord.id, payload)
        : await createRecord(petId, payload);

      const savedRecord = response.data;

      if (savedRecord) {
        setRecords((current) =>
          editingRecord
            ? current.map((record) =>
                record.id === editingRecord.id ? savedRecord : record
              )
            : [savedRecord, ...current]
        );
      }

      setForm(emptyForm);
      setErrors({});
      setIsOpen(false);
      setEditingRecord(null);
      setSuccess("Record saved. Your care history has been updated.");
    } catch (caught) {
      setFormError(getFriendlyRecordErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
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
              <h2 className="mb-3 text-xl font-black text-pet-ink">{type}</h2>
              {group.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {group.map((record) => (
                    <RecordCard
                      key={record.id}
                      onDelete={() => setDeleteTarget(record)}
                      onEdit={() => openEditForm(record)}
                      record={record}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-pet-border bg-pet-cream p-5 text-sm text-pet-muted">
                  No records in this category yet.
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-pet-coral">
                  {editingRecord ? "Edit Record" : "Add Record"}
                </p>
                <h2 className="mt-2 text-2xl font-black text-pet-ink">
                  {editingRecord ? "Update care record" : "Save a care record"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-pet-muted">
                  Keep the details short and useful so they are easy to find
                  later.
                </p>
              </div>
              <button
                aria-label="Cancel"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pet-cream text-pet-muted transition hover:text-pet-ink"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <Icon name="plus" className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              {formError ? (
                <div className="rounded-[1.25rem] border border-[#f3b4a8] bg-[#fff1ee] p-4 text-sm font-bold text-[#a63c2e]">
                  {formError}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Record Type" error={errors.type}>
                  <select
                    className="brand-input brand-select"
                    onChange={(event) =>
                      updateField("type", event.target.value as FormState["type"])
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

                <Field label="Title" error={errors.title}>
                  <input
                    className="brand-input"
                    onChange={(event) => updateField("title", event.target.value)}
                    placeholder="Annual vaccination"
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

                <Field label="Public visibility" error={errors.publicVisibility}>
                  <select
                    className="brand-input brand-select"
                    onChange={(event) =>
                      updateField(
                        "publicVisibility",
                        event.target.value as CareRecord["publicVisibility"]
                      )
                    }
                    value={form.publicVisibility}
                  >
                    <option value="Private">Private</option>
                    <option value="Public badge only">Public badge only</option>
                    <option value="Public details">Public details</option>
                  </select>
                </Field>
              </div>

              <p className="rounded-[1.25rem] bg-pet-cream p-4 text-sm leading-6 text-pet-muted">
                Public badge only shows the record type and date. Public details
                can show the title and notes when public care details are
                allowed for this pet.
              </p>

              <Field label="Notes" error={errors.notes}>
                <textarea
                  className="brand-input min-h-28"
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Core vaccine completed. Booster due next year."
                  value={form.notes}
                />
              </Field>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
                  onClick={() => {
                    setIsOpen(false);
                    setEditingRecord(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] disabled:cursor-wait disabled:opacity-70"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingRecord
                      ? "Save Changes"
                      : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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

  const match = value.match(/^(\d{2}) ([A-Za-z]{3}) (\d{4})$/);

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
  ].indexOf(month);

  if (monthIndex < 0) {
    return "";
  }

  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
}
