type MediaCounterProps = {
  current: number;
  total: number;
  className?: string;
};

export function MediaCounter({
  current,
  total,
  className = "",
}: MediaCounterProps) {
  return (
    <span
      aria-label={`Media ${current} of ${total}`}
      className={`inline-flex min-h-7 items-center rounded-full bg-black/65 px-2.5 text-xs font-black tabular-nums text-white shadow-sm backdrop-blur-sm ${className}`}
    >
      {current} / {total}
    </span>
  );
}
