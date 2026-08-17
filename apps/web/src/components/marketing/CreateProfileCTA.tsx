"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CTAButton } from "@/components/ui/CTAButton";
import type { IconName } from "@/components/ui/Icon";
import { AnalyticsEvent, trackEvent, type AnalyticsSurface } from "@/lib/analytics";
import { ownerRoutes } from "@/lib/routes";
import { isOwnerAuthenticated } from "@/services/authService";

type CreateProfileCTAProps = {
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
  icon?: IconName;
  variant?: "primary" | "coral" | "secondary" | "outline" | "light" | "dark";
  /**
   * Set on surfaces where this CTA is a measured acquisition step, so the same
   * control can be told apart from the marketing pages. Left unset elsewhere.
   */
  analyticsSurface?: Extract<AnalyticsSurface, "public_profile">;
};

export function CreateProfileCTA({
  children = "Start Free Profile",
  className,
  fullWidth,
  icon = "paw",
  variant = "coral",
  analyticsSurface,
}: CreateProfileCTAProps) {
  const router = useRouter();

  function handleClick() {
    if (analyticsSurface) {
      trackEvent(AnalyticsEvent.CreateProfileCtaClicked, {
        surface: analyticsSurface,
      });
    }

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
