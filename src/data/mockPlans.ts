import type { Plan } from "@/types";

export const mockPlans: Plan[] = [
  {
    id: "plan_free",
    tier: "Free",
    name: "Free Plan",
    price: "RM0",
    billingNote: "Start with one pet",
    description:
      "For first-time pet owners who want a basic QR safety profile and a simple shareable pet page.",
    features: [
      "1 pet profile",
      "Public QR pet profile",
      "WhatsApp owner",
      "Call owner",
      "Basic emergency note",
      "Basic QR download",
      "Profile photo",
      "Shareable pet profile URL",
      "Up to 3 pet moments",
    ],
  },
  {
    id: "plan_premium",
    tier: "Premium",
    name: "Premium Plan",
    price: "RM19.90 / month",
    billingNote: "Monthly care and memories plan. Yearly billing option coming soon.",
    description:
      "For pet owners who want to manage multiple pets, complete care records, and precious memories.",
    features: [
      "Up to 5 pet profiles",
      "Unlimited care records",
      "Vaccine, deworming, and grooming reminders",
      "Vet visit history",
      "Medication and allergy records",
      "Lost Mode",
      "Scan history and found location reports",
      "Document notes and important files checklist",
      "Family access",
      "Unlimited pet moments",
      "Photo and video stories",
      "Pet life timeline, albums, and custom theme",
    ],
    badge: "Best for families",
    highlighted: true,
  },
];
