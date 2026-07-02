import type { OrderStatus, PetLifecycleStatus, TagStatus } from "@/types";

type BadgeTone = "warm" | "mint" | "teal" | "soft" | "danger";

export const orderStatusTone: Record<OrderStatus, BadgeTone> = {
  Draft: "soft",
  "Pending Payment": "warm",
  "Payment Submitted": "teal",
  "Payment Confirmed": "mint",
  Preparing: "teal",
  Shipped: "teal",
  Delivered: "mint",
  Cancelled: "danger",
};

export const tagStatusTone: Record<TagStatus, BadgeTone> = {
  Unassigned: "soft",
  Pending: "warm",
  Preparing: "teal",
  Delivered: "teal",
  Active: "mint",
  Disabled: "danger",
  Lost: "danger",
  Replaced: "warm",
  Archived: "soft",
};

export const lifecycleTone: Record<PetLifecycleStatus, BadgeTone> = {
  Active: "mint",
  Memorial: "soft",
  Archived: "soft",
};

export function getTagTypeLabel(hasNfc: boolean) {
  return hasNfc ? "QR + NFC" : "QR";
}
