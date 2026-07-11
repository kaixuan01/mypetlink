import { VideoPoster } from "@/components/moments/VideoPoster";
import { Icon } from "@/components/ui/Icon";
import { sortedMedia } from "@/lib/momentMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { PetMoment } from "@/types";

export function MomentMediaThumbnail({ moment }: { moment: PetMoment }) {
  const item = sortedMedia(moment.media)[0];
  const mediaUrl = resolveMediaUrl(item?.url);

  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-pet-apricot/55">
      {item?.type === "video" ? (
        <VideoPoster
          alt={item.altText ?? `${moment.title} video`}
          compact
          durationSeconds={item.durationSeconds}
          posterUrl={item.posterUrl}
          url={item.url}
        />
      ) : item && mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={item.altText ?? `${moment.title} photo`}
          className="h-full w-full object-cover"
          src={mediaUrl}
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-pet-coral">
          <Icon className="h-5 w-5" name="heart" />
        </span>
      )}
    </div>
  );
}
