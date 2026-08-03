import { apiRequest, isApiClientError } from "@/services/apiClient";

export type AdminPaymentReservationWorkerStatus = {
  enabled: boolean;
  pollIntervalSeconds: number;
  batchSize: number;
};

export type AdminOrderCheckoutSettings = {
  paymentReservationMinutes: number;
  minPaymentReservationMinutes: number;
  maxPaymentReservationMinutes: number;
  updatedAt: string;
  updatedBy: string | null;
  rowVersion: string;
  expiryWorker: AdminPaymentReservationWorkerStatus;
};

const endpoint = "/api/v1/admin/order-checkout-settings";

export function getOrderCheckoutSettings() {
  return apiRequest<AdminOrderCheckoutSettings>(endpoint);
}

export function updateOrderCheckoutSettings(
  paymentReservationMinutes: number,
  rowVersion: string
) {
  return apiRequest<AdminOrderCheckoutSettings>(endpoint, {
    method: "PUT",
    body: { paymentReservationMinutes, rowVersion },
  });
}

export function getOrderCheckoutSettingsError(error: unknown): string {
  if (!isApiClientError(error)) {
    return "We couldn’t update order checkout settings. Please try again.";
  }
  if (error.code === "concurrency_conflict" || error.status === 409) {
    return "These settings were changed by another administrator. The latest value has been loaded.";
  }
  if (error.code === "validation_failed" || error.status === 400) {
    return "Enter a reservation window within the allowed range.";
  }
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to change these settings.";
  if (error.status === 0) {
    return "We couldn’t connect right now. Check your connection and try again.";
  }
  return "We couldn’t update order checkout settings. Please try again.";
}
