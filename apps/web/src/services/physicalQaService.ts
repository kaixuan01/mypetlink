import { apiRequest, apiRequestBlob } from "@/services/apiClient";
import { triggerDownload } from "@/lib/adminListShared";

export type QaStatus = "Pending" | "Passed" | "Failed" | "NeedsReview";
export type QaCondition = "Unchecked" | "Good" | "Damaged" | "NeedsReview";
// chipId is the NFC chip ID the server will bind on a pass, or null when the
// phone reported none — such a package can be held for review but never passed.
export type QaCapture = { evidence: string; observedCode: string | null; matches: boolean; problem: string | null; chipId?: string | null };
export type QaItem = {
  id: string; tagCode: string; batch: string | null; sku: string | null; shipment: string | null;
  qaStatus: QaStatus | null; version: number; expectedQrUrl: string; expectedNfcUrl: string;
  qrUrl: string | null; nfcUrl: string | null; qrVerifiedAt: string | null; nfcVerifiedAt: string | null;
  nfcSource: string | null; nfcSerialNumber: string | null; physicalCondition: QaCondition;
  remarks: string | null; inspectedAt: string | null; inspectedBy: string | null; canInspect: boolean;
};
export type QaSummary = { totalExpected: number; passed: number; failed: number; needsReview: number; pending: number; inspected: number };
export type QaFilters = { batch: string; sku: string; tagCode: string; qaStatus: string; shipment: string };
export type QaCohort = { shipmentReference: string; tagCodes: string[]; expectedCount: number; acknowledgeCommitments: boolean };
export type QaCommitment = { tagCode: string; kind: "RetailOrder" | "MerchantOrder"; reference: string; status: string };
export type QaBatchBreakdown = { batchNo: string | null; inManifest: number; batchTotal: number; notInManifest: number; notInManifestCodes: string[] };
export type QaSkuBreakdown = { sku: string | null; productName: string | null; variantName: string | null; tagVariant: string | null; count: number };
export type QaPreview = {
  expectedCount: number; manifestEntries: number; uniqueCodes: number; found: number; eligible: number; alreadyEnrolled: number;
  outstandingRetailReservations: number; duplicateCodes: { tagCode: string; occurrences: number }[]; invalidCodes: string[];
  missingCodes: string[]; batches: QaBatchBreakdown[]; skus: QaSkuBreakdown[]; commitments: QaCommitment[]; problems: string[];
  requiresAcknowledgement: boolean; listsTruncated: boolean;
};
export type QaHistory = { id: string; action: string; createdAt: string; adminName: string | null; result: string | null };
// apiRequest adds no version prefix, so the full API path belongs here.
const base = "/api/v1/admin/tag-inventory/qa";
async function required<T>(path: string, options?: Parameters<typeof apiRequest>[1]): Promise<T> {
  const result = await apiRequest<T>(base + path, options);
  if (result.data === undefined) throw new Error("The inspection result was not returned. Please retry.");
  return result.data;
}
function query(filters: QaFilters, page = 1) {
  return new URLSearchParams({ ...filters, page: String(page), pageSize: "25" }).toString();
}
export const physicalQaService = {
  lookup: (code: string) => required<QaItem>(`/lookup?code=${encodeURIComponent(code)}`),
  async list(filters: QaFilters, page: number) {
    const r = await apiRequest<QaItem[]>(`${base}?${query(filters, page)}`);
    return { items: r.data ?? [], total: r.meta?.total ?? 0 };
  },
  summary: (filters: QaFilters) => required<QaSummary>(`/summary?${query(filters)}`),
  capture: (item: QaItem, source: "Camera" | "WebNfc", url: string, serialNumber?: string) =>
    required<QaCapture>("/capture", { method: "POST", body: { tagCode: item.tagCode, expectedVersion: item.version, source, url, serialNumber } }),
  save: (item: QaItem, body: { inspectionId: string; decision: QaStatus; physicalCondition: QaCondition; remarks: string; qrEvidence?: string; nfcEvidence?: string }) =>
    required<QaItem>(`/${item.id}`, { method: "PUT", body: { ...body, expectedVersion: item.version } }),
  preview: (body: QaCohort) => required<QaPreview>("/cohort/preview", { method: "POST", body }),
  enroll: (body: QaCohort) => required<QaPreview>("/cohort/enroll", { method: "POST", body }),
  history: (id: string) => required<QaHistory[]>(`/${id}/history`),
  async export(filters: QaFilters) {
    const { blob, fileName } = await apiRequestBlob(`${base}/export?${query(filters)}`);
    triggerDownload(blob, fileName ?? "mypetlink-physical-qa.csv");
  },
};
