import { apiRequest } from "@/services/apiClient";

export type AdminEmailTemplate = {
  messageType: string;
  displayName: string;
  description: string;
  isEnabled: boolean;
  enabledFromUtc: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  eligibleCount: number;
  pausedCount: number;
  blockedCount: number;
  suppressedCount: number;
  failedCount: number;
  sentCount: number;
  rowVersion: string;
};

export type AdminEmailGlobalState = {
  globalDeliveryEnabled: boolean;
  smtpConfigured: boolean;
  provider: string;
};

export type AdminEmailTemplateList = {
  templates: AdminEmailTemplate[];
  global: AdminEmailGlobalState;
};

export function listEmailTemplates() {
  return apiRequest<AdminEmailTemplateList>("/api/v1/admin/email-templates");
}

export function setEmailTemplateEnabled(
  messageType: string,
  isEnabled: boolean,
  rowVersion: string
) {
  return apiRequest<AdminEmailTemplate>(
    `/api/v1/admin/email-templates/${encodeURIComponent(messageType)}`,
    { method: "PUT", body: JSON.stringify({ isEnabled, rowVersion }) }
  );
}
