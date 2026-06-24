import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type CTAButtonProps = {
  children: ReactNode;
  href?: string;
  icon?: IconName;
  onClick?: () => void;
  variant?: "primary" | "coral" | "secondary" | "outline" | "light" | "dark";
  fullWidth?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  target?: string;
  rel?: string;
};

const variants = {
  primary:
    "border-pet-teal bg-pet-teal text-white shadow-lg shadow-[#1570ef]/20 hover:bg-[#0f5fd0]",
  coral:
    "border-pet-coral bg-pet-coral text-white shadow-lg shadow-[#ff7a6e]/20 hover:bg-[#f26155]",
  secondary:
    "border-pet-border bg-white text-pet-ink shadow-sm hover:bg-pet-cream",
  outline: "border-pet-border bg-transparent text-pet-ink hover:bg-white",
  light: "border-white bg-white text-pet-ink shadow-lg shadow-black/10 hover:bg-pet-cream",
  dark: "border-pet-ink bg-pet-ink text-white hover:bg-[#162a58]",
};

export function CTAButton({
  children,
  href,
  icon,
  onClick,
  variant = "primary",
  fullWidth,
  className = "",
  type = "button",
  disabled,
  target,
  rel,
}: CTAButtonProps) {
  const classes = [
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-extrabold transition active:translate-y-px",
    variants[variant],
    fullWidth ? "w-full" : "",
    disabled ? "cursor-not-allowed opacity-60" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </>
  );

  if (href && !disabled) {
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={classes}>
          {content}
        </Link>
      );
    }

    return (
      <a href={href} className={classes} rel={rel} target={target}>
        {content}
      </a>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {content}
    </button>
  );
}
