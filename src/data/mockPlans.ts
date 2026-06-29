import type { Plan } from "@/types";
import { freePlanLimits, premiumPlan } from "@/lib/planLimits";

export const mockPlans: Plan[] = [
  {
    id: "plan_free",
    tier: "Free",
    name: "Free Plan",
    price: "RM0",
    billingNote: "Available now",
    description:
      "Start with a free pet profile for basic safety, sharing, and care information.",
    features: [
      `Up to ${freePlanLimits.maxPets} pet profiles`,
      "Public Share Profile",
      "QR Safety Page",
      "WhatsApp owner button",
      "Call owner button",
      "Basic emergency note",
      "Basic Lost Mode",
      "Basic QR download",
      "Profile photo",
      "Shareable pet profile URL",
      "Basic care records",
      `Up to ${freePlanLimits.maxMemoriesPerPet} pet memories per pet`,
    ],
    badge: "Available now",
  },
  {
    id: "plan_premium",
    tier: "Premium",
    name: premiumPlan.name,
    price: premiumPlan.status,
    billingNote: "No subscription flow in Phase 1",
    description: premiumPlan.description,
    features: [...premiumPlan.features],
    badge: premiumPlan.status,
    comingSoon: true,
  },
];
