import type { ReactNode } from "react";

type BadgeTone = "warm" | "mint" | "teal" | "soft" | "danger";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

const tones: Record<BadgeTone, string> = {
  warm: "bg-pet-apricot text-[#9b4037]",
  mint: "bg-[#e8f8f0] text-pet-sage",
  teal: "bg-[#e8f3ff] text-pet-teal",
  soft: "bg-[#f7f0ec] text-pet-muted",
  danger: "bg-[#ffe8e3] text-[#a63c2e]",
};

export function Badge({ children, tone = "soft", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
