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
      ? "Video memory"
      : moment.mediaKind === "Image"
        ? "Photo memory"
        : "Memory note";

  return (
    <article className="brand-card rounded-[1.5rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-pet-coral">
            {moment.type}
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

      <div className="brand-paw-dots mt-5 grid min-h-40 place-items-center overflow-hidden rounded-[1.25rem] bg-pet-cream p-5 text-center">
        <div>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-pet-coral shadow-sm">
            <Icon
              name={moment.mediaKind === "Video" ? "record" : "heart"}
              className="h-6 w-6"
            />
          </span>
          <p className="mt-3 text-base font-black text-pet-ink">
            {moment.mediaLabel}
          </p>
          <p className="mt-1 text-xs font-bold uppercase text-pet-muted">
            {mediaTitle}
          </p>
        </div>
      </div>

      {moment.caption ? (
        <p className="mt-4 text-sm leading-6 text-pet-muted">
          {moment.caption}
        </p>
      ) : null}
    </article>
  );
}
