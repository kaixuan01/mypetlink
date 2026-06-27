import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import type { PetProfileTheme } from "@/lib/petProfileThemes";
import {
  getCoverMedia,
  mediaCountLabel,
  sortedMedia,
} from "@/lib/momentMedia";
import type { PetMoment } from "@/types";

type PetMomentCardProps = {
  moment: PetMoment;
  onDelete?: () => void;
  onEdit?: () => void;
  publicView?: boolean;
  theme?: PetProfileTheme;
};

const visibilityTone = {
  Public: "mint",
  Private: "soft",
  "Family Only": "teal",
} as const;

export function PetMomentCard({
  moment,
  onDelete,
  onEdit,
  publicView,
  theme,
}: PetMomentCardProps) {
  const media = sortedMedia(moment.media ?? []);
  const cover = getCoverMedia(moment);
  const countLabel = mediaCountLabel(media);
  const coverIsImage = cover?.type === "image" && Boolean(cover.url);
  const mediaTitle = media.length
    ? countLabel ?? "Memory media"
    : "Memory note";
  const extraThumbs = media.filter((item) => item.id !== cover?.id).slice(0, 4);
  const momentType = moment.type;

  const themedStyle = theme
    ? {
        background: theme.colors.surface,
        borderColor: theme.colors.border,
        color: theme.colors.text,
      }
    : undefined;
  const mediaStyle = theme
    ? {
        background: theme.colors.surfaceAlt,
      }
    : undefined;
  const iconStyle = theme
    ? {
        background: theme.colors.accentSoft,
        color: theme.colors.accent,
      }
    : undefined;

  return (
    <article
      className="brand-card flex h-full flex-col overflow-hidden rounded-[1.5rem] p-0"
      style={themedStyle}
    >
      <div
        className="brand-paw-dots relative min-h-44 bg-pet-cream p-5"
        style={mediaStyle}
      >
        {coverIsImage ? (
          <>
            {/* Data-URL preview; static export + local mock means no next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={cover?.altText ?? moment.title}
              className="absolute inset-0 h-full w-full object-cover"
              src={cover?.url}
            />
            <span className="absolute inset-0 bg-gradient-to-t from-[#0d1b3d]/30 to-transparent" />
          </>
        ) : null}
        {media.length > 1 && countLabel ? (
          <span className="absolute right-4 top-4 z-10 rounded-full bg-pet-ink/85 px-3 py-1 text-xs font-bold text-white">
            {countLabel}
          </span>
        ) : null}
        <div className="absolute inset-x-5 bottom-5 rounded-[1.25rem] bg-white/92 p-4 shadow-lg shadow-[#0d1b3d]/10">
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pet-apricot text-pet-coral"
              style={iconStyle}
            >
              <Icon
                name={cover?.type === "video" ? "record" : "heart"}
                className="h-5 w-5"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-bold uppercase text-pet-muted"
                style={theme ? { color: theme.colors.mutedText } : undefined}
              >
                {mediaTitle}
              </p>
              <p
                className="mt-1 truncate text-base font-black text-pet-ink"
                style={theme ? { color: theme.colors.text } : undefined}
              >
                {moment.title}
              </p>
            </div>
            {extraThumbs.length ? (
              <div className="flex shrink-0 -space-x-2">
                {extraThumbs.map((item) => (
                  <span
                    className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border-2 border-white bg-pet-apricot/60 text-pet-coral"
                    key={item.id}
                  >
                    {item.type === "image" && item.url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={item.altText ?? "Moment media"}
                          className="h-full w-full object-cover"
                          src={item.url}
                        />
                      </>
                    ) : (
                      <Icon
                        name={item.type === "video" ? "record" : "heart"}
                        className="h-4 w-4"
                      />
                    )}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-xs font-bold uppercase text-pet-coral"
            style={theme ? { color: theme.colors.accent } : undefined}
          >
            {momentType}
          </p>
          <h3
            className="mt-2 text-xl font-black text-pet-ink"
            style={theme ? { color: theme.colors.text } : undefined}
          >
            {moment.title}
          </h3>
          <p
            className="mt-1 text-sm font-semibold text-pet-muted"
            style={theme ? { color: theme.colors.mutedText } : undefined}
          >
            {moment.date}
          </p>
        </div>
        {publicView ? null : (
          <div className="flex flex-wrap justify-end gap-2">
            <Badge tone={visibilityTone[moment.visibility]}>
              {moment.visibility}
            </Badge>
            {moment.showOnPublicProfile ? (
              <Badge tone="mint">Public Profile</Badge>
            ) : null}
            {moment.showInLifeTimeline ? (
              <Badge tone="teal">Life Timeline</Badge>
            ) : null}
          </div>
        )}
      </div>

      {moment.caption ? (
        <p
          className="mt-4 text-sm leading-6 text-pet-muted"
          style={theme ? { color: theme.colors.mutedText } : undefined}
        >
          {moment.caption}
        </p>
      ) : null}
      {onEdit || onDelete ? (
        <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
          {onEdit ? (
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              onClick={onEdit}
              type="button"
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-pet-coral bg-white px-4 py-2 text-sm font-bold text-pet-coral transition hover:bg-pet-apricot"
              onClick={onDelete}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
      </div>
    </article>
  );
}
