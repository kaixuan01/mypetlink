import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  getEmailTemplateErrorMessage,
  setEmailTemplateEnabled,
} from "@/services/adminEmailTemplateService";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return {
    ...actual,
    apiRequest: mocks.apiRequest,
  };
});

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockResolvedValue({ data: undefined });
});

describe("adminEmailTemplateService", () => {
  it("sends one JSON object and normalizes an empty first-enable RowVersion to null", async () => {
    await setEmailTemplateEnabled("OwnerWelcome", true, "");

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/v1/admin/email-templates/OwnerWelcome",
      {
        method: "PUT",
        body: {
          isEnabled: true,
          rowVersion: null,
        },
      }
    );
  });

  it("preserves the current RowVersion for an existing-row update", async () => {
    await setEmailTemplateEnabled("PaymentConfirmed", false, "AQIDBA==");

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/v1/admin/email-templates/PaymentConfirmed",
      {
        method: "PUT",
        body: {
          isEnabled: false,
          rowVersion: "AQIDBA==",
        },
      }
    );
  });

  it.each([
    [
      new ApiClientError(400, "validation_failed", "Please check the submitted fields."),
      "The request is incomplete. Refresh the page and try again.",
    ],
    [
      new ApiClientError(409, "concurrency_conflict", "Conflict"),
      "This setting was changed by another administrator. The latest value has been loaded.",
    ],
    [
      new ApiClientError(503, "email_template_configuration_unavailable", "Unavailable"),
      "Email template configuration is temporarily unavailable. The required database update has not been applied.",
    ],
    [
      new ApiClientError(404, "not_found", "Not found"),
      "This email template is not supported.",
    ],
    [
      new ApiClientError(401, "unauthorized", "Authentication is required."),
      "Your session has expired. Please sign in again.",
    ],
    [
      new ApiClientError(403, "forbidden", "Admin access is required."),
      "You do not have permission to change email templates.",
    ],
    [
      new ApiClientError(500, "server_error", "Internal details"),
      "We couldn’t update this email template. Please try again.",
    ],
    [
      new ApiClientError(0, "network_error", "Failed to fetch"),
      "We couldn’t connect right now. Please check your connection and try again.",
    ],
  ])("maps API failures to safe actionable Admin copy", (error, expected) => {
    expect(getEmailTemplateErrorMessage(error)).toBe(expected);
  });
});
