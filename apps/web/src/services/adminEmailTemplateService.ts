import {
  apiRequest,
  isApiClientError,
} from "@/services/apiClient";

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
  rowVersion: string | null
) {
  return apiRequest<AdminEmailTemplate>(
    `/api/v1/admin/email-templates/${encodeURIComponent(messageType)}`,
    {
      method: "PUT",
      body: {
        isEnabled,
        rowVersion: rowVersion?.trim() || null,
      },
    }
  );
}

export function getEmailTemplateErrorMessage(error: unknown) {
  if (!isApiClientError(error)) {
    return "We couldn’t update this email template. Please try again.";
  }

  if (error.code === "email_template_configuration_unavailable") {
    return "Email template configuration is temporarily unavailable. The required database update has not been applied.";
  }

  if (error.code === "concurrency_conflict" || error.status === 409) {
    return "This setting was changed by another administrator. The latest value has been loaded.";
  }

  if (error.code === "not_found" || error.status === 404) {
    return "This email template is not supported.";
  }

  if (error.code === "validation_failed" || error.status === 400) {
    return "The request is incomplete. Refresh the page and try again.";
  }

  if (error.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (error.status === 403) {
    return "You do not have permission to change email templates.";
  }

  if (error.status === 0) {
    return "We couldn’t connect right now. Please check your connection and try again.";
  }

  return "We couldn’t update this email template. Please try again.";
}
