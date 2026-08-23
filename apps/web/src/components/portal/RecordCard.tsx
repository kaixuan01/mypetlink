import { Badge } from "@/components/ui/Badge";
import { getCareRecordDateTerminology } from "@/lib/careRecordTerminology";
import { getCareRecordStatusLabel } from "@/lib/careRecordStatus";
import { toCareRecordAudience } from "@/lib/careRecordVisibility";
import type { CareRecord } from "@/types";

type RecordCardProps = {
  record: CareRecord;
  onDelete?: () => void;
  onEdit?: () => void;
};

const visibilityTone = {
  Private: "soft",
  Public: "mint",
} as const;

export function RecordCard({ record, onDelete, onEdit }: RecordCardProps) {
  const dateTerminology = getCareRecordDateTerminology(record.type);
  const audience = toCareRecordAudience(record.publicVisibility);

  return (
    <article className="brand-card rounded-[1.5rem] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone={record.status === "due-soon" ? "warm" : "soft"}>
            {record.type}
          </Badge>
          <h3 className="mt-3 text-lg font-black text-pet-ink">
            {record.title}
          </h3>
          <p className="mt-1 text-sm text-pet-muted">
            <span className="font-bold">{dateTerminology.primaryDateLabel}:</span>{" "}
            {record.date} - {record.provider}
          </p>
        </div>
        {record.dueDate ? (
          <Badge tone="teal">
            {dateTerminology.nextDateLabel}: {record.dueDate}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {record.dueDate ? (
          <Badge tone={record.status === "overdue" ? "danger" : "warm"}>
            {getCareRecordStatusLabel(record)}
          </Badge>
        ) : null}
        <Badge tone={visibilityTone[audience]}>
          {audience === "Private" ? "Only me" : "Shared"}
        </Badge>
      </div>
      <p className="mt-4 text-sm leading-6 text-pet-muted">{record.notes}</p>
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
