import { apiRequest, isApiClientError } from "@/services/apiClient";

export type ShippingSettings = {
  senderName: string;
  companyName?: string | null;
  senderPhone: string;
  senderEmail?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postcode: string;
  stateCode: string;
  country: string;
  defaultParcelWeightKg: number;
  defaultParcelLengthCm: number;
  defaultParcelWidthCm: number;
  defaultParcelHeightCm: number;
  customerTrackingLinksEnabled: boolean;
  senderConfigured: boolean;
  updatedAt: string;
  updatedBy?: string | null;
  rowVersion: string;
};

export type ShippingCourier = {
  id: string;
  code: string;
  displayName: string;
  isActive: boolean;
  isDefault: boolean;
  trackingUrlTemplate?: string | null;
  displayOrder: number;
  internalNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
  rowVersion: string;
};

export type ShippingStateOption = { code: string; name: string };

export type ShippingFulfilmentConfiguration = {
  settings: ShippingSettings;
  couriers: ShippingCourier[];
  malaysiaStates: ShippingStateOption[];
};

export type ShippingCourierOption = {
  code: string;
  displayName: string;
  isDefault: boolean;
  displayOrder: number;
};

export type ShippingSettingsInput = Omit<
  ShippingSettings,
  "senderConfigured" | "updatedAt" | "updatedBy"
>;

export type ShippingCourierInput = {
  code?: string;
  displayName: string;
  isActive: boolean;
  isDefault: boolean;
  trackingUrlTemplate?: string | null;
  displayOrder: number;
  internalNotes?: string | null;
  rowVersion?: string;
};

export async function getShippingFulfilmentConfiguration() {
  const response = await apiRequest<ShippingFulfilmentConfiguration>(
    "/api/v1/admin/shipping-fulfilment"
  );
  if (!response.data) throw new Error("Shipping settings were not returned.");
  return response.data;
}

export async function updateShippingSettings(input: ShippingSettingsInput) {
  const response = await apiRequest<ShippingSettings>(
    "/api/v1/admin/shipping-fulfilment/settings",
    { method: "PUT", body: input }
  );
  if (!response.data) throw new Error("Shipping settings were not saved.");
  return response.data;
}

export async function listShippingCourierOptions() {
  const response = await apiRequest<ShippingCourierOption[]>(
    "/api/v1/admin/shipping-fulfilment/courier-options"
  );
  return response.data ?? [];
}

export async function createShippingCourier(input: ShippingCourierInput) {
  const response = await apiRequest<ShippingCourier>(
    "/api/v1/admin/shipping-fulfilment/couriers",
    {
      method: "POST",
      body: {
        code: input.code,
        displayName: input.displayName,
        isActive: input.isActive,
        isDefault: input.isDefault,
        trackingUrlTemplate: input.trackingUrlTemplate || null,
        displayOrder: input.displayOrder,
        internalNotes: input.internalNotes || null,
      },
    }
  );
  if (!response.data) throw new Error("The courier was not added.");
  return response.data;
}

export async function updateShippingCourier(id: string, input: ShippingCourierInput) {
  const response = await apiRequest<ShippingCourier>(
    `/api/v1/admin/shipping-fulfilment/couriers/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: {
        displayName: input.displayName,
        isActive: input.isActive,
        isDefault: input.isDefault,
        trackingUrlTemplate: input.trackingUrlTemplate || null,
        displayOrder: input.displayOrder,
        internalNotes: input.internalNotes || null,
        rowVersion: input.rowVersion,
      },
    }
  );
  if (!response.data) throw new Error("The courier was not saved.");
  return response.data;
}

export async function setShippingCourierActive(
  courier: ShippingCourier,
  isActive: boolean
) {
  const response = await apiRequest<ShippingCourier>(
    `/api/v1/admin/shipping-fulfilment/couriers/${encodeURIComponent(courier.id)}/active`,
    { method: "POST", body: { isActive, rowVersion: courier.rowVersion } }
  );
  if (!response.data) throw new Error("The courier status was not updated.");
  return response.data;
}

export async function setDefaultShippingCourier(courier: ShippingCourier) {
  const response = await apiRequest<ShippingCourier>(
    `/api/v1/admin/shipping-fulfilment/couriers/${encodeURIComponent(courier.id)}/default`,
    { method: "POST", body: { rowVersion: courier.rowVersion } }
  );
  if (!response.data) throw new Error("The default courier was not updated.");
  return response.data;
}

export function getShippingSettingsError(error: unknown) {
  if (isApiClientError(error)) {
    const first = Object.values(error.details ?? {}).flat()[0];
    if (first) return first;
    if (error.status === 409) {
      return "These settings changed elsewhere. Refresh the page and try again.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "We couldn’t save these settings.";
}
