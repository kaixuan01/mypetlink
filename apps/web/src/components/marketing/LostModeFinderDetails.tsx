import { formatFinderDateTime } from "@/lib/dateTime";
import type { PetLostMode } from "@/types";

/**
 * Which Lost Mode facts to print.
 *
 * The Safety Profile splits them: where and when the pet was last seen is what
 * a finder standing over the animal needs before they decide to act, so it sits
 * above the contact buttons; the reward and any extra instructions matter only
 * once they have decided to make contact, so they sit below. Everywhere else
 * shows all four, which is the default.
 */
export type LostModeDetailField =
  | "lastSeenArea"
  | "lastSeenDateTime"
  | "rewardNote"
  | "extraContactInstruction";

const allFields: LostModeDetailField[] = [
  "lastSeenArea",
  "lastSeenDateTime",
  "rewardNote",
  "extraContactInstruction",
];

type LostModeFinderDetailsProps = {
  lostMode: PetLostMode;
  className?: string;
  /** Defaults to all four, in the order above. */
  fields?: LostModeDetailField[];
};

export function LostModeFinderDetails({
  lostMode,
  className = "",
  fields = allFields,
}: LostModeFinderDetailsProps) {
  const formattedLastSeen = formatFinderDateTime(
    lostMode.lastSeenDateTime
  );
  const byField: Record<
    LostModeDetailField,
    { label: string; value: string; wide: boolean }
  > = {
    lastSeenArea: {
      label: "Last seen area",
      value: lostMode.lastSeenArea,
      wide: false,
    },
    lastSeenDateTime: {
      label: "Last seen",
      value: formattedLastSeen,
      wide: false,
    },
    rewardNote: { label: "Reward", value: lostMode.rewardNote, wide: true },
    extraContactInstruction: {
      label: "Contact instructions",
      value: lostMode.extraContactInstruction,
      wide: true,
    },
  };

  const details = fields
    .map((field) => byField[field])
    .filter((detail) => detail.value.trim());

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
