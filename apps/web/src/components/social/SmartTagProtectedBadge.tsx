import { Icon } from "@/components/ui/Icon";
import { smartTagsEnabled } from "@/lib/features";

type SmartTagProtectedBadgeProps = {
  className?: string;
};

/**
 * "Protected by a MyPetLink Smart Tag."
 *
 * A signal, never a sales control. It appears only for a pet that actually has
 * an active tag, and it carries nothing about the tag itself — no code, no
 * order, no inventory state. There is no companion "get a tag" call to action
 * here: the product has to be worth using without one.
 *
 * Respects the Smart Tags feature flag. While tags are hidden from the product,
 * a badge advertising them would be the one place they leaked back in. The API
 * still reports the underlying fact honestly; this is a display decision.
 */
export function SmartTagProtectedBadge({
  className = "",
}: SmartTagProtectedBadgeProps) {
  if (!smartTagsEnabled) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-pet-mint px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-pet-sage ${className}`}
      data-testid="smart-tag-protected-badge"
    >
      <Icon name="shield" className="h-3.5 w-3.5" aria-hidden="true" />
      Smart Tag Protected
    </span>
  );
}
