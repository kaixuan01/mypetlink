import { MomentMediaCarousel } from "@/components/moments/MomentMediaCarousel";
import { Badge } from "@/components/ui/Badge";
import { mediaCountLabel } from "@/lib/momentMedia";
import { normalizeMomentVisibility } from "@/lib/momentVisibility";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import type { PetMoment } from "@/types";

type PetMomentCardProps = {
  moment: PetMoment;
  onDelete?: () => void;
  onEdit?: () => void;
  publicView?: boolean;
  theme?: PetProfileTheme;
};

export function PetMomentCard({
  moment,
  onDelete,
  onEdit,
  publicView = false,
  theme,
}: PetMomentCardProps) {
  const themedStyle = theme
    ? { background: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }
    : undefined;
  const countLabel = mediaCountLabel(moment.media);
  const audience = normalizeMomentVisibility(moment.visibility);

  return (
    <article className="brand-card flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] p-0" style={themedStyle}>
      <MomentMediaCarousel moment={moment} theme={theme} />

      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <div
          className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          data-moment-heading
        >
          <div className="min-w-0 sm:flex-1">
            <h3
              className="line-clamp-2 [overflow-wrap:anywhere] text-xl font-black text-pet-ink sm:line-clamp-none sm:text-2xl"
              data-moment-title
              style={theme ? { color: theme.colors.text } : undefined}
            >
              {moment.title}
            </h3>
            <p className="mt-1 text-sm font-semibold text-pet-muted" style={theme ? { color: theme.colors.mutedText } : undefined}>
              {moment.date}
            </p>
            <p className="mt-2 text-xs font-bold text-pet-muted" style={theme ? { color: theme.colors.mutedText } : undefined}>
              {[moment.type, countLabel].filter(Boolean).join(" · ")}
            </p>
          </div>
          {publicView ? null : (
            <div
              className="flex min-w-0 flex-wrap gap-2 sm:shrink-0 sm:justify-end"
              data-moment-badges
            >
              <Badge tone={audience === "Public" ? "mint" : "soft"}>
                {audience === "Public" ? "Shared" : "Only me"}
              </Badge>
              {moment.showInLifeTimeline ? (
                <Badge tone="teal">In Life Timeline</Badge>
              ) : null}
            </div>
          )}
        </div>

        {moment.caption ? (
          <p className="mt-4 text-sm leading-6 text-pet-muted" style={theme ? { color: theme.colors.mutedText } : undefined}>
            {moment.caption}
          </p>
        ) : null}
        {!publicView && (onEdit || onDelete) ? (
          <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
            {onEdit ? (
              <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream" onClick={onEdit} type="button">
                Edit
              </button>
            ) : null}
            {onDelete ? (
              <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-pet-coral bg-white px-4 py-2 text-sm font-bold text-pet-coral transition hover:bg-pet-apricot" onClick={onDelete} type="button">
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
