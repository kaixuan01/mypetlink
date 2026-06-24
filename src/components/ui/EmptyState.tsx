import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export function EmptyState({
  icon = "paw",
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="brand-paw-dots brand-soft-card rounded-[1.75rem] border-dashed p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pet-apricot text-pet-coral shadow-sm">
        <Icon name={icon} className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-black text-pet-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-pet-muted">
        {description}
      </p>
      {actionLabel && actionHref ? (
        <CTAButton href={actionHref} icon="plus" className="mt-5">
          {actionLabel}
        </CTAButton>
      ) : null}
    </div>
  );
}
