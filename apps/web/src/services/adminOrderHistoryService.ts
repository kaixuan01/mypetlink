import { canUseAdminApi } from "@/services/adminService";
import { apiRequest } from "@/services/apiClient";

export type AdminOrderHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorType?: "Admin" | "Owner" | "System" | string;
  detail?: string;
};

export async function getAdminOrderHistory(
  orderId: string,
  signal?: AbortSignal
): Promise<AdminOrderHistoryEntry[] | null> {
  if (!canUseAdminApi()) return null;

  const response = await apiRequest<
    { id: string; action: string; actorType?: string | null; createdAt: string; newValue?: string | null }[]
  >(
    `/api/v1/admin/audit-logs?entity=TagOrder&entityId=${encodeURIComponent(orderId)}&pageSize=100`,
    { signal }
  );
  return (response.data ?? []).map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorType: entry.actorType ?? undefined,
    createdAt: entry.createdAt,
    detail: getReadableAuditDetail(entry.action, entry.newValue),
  }));
}

function getReadableAuditDetail(action: string, value?: string | null) {
  if (!value || !["order.cancel", "order.reject-payment-proof"].includes(action)) return undefined;

  try {
    const parsed = JSON.parse(value) as { reason?: unknown };
    return typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : undefined;
  } catch {
    return undefined;
  }
}
