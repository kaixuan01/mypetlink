import { apiRequest } from "@/services/apiClient";

export type AdminDeliveryRate = {
  id: string;
  name: string;
  zoneCode: string;
  zoneName: string;
  applicableStateCodes: string[];
  applicableStateNames: string[];
  fee: number;
  currency: string;
  freeShippingThreshold?: number | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  concurrencyToken: string;
  enabledStateOverrideCount: number;
};

export type DeliveryRateInput = {
  name: string;
  zoneCode: string;
  fee: number;
  currency: "MYR";
  freeShippingThreshold: number | null;
  isActive: boolean;
  displayOrder: number;
  concurrencyToken?: string | null;
};

export async function listAdminDeliveryRates() {
  const response = await apiRequest<AdminDeliveryRate[]>("/api/v1/admin/delivery-rates");
  return response.data ?? [];
}

export async function saveAdminDeliveryRate(id: string | null, input: DeliveryRateInput) {
  const response = await apiRequest<AdminDeliveryRate>(
    id ? `/api/v1/admin/delivery-rates/${encodeURIComponent(id)}` : "/api/v1/admin/delivery-rates",
    { method: id ? "PUT" : "POST", body: input }
  );
  if (!response.data) throw new Error("Delivery rate was not saved.");
  return response.data;
}

// --- State overrides ------------------------------------------------------
// The API is authoritative for every fee. These types are display-only.

export type AdminDeliveryStateRate = {
  stateCode: string;
  stateName: string;
  zoneCode: string;
  zoneName: string;
  effectiveFee: number;
  effectiveFreeShippingThreshold: number | null;
  zoneDefaultFee: number;
  zoneDefaultFreeShippingThreshold: number | null;
  source: string;
  hasOverride: boolean;
  overrideEnabled: boolean;
  overrideFee: number | null;
  overrideFreeShippingThreshold: number | null;
  overrideUpdatedAt: string | null;
  overrideUpdatedBy: string | null;
  concurrencyToken: string | null;
};

export type AdminDeliveryZoneStateRates = {
  zoneCode: string;
  zoneName: string;
  zoneActive: boolean;
  zoneDefaultFee: number;
  zoneDefaultFreeShippingThreshold: number | null;
  enabledOverrideCount: number;
  storedOverrideCount: number;
  states: AdminDeliveryStateRate[];
};

export type DeliveryStateOverrideInput = {
  stateCode: string;
  fee: number;
  freeShippingThreshold: number | null;
  isEnabled: boolean;
  concurrencyToken?: string | null;
};

export async function listAdminDeliveryStateRates(zoneCode: string) {
  const response = await apiRequest<AdminDeliveryZoneStateRates>(
    `/api/v1/admin/delivery-rates/${encodeURIComponent(zoneCode)}/state-overrides`
  );
  if (!response.data) throw new Error("Delivery state rates were not returned.");
  return response.data;
}

export async function saveAdminDeliveryStateOverride(
  zoneCode: string,
  input: DeliveryStateOverrideInput
) {
  const response = await apiRequest<AdminDeliveryZoneStateRates>(
    `/api/v1/admin/delivery-rates/${encodeURIComponent(zoneCode)}/state-overrides`,
    { method: "PUT", body: input }
  );
  if (!response.data) throw new Error("The delivery-rate override was not saved.");
  return response.data;
}

export async function removeAdminDeliveryStateOverride(
  zoneCode: string,
  stateCode: string
) {
  const response = await apiRequest<AdminDeliveryZoneStateRates>(
    `/api/v1/admin/delivery-rates/${encodeURIComponent(zoneCode)}/state-overrides/${encodeURIComponent(stateCode)}`,
    { method: "DELETE" }
  );
  if (!response.data) throw new Error("The delivery-rate override was not removed.");
  return response.data;
}
