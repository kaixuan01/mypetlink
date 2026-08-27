"use client";

import { useId, useRef, useState } from "react";
import { validateCareDocumentFile } from "@/services/mediaService";
import type {
  CareDocument,
  CareDocumentCategory,
  RecordType,
} from "@/types";

type CareDocumentsFieldProps = {
  documents: CareDocument[];
  recordType: RecordType | "";
  onChange: (documents: CareDocument[]) => void;
};

export function CareDocumentsField({
  documents,
  recordType,
  onChange,
}: CareDocumentsFieldProps) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    const added: CareDocument[] = [];
    const rejected: string[] = [];

    for (const [index, file] of Array.from(fileList).entries()) {
      try {
        validateCareDocumentFile(file);
        added.push({
          id: `draft-care-document-${Date.now()}-${index}`,
          fileName: file.name,
          contentType: file.type || contentTypeFromFileName(file.name),
          fileSizeBytes: file.size,
          category: categoryForType(recordType),
          sortOrder: documents.length + added.length,
          sourceFile: file,
        });
      } catch (caught) {
        rejected.push(
          `${file.name}: ${caught instanceof Error ? caught.message : "This file could not be added."}`
        );
      }
    }

    if (added.length) {
      onChange([...documents, ...added]);
    }
    setError(rejected.join(" "));

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function removeDocument(id: string) {
    onChange(
      documents
        .filter((document) => document.id !== id)
        .map((document, index) => ({ ...document, sortOrder: index }))
    );
    setError("");
  }

  return (
    <fieldset
      aria-describedby={error ? `${helperId} ${errorId}` : helperId}
      className="grid min-w-0 gap-3 rounded-[1.25rem] border border-pet-border bg-pet-cream p-4"
    >
      <legend className="px-1 text-sm font-black text-pet-ink">Documents</legend>
      <p className="text-xs font-medium leading-5 text-pet-muted" id={helperId}>
        {recordType === "Vaccine"
          ? "Add a vaccination certificate or card."
          : "Add a supporting medical document."}{" "}
        PDF, JPG, or PNG up to 10 MB each.
      </p>

      {documents.length ? (
        <div className="grid min-w-0 gap-2">
          {documents.map((document) => (
            <div
              className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              key={document.id}
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-black text-pet-ink">
                  {document.fileName}
                </p>
                <p className="mt-1 text-xs font-semibold text-pet-muted">
                  {documentLabel(document.contentType)} ·{" "}
                  {formatFileSize(document.fileSizeBytes)}
                </p>
              </div>
              <button
                aria-label={`Remove ${document.fileName}`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-pet-coral bg-white px-4 py-2 text-sm font-bold text-pet-coral transition hover:bg-pet-apricot"
                onClick={() => removeDocument(document.id)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <label
        className="inline-flex min-h-11 w-fit cursor-pointer items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-apricot"
        htmlFor={inputId}
      >
        + Add document
      </label>
      <input
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        aria-describedby={error ? `${helperId} ${errorId}` : helperId}
        className="sr-only"
        id={inputId}
        multiple
        onChange={(event) => handleFiles(event.target.files)}
        ref={inputRef}
        type="file"
      />
      {error ? (
        <p className="text-xs font-bold leading-5 text-[#a63c2e]" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function categoryForType(
  type: RecordType | ""
): CareDocumentCategory {
  return type === "Vaccine" ? "VaccinationDocument" : "MedicalDocument";
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Size unavailable";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function documentLabel(contentType: string) {
  return contentType === "application/pdf" ? "PDF" : "Image";
}

function contentTypeFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  return "image/jpeg";
}
