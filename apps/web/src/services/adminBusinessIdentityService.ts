import { apiRequest, isApiClientError } from "@/services/apiClient";

// The seller details printed on order summaries, receipts and merchant
// documents. One record, edited in one place.

export type AdminBusinessIdentityCompleteness = {
  readyForRetailDocuments: boolean;
  readyForMerchantQuotation: boolean;
  readyForMerchantInvoice: boolean;
  missingForMerchantInvoice: string[];
};

export type AdminBusinessIdentity = {
  brandName: string;
  legalBusinessName: string;
  businessRegistrationNumber: string;
  taxIdentificationNumber: string | null;
  sstRegistrationNumber: string | null;
  registeredAddressLine1: string;
  registeredAddressLine2: string | null;
  registeredPostcode: string;
  registeredCity: string;
  registeredState: string;
  registeredCountry: string;
  supportEmail: string;
  businessPhone: string | null;
  businessWebsite: string | null;
  paymentInstructions: string | null;
  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  duitNowDisplayName: string | null;
  updatedAt: string;
  updatedBy: string | null;
  completeness: AdminBusinessIdentityCompleteness;
  concurrencyToken: string;
};

export type AdminBusinessIdentityUpdate = Omit<
  AdminBusinessIdentity,
  "updatedAt" | "updatedBy" | "completeness" | "concurrencyToken"
> & { concurrencyToken: string };

const endpoint = "/api/v1/admin/business-identity";

export function getBusinessIdentity() {
  return apiRequest<AdminBusinessIdentity>(endpoint);
}

export function updateBusinessIdentity(update: AdminBusinessIdentityUpdate) {
  return apiRequest<AdminBusinessIdentity>(endpoint, {
    method: "PUT",
    body: update,
  });
}

export function getBusinessIdentityError(error: unknown): string {
  if (!isApiClientError(error)) {
    return "We couldn’t save the business details. Please try again.";
  }
  if (error.code === "concurrency_conflict" || error.status === 409) {
    return "These details were changed by another administrator. The latest values have been loaded.";
  }
  if (error.code === "validation_failed" || error.status === 400) {
    return "Please check the highlighted fields and try again.";
  }
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) {
    return "You do not have permission to change the business details.";
  }
  if (error.status === 0) {
    return "We couldn’t connect right now. Check your connection and try again.";
  }
  return "We couldn’t save the business details. Please try again.";
}

/**
 * Field-level messages returned by the server, keyed by the form field name.
 */
export function getBusinessIdentityFieldErrors(
  error: unknown
): Record<string, string> {
  if (!isApiClientError(error) || !error.details) return {};

  const fieldErrors: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.details)) {
    const first = messages?.[0];
    if (first) {
      // The server may answer with either casing depending on where the
      // validation ran; the form only knows camelCase names.
      fieldErrors[field.charAt(0).toLowerCase() + field.slice(1)] = first;
    }
  }
  return fieldErrors;
}
