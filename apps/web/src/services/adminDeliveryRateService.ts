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
