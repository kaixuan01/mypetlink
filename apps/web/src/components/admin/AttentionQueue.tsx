import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";

export type AttentionQueueItem = {
  id: string;
  label: string;
  count: number;
  detail: string;
  onSelect: () => void;
};

export function AttentionQueue({ items }: { items: AttentionQueueItem[] }) {
  const actionable = items.filter((item) => item.count > 0);

  if (actionable.length === 0) {
    return (
      <AdminEmptyPanel
        compact
        description="Merchant sales work is clear based on the current summary."
        icon="shield"
        title="Nothing needs attention right now."
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {actionable.map((item) => (
        <button
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1570ef] sm:px-5 sm:py-3"
          data-testid={`attention-item-${item.id}`}
          key={item.id}
          onClick={item.onSelect}
          type="button"
        >
          <AdminStatusBadge className="min-w-10 justify-center tabular-nums !px-3 !py-1.5 !text-sm !font-black" tone="warning">
            {item.count}
          </AdminStatusBadge>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-slate-900">{item.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
          </span>
          <span aria-hidden="true" className="text-slate-400">→</span>
        </button>
      ))}
    </div>
  );
}
