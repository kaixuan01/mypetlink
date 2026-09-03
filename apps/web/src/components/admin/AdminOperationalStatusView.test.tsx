// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOperationalStatus } from "@/services/adminOperationalStatusService";
import { AdminOperationalStatusView } from "./AdminOperationalStatusView";

const mocks = vi.hoisted(() => ({ getStatus: vi.fn() }));

vi.mock("@/services/adminOperationalStatusService", () => ({
  getOperationalStatus: mocks.getStatus,
}));

const status: AdminOperationalStatus = {
  email: {
    globalDeliveryEnabled: true,
    smtpConfigured: true,
    operationsRecipientConfigured: false,
    templateConfigurationAvailable: true,
    enabledTemplateCount: 1,
    outboxPendingCount: 0,
    outboxPausedByGlobalSwitchCount: 0,
    outboxSuppressedCount: 1,
    outboxFailedCount: 0,
    lastSuccessfulDeliveryAt: null,
  },
  storage: {
    provider: "Cloudflare R2",
    configurationComplete: true,
    usesManagedStorage: true,
  },
  publicRouting: {
    publicSiteBaseUrlConfigured: true,
    smartTagLinkGenerationAvailable: true,
  },
  ordering: {
    orderingEnabled: false,
    activeDeliveryZoneCount: 0,
    checkoutAvailable: false,
  },
  warnings: [
    {
      code: "admin_payment_proof_recipient_unavailable",
      severity: "High",
      title: "Payment-proof alerts cannot be delivered",
      message:
        "The operations recipient is missing or invalid. Customer payment-proof submissions will continue, but Admin review alerts will be held back until this is corrected.",
    },
  ],
};

beforeEach(() => {
  mocks.getStatus.mockReset();
  mocks.getStatus.mockResolvedValue({ data: status });
});

afterEach(cleanup);

describe("AdminOperationalStatusView", () => {
  it("shows a high-priority warning without exposing configuration values", async () => {
    render(<AdminOperationalStatusView />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("High priority");
    expect(alert.textContent).toContain("Payment-proof alerts cannot be delivered");
    expect(alert.textContent).toContain("Customer payment-proof submissions will continue");
    expect(alert.textContent).not.toContain("Email:OperationsRecipient");
    expect(screen.getByText("Missing or invalid")).toBeDefined();
  });

  it("does not show a high-priority alert when the API reports no warnings", async () => {
    mocks.getStatus.mockResolvedValueOnce({
      data: {
        ...status,
        email: { ...status.email, operationsRecipientConfigured: true },
        warnings: [],
      },
    });

    render(<AdminOperationalStatusView />);

    await screen.findByText("Operations recipient");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
