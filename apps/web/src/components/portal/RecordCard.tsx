import { Badge } from "@/components/ui/Badge";
import { getCareRecordHistoryTerminology } from "@/lib/careRecordTerminology";
import {
  getEffectiveCareRecordStatusLabel,
  type CareRecordEffectiveStatus,
} from "@/lib/careRecordStatus";
import { toCareRecordAudience } from "@/lib/careRecordVisibility";
import type { CareDocument, CareRecord } from "@/types";

type RecordCardProps = {
  record: CareRecord;
  effectiveStatus?: CareRecordEffectiveStatus;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpenDocument?: (document: CareDocument) => void;
};

const visibilityTone = {
  Private: "soft",
  Public: "mint",
} as const;

export function RecordCard({
  record,
  effectiveStatus = record.status,
  onDelete,
  onEdit,
  onOpenDocument,
}: RecordCardProps) {
  const dateTerminology = getCareRecordHistoryTerminology(record.type);
  const audience = toCareRecordAudience(record.publicVisibility);

  return (
    <article className="brand-card rounded-[1.5rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Badge tone={record.status === "due-soon" ? "warm" : "soft"}>
            {record.type}
          </Badge>
          {record.careName ? (
            <p className="mt-2 break-words text-sm font-black text-pet-teal">
              {record.careName}
            </p>
          ) : null}
          <h3
            className={`${record.careName ? "mt-1" : "mt-3"} break-words text-lg font-black text-pet-ink`}
          >
            {record.title}
          </h3>
          <p className="mt-1 text-sm text-pet-muted">
            <span className="font-bold">{dateTerminology.primaryDateLabel}:</span>{" "}
            {record.date} - {record.provider}
          </p>
        </div>
        {record.dueDate ? (
          <Badge className="max-w-full whitespace-normal text-right" tone="teal">
            {dateTerminology.nextDateLabel}: {record.dueDate}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {record.dueDate ? (
          <Badge
            tone={
              effectiveStatus === "fulfilled"
                ? "mint"
                : record.status === "overdue"
                  ? "danger"
                  : "warm"
            }
          >
            {getEffectiveCareRecordStatusLabel(record, effectiveStatus)}
          </Badge>
        ) : null}
        <Badge tone={visibilityTone[audience]}>
          {audience === "Private" ? "Only me" : "Shared"}
        </Badge>
      </div>
      <p className="mt-4 text-sm leading-6 text-pet-muted">{record.notes}</p>
      {record.documents?.length ? (
        <details className="mt-4 rounded-2xl border border-pet-border bg-pet-cream px-4 py-3">
          <summary className="cursor-pointer text-sm font-black text-pet-ink">
            Documents · {record.documents.length}
          </summary>
          <div className="mt-3 grid min-w-0 gap-2">
            {record.documents.map((document) => (
              <div
                className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                key={document.id}
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-pet-ink">
                    {document.fileName}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-pet-muted">
                    {document.contentType === "application/pdf" ? "PDF" : "Image"}
                    {" · "}
                    {formatFileSize(document.fileSizeBytes)}
                  </p>
                </div>
                {onOpenDocument ? (
                  <button
                    aria-label={`Open ${document.fileName}`}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-apricot"
                    onClick={() => onOpenDocument(document)}
                    type="button"
                  >
                    Open
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {onEdit || onDelete ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {onEdit ? (
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              onClick={onEdit}
              type="button"
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-pet-coral bg-white px-4 py-2 text-sm font-bold text-pet-coral transition hover:bg-pet-apricot"
              onClick={onDelete}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
