import { Icon, type IconName } from "@/components/ui/Icon";

type StatCardProps = {
  label: string;
  value: string | number;
  note: string;
  icon?: IconName;
  tone?: "warm" | "mint" | "teal" | "soft";
};

const tones = {
  warm: "bg-pet-apricot text-pet-coral",
  mint: "bg-[#e8f8f0] text-pet-sage",
  teal: "bg-[#e8f3ff] text-pet-teal",
  soft: "bg-[#f7f0ec] text-pet-muted",
};

export function StatCard({
  label,
  value,
  note,
  icon = "paw",
  tone = "warm",
}: StatCardProps) {
  return (
    <div className="brand-card rounded-[1.5rem] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-pet-muted">{label}</p>
          <p className="mt-3 text-3xl font-black text-pet-ink">{value}</p>
        </div>
        <span className={`rounded-2xl p-3 ${tones[tone]}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-pet-muted">{note}</p>
    </div>
  );
}
