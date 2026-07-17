import { canUseAdminApi } from "@/services/adminService";
import { apiRequest } from "@/services/apiClient";

export type AdminTagHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  detail?: string;
};

// Shared read-only audit trail for both Tag Inventory and Smart Tags details.
export async function getAdminTagHistory(tagId: string, signal?: AbortSignal): Promise<AdminTagHistoryEntry[] | null> {
  if (!canUseAdminApi()) return null;

  const response = await apiRequest<{ id: string; action: string; createdAt: string; newValue?: string | null }[]>(
    `/api/v1/admin/audit-logs?entity=SmartTag&entityId=${encodeURIComponent(tagId)}&pageSize=50`,
    { signal }
  );
  return (response.data ?? []).map((entry) => ({
    id: entry.id,
    action: entry.action,
    createdAt: entry.createdAt,
    detail: entry.newValue ?? undefined,
  }));
}
