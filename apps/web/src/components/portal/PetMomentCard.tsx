import { MomentMediaGallery } from "@/components/portal/MomentMediaGallery";
import { Badge } from "@/components/ui/Badge";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import type { PetMoment } from "@/types";

type PetMomentCardProps = {
  moment: PetMoment;
  onDelete?: () => void;
  onEdit?: () => void;
  publicView?: boolean;
  theme?: PetProfileTheme;
};

const visibilityTone = { Public: "mint", Private: "soft", "Family Only": "teal" } as const;

export function PetMomentCard({ moment, onDelete, onEdit, publicView, theme }: PetMomentCardProps) {
  const themedStyle = theme
    ? { background: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }
    : undefined;

  return (
    <article className="brand-card flex h-full flex-col overflow-hidden rounded-[1.75rem] p-0" style={themedStyle}>
      <MomentMediaGallery moment={moment} theme={theme} />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-pet-coral" style={theme ? { color: theme.colors.accent } : undefined}>
              {moment.type}
            </p>
            <h3 className="mt-2 text-xl font-black text-pet-ink sm:text-2xl" style={theme ? { color: theme.colors.text } : undefined}>
              {moment.title}
            </h3>
            <p className="mt-1 text-sm font-semibold text-pet-muted" style={theme ? { color: theme.colors.mutedText } : undefined}>
              {moment.date}
            </p>
          </div>
          {publicView ? null : (
            <div className="flex flex-wrap justify-end gap-2">
              <Badge tone={visibilityTone[moment.visibility]}>{moment.visibility}</Badge>
              {moment.showOnPublicProfile ? <Badge tone="mint">Public Profile</Badge> : null}
              {moment.showInLifeTimeline ? <Badge tone="teal">Life Timeline</Badge> : null}
            </div>
          )}
        </div>

        {moment.caption ? (
          <p className="mt-4 text-sm leading-6 text-pet-muted" style={theme ? { color: theme.colors.mutedText } : undefined}>
            {moment.caption}
          </p>
        ) : null}
        {onEdit || onDelete ? (
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
