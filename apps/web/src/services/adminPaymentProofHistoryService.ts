import { canUseAdminApi } from "@/services/adminService";
import { apiRequest } from "@/services/apiClient";

export type AdminPaymentProofHistoryEntry = {
  id: string;
  action: string;
  actorType?: string;
  createdAt: string;
  reason?: string;
};

type AuditEntry = {
  id: string;
  action: string;
  actorType?: string | null;
  createdAt: string;
  newValue?: string | null;
};

export async function getAdminPaymentProofHistory(proofId: string, orderId: string, signal?: AbortSignal) {
  if (!canUseAdminApi()) return null;
  const [proof, order] = await Promise.all([
    apiRequest<AuditEntry[]>(`/api/v1/admin/audit-logs?entity=PaymentProof&entityId=${encodeURIComponent(proofId)}&pageSize=100`, { signal }),
    apiRequest<AuditEntry[]>(`/api/v1/admin/audit-logs?entity=TagOrder&entityId=${encodeURIComponent(orderId)}&pageSize=100`, { signal }),
  ]);

  return [...(proof.data ?? []), ...(order.data ?? [])]
    .map((entry): AdminPaymentProofHistoryEntry => ({
      id: entry.id,
      action: entry.action,
      actorType: entry.actorType ?? undefined,
      createdAt: entry.createdAt,
      reason: getReason(entry.newValue),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getReason(value?: string | null) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { reason?: unknown };
    return typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : undefined;
  } catch {
    return undefined;
  }
}
