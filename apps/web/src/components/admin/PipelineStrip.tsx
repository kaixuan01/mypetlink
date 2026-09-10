export type PipelineStage = {
  id: string;
  label: string;
  value: number;
  onSelect: () => void;
};

export function PipelineStrip({ stages }: { stages: PipelineStage[] }) {
  return (
    <div
      aria-label="Scrollable merchant sales lifecycle"
      className="overflow-x-auto pb-2"
      data-testid="pipeline-scroll-region"
      role="region"
      tabIndex={0}
    >
      <ol
        aria-label="Merchant sales lifecycle"
        className="flex min-w-max items-stretch pr-2"
      >
        {stages.map((stage, index) => {
          const isZero = stage.value === 0;
          return (
            <li className="flex shrink-0 items-center" key={stage.id}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="px-1.5 text-sm font-bold text-slate-300"
                >
                  →
                </span>
              ) : null}
              <button
                className={`min-h-16 w-28 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1570ef] ${
                  isZero ? "text-slate-300" : "bg-slate-50 text-slate-900"
                }`}
                data-testid={`pipeline-stage-${stage.id}`}
                onClick={stage.onSelect}
                type="button"
              >
                <span className="block text-lg font-black leading-none">{stage.value}</span>
                <span className={`mt-1.5 block text-[0.68rem] font-bold leading-tight ${isZero ? "text-slate-400" : "text-slate-600"}`}>
                  {stage.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
