"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import type { IconName } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";
import { isOwnerAuthenticated } from "@/services/authService";

type CreateProfileCTAProps = {
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
  icon?: IconName;
  variant?: "primary" | "coral" | "secondary" | "outline" | "light" | "dark";
};

export function CreateProfileCTA({
  children = "Start Free Profile",
  className,
  fullWidth,
  icon = "paw",
  variant = "coral",
}: CreateProfileCTAProps) {
  const router = useRouter();

  function handleClick() {
    const destination = isOwnerAuthenticated()
      ? ownerRoutes.petNew
      : `/login?redirect=${encodeURIComponent(ownerRoutes.petNew)}`;
    router.push(destination);
  }

  return (
    <CTAButton
      className={className}
      fullWidth={fullWidth}
      icon={icon}
      onClick={handleClick}
      variant={variant}
    >
      {children}
    </CTAButton>
  );
}
