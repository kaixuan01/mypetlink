import { Badge } from "@/components/ui/Badge";
import type { CareRecord } from "@/types";

type RecordCardProps = {
  record: CareRecord;
  onDelete?: () => void;
  onEdit?: () => void;
};

const visibilityTone = {
  Private: "soft",
  "Public badge only": "mint",
  "Public details": "teal",
} as const;

export function RecordCard({ record, onDelete, onEdit }: RecordCardProps) {
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
            {record.date} - {record.provider}
          </p>
        </div>
        {record.dueDate ? (
          <Badge tone="teal">Due {record.dueDate}</Badge>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={visibilityTone[record.publicVisibility]}>
          {record.publicVisibility}
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
