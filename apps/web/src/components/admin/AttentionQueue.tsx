import Link from "next/link";
import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";

type AttentionQueueItemBase = {
  id: string;
  label: string;
  count: number;
  detail: string;
};

export type AttentionQueueItem = AttentionQueueItemBase & (
  | { href: string; onSelect?: never }
  | { href?: never; onSelect: () => void }
);

export function AttentionQueue({
  items,
  emptyDescription = "Merchant sales work is clear based on the current summary.",
}: {
  items: AttentionQueueItem[];
  emptyDescription?: string;
}) {
  const actionable = items.filter((item) => item.count > 0);

  if (actionable.length === 0) {
    return (
      <AdminEmptyPanel
        compact
        description={emptyDescription}
        icon="shield"
        title="Nothing needs attention right now."
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {actionable.map((item) => {
        const content = (
          <>
            <AdminStatusBadge className="min-w-10 justify-center tabular-nums !px-3 !py-1.5 !text-sm !font-black" tone="warning">
              {item.count}
            </AdminStatusBadge>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-slate-900">{item.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
            </span>
            <span aria-hidden="true" className="text-slate-400">→</span>
          </>
        );
        const className = "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5 sm:py-3";

        return item.href ? (
          <Link className={className} data-testid={`attention-item-${item.id}`} href={item.href} key={item.id}>
            {content}
          </Link>
        ) : (
          <button className={className} data-testid={`attention-item-${item.id}`} key={item.id} onClick={item.onSelect} type="button">
            {content}
          </button>
        );
      })}
    </div>
  );
}
