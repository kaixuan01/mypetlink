import { Icon, type IconName } from "@/components/ui/Icon";

type FeatureTileProps = {
  icon: IconName;
  title: string;
  description: string;
};

export function FeatureTile({ icon, title, description }: FeatureTileProps) {
  return (
    <article className="brand-card rounded-[1.75rem] p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#0d1b3d]/10">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-lg font-black text-pet-ink">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-pet-muted">{description}</p>
    </article>
  );
}
