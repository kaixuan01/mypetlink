import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import type { PetMoment } from "@/types";

type PetMomentCardProps = {
  moment: PetMoment;
  publicView?: boolean;
};

const visibilityTone = {
  Public: "mint",
  Private: "soft",
  "Family Only": "teal",
} as const;

export function PetMomentCard({ moment, publicView }: PetMomentCardProps) {
  const mediaTitle =
    moment.mediaKind === "Video"
      ? "Short clip"
      : moment.mediaKind === "Image"
        ? "Photo memory"
        : "Memory note";
  const momentType = formatMomentType(moment.type);

  return (
    <article className="brand-card overflow-hidden rounded-[1.5rem] p-0">
      <div className="brand-paw-dots relative min-h-44 bg-pet-cream p-5">
        <div className="absolute inset-x-5 bottom-5 rounded-[1.25rem] bg-white/92 p-4 shadow-lg shadow-[#0d1b3d]/10">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pet-apricot text-pet-coral">
              <Icon
                name={moment.mediaKind === "Video" ? "record" : "heart"}
                className="h-5 w-5"
              />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-pet-muted">
                {mediaTitle}
              </p>
              <p className="mt-1 truncate text-base font-black text-pet-ink">
                {moment.mediaLabel}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-pet-coral">
            {momentType}
          </p>
          <h3 className="mt-2 text-xl font-black text-pet-ink">
            {moment.title}
          </h3>
          <p className="mt-1 text-sm font-semibold text-pet-muted">
            {moment.date}
          </p>
        </div>
        {publicView ? null : (
          <Badge tone={visibilityTone[moment.visibility]}>
            {moment.visibility}
          </Badge>
        )}
      </div>

      {moment.caption ? (
        <p className="mt-4 text-sm leading-6 text-pet-muted">
          {moment.caption}
        </p>
      ) : null}
      </div>
    </article>
  );
}

function formatMomentType(type: PetMoment["type"]) {
  if (type === "Video") {
    return "Clip";
  }

  if (type === "Photo") {
    return "Photo memory";
  }

  return type;
}
