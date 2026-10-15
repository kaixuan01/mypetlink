import { apiRequest } from "@/services/apiClient";
import { isApiConfigured } from "@/services/apiConfig";
import type { MerchantAddress } from "@/services/adminMerchantSalesService";

export type BranchInput = {
  name: string;
  address: MerchantAddress;
  googleMapsUrl: string | null;
  wazeUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  contactPhone: string | null;
  whatsApp: string | null;
  businessHours: string | null;
  isActive: boolean;
  showOnWebsite: boolean;
  displayOrder: number;
  concurrencyToken?: string;
  merchantConcurrencyToken?: string;
  permission?: PublicationPermission;
  withdrawalReason?: string;
};
export type PublicationPermission = { source: "WhatsApp" | "Email" | "WrittenAgreement" | "Other"; reference: string; branchIds?: string[] };
export type ListingInput = Pick<MerchantListing, "showOnWebsite" | "businessDescription" | "concurrencyToken"> & { permission?: PublicationPermission; withdrawalReason?: string };
export type AdminBranch = BranchInput & { id: string; isPublished: boolean; concurrencyToken: string };
export type MerchantListing = {
  logoMediaFileId?: string | null;
  logoUrl?: string | null;
  merchantIsActive?: boolean;
  showOnWebsite: boolean;
  businessDescription: string | null;
  isPublished: boolean;
  publicCode: string | null;
  concurrencyToken: string;
  branches: AdminBranch[];
};
export type PublicPartnerBranch = Pick<BranchInput,
  "name" | "address" | "googleMapsUrl" | "wazeUrl" | "latitude" | "longitude" | "contactPhone" | "whatsApp" | "businessHours">;
export type PublicPartnerStore = {
  logoUrl?: string | null;
  publicCode: string;
  name: string;
  businessDescription: string | null;
  branches: PublicPartnerBranch[];
};
const base = (id: string) => `/api/v1/admin/merchant-sales/merchants/${encodeURIComponent(id)}`;
export async function getMerchantListing(id: string, signal?: AbortSignal) {
  const response = await apiRequest<MerchantListing>(`${base(id)}/listing`, { signal, cache: "no-store" });
  if (!response.data) throw new Error("Listing was not returned.");
  return response.data;
}
export async function updateMerchantListing(id: string, input: ListingInput) {
  const response = await apiRequest<MerchantListing>(`${base(id)}/listing`, { method: "PUT", body: input });
  if (!response.data) throw new Error("Listing was not returned.");
  return response.data;
}
export async function updateMerchantLogo(id: string, mediaId: string | null, concurrencyToken: string) {
  const response = await apiRequest<MerchantListing>(`${base(id)}/logo`, {
    method: "PUT", body: { mediaId, concurrencyToken },
  });
  if (!response.data) throw new Error("The saved logo could not be loaded. Please reload the merchant.");
  return response.data;
}
export async function saveMerchantBranch(id: string, branchId: string | null, input: BranchInput) {
  const response = await apiRequest<MerchantListing>(`${base(id)}/branches${branchId ? `/${encodeURIComponent(branchId)}` : ""}`, {
    method: branchId ? "PUT" : "POST", body: input,
  });
  if (!response.data) throw new Error("Listing was not returned.");
  return response.data;
}
export async function listPartnerStores(page: number, search: string, publicCode: string | null, signal?: AbortSignal) {
  // No invented partners in the local preview fallback.
  if (!isApiConfigured()) return { items: [] as PublicPartnerStore[], total: 0 };
  if (publicCode) {
    const response = await apiRequest<PublicPartnerStore>(`/api/v1/public/partner-stores/${encodeURIComponent(publicCode)}`, { auth: false, cache: "no-store", signal });
    return { items: response.data ? [response.data] : [], total: response.data ? 1 : 0 };
  }
  const params = new URLSearchParams({ page: String(page), pageSize: "20", search });
  const response = await apiRequest<PublicPartnerStore[]>(`/api/v1/public/partner-stores?${params}`, { auth: false, cache: "no-store", signal });
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}
