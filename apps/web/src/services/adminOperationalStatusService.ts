import { apiRequest } from "@/services/apiClient";

export type AdminOperationalStatus = {
  email: {
    globalDeliveryEnabled: boolean;
    smtpConfigured: boolean;
    templateConfigurationAvailable: boolean;
    enabledTemplateCount: number;
    outboxPendingCount: number;
    outboxPausedByGlobalSwitchCount: number;
    outboxSuppressedCount: number;
    outboxFailedCount: number;
    lastSuccessfulDeliveryAt: string | null;
  };
  storage: {
    provider: string;
    configurationComplete: boolean;
    usesManagedStorage: boolean;
  };
  publicRouting: {
    publicSiteBaseUrlConfigured: boolean;
    smartTagLinkGenerationAvailable: boolean;
  };
  ordering: {
    orderingEnabled: boolean;
    activeDeliveryZoneCount: number;
    checkoutAvailable: boolean;
  };
};

export function getOperationalStatus() {
  return apiRequest<AdminOperationalStatus>("/api/v1/admin/operational-status");
}
