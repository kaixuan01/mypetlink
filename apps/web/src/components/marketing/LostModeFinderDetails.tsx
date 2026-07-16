import { formatFinderDateTime } from "@/lib/dateTime";
import type { PetLostMode } from "@/types";

type LostModeFinderDetailsProps = {
  lostMode: PetLostMode;
  className?: string;
};

export function LostModeFinderDetails({
  lostMode,
  className = "",
}: LostModeFinderDetailsProps) {
  const formattedLastSeen = formatFinderDateTime(
    lostMode.lastSeenDateTime
  );
  const details = [
    {
      label: "Last seen area",
      value: lostMode.lastSeenArea,
      wide: false,
    },
    { label: "Last seen", value: formattedLastSeen, wide: false },
    { label: "Reward", value: lostMode.rewardNote, wide: true },
    {
      label: "Contact instructions",
      value: lostMode.extraContactInstruction,
      wide: true,
    },
  ].filter((detail) => detail.value.trim());

  if (!details.length) {
    return null;
  }

  return (
    <dl className={`grid gap-2 text-left sm:grid-cols-2 ${className}`.trim()}>
      {details.map((detail) => (
        <div
          className={`min-w-0 rounded-[1rem] bg-white px-4 py-3 ${
            detail.wide ? "sm:col-span-2" : ""
          }`}
          key={detail.label}
        >
          <dt className="text-[0.7rem] font-black uppercase tracking-wide text-pet-muted">
            {detail.label}
          </dt>
          <dd className="mt-1 break-words text-sm font-bold leading-6 text-pet-ink [overflow-wrap:anywhere]">
            {detail.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
