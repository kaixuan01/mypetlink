import { Badge } from "@/components/ui/Badge";
import type { CareRecord } from "@/types";

type RecordCardProps = {
  record: CareRecord;
};

export function RecordCard({ record }: RecordCardProps) {
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
      <p className="mt-4 text-sm leading-6 text-pet-muted">{record.notes}</p>
    </article>
  );
}
