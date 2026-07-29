// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type {
  AdminEmailTemplate,
  AdminEmailTemplateList,
} from "@/services/adminEmailTemplateService";
import { AdminEmailTemplatesManager } from "./AdminEmailTemplatesManager";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  setEnabled: vi.fn(),
}));

vi.mock("@/services/adminEmailTemplateService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/adminEmailTemplateService")
  >();
  return {
    ...actual,
    listEmailTemplates: mocks.list,
    setEmailTemplateEnabled: mocks.setEnabled,
  };
});

const welcome: AdminEmailTemplate = {
  messageType: "OwnerWelcome",
  displayName: "Welcome email",
  description: "Sent after the first sign in.",
  isEnabled: false,
  enabledFromUtc: null,
  updatedAt: null,
  updatedBy: null,
  eligibleCount: 0,
  pausedCount: 0,
  blockedCount: 0,
  suppressedCount: 0,
  failedCount: 0,
  sentCount: 0,
  rowVersion: "",
};

const payment: AdminEmailTemplate = {
  ...welcome,
  messageType: "PaymentConfirmed",
  displayName: "Payment confirmation",
  description: "Sent after payment confirmation.",
};

const initialData: AdminEmailTemplateList = {
  templates: [payment, welcome],
  global: {
    globalDeliveryEnabled: true,
    smtpConfigured: true,
    provider: "Development",
  },
};

function response(data: AdminEmailTemplateList) {
  return { data };
}

async function openWelcomeConfirmation() {
  const row = (await screen.findByText("Welcome email")).closest("tr");
  if (!row) {
    throw new Error("Welcome email row was not rendered.");
  }

  fireEvent.click(within(row).getByRole("button", { name: "Turn on" }));
  const heading = screen.getByRole("heading", {
    name: "Turn on Welcome email?",
  });
  if (!heading.parentElement) {
    throw new Error("Welcome confirmation panel was not rendered.");
  }

  return within(heading.parentElement).getByRole("button", {
    name: "Turn on",
  });
}

beforeEach(() => {
  mocks.list.mockReset();
  mocks.setEnabled.mockReset();
  mocks.list.mockResolvedValue(response(initialData));
});

afterEach(() => {
  cleanup();
});

describe("AdminEmailTemplatesManager", () => {
  it("enables, refreshes the RowVersion, disables, and persists server state", async () => {
    const enabled = {
      ...welcome,
      isEnabled: true,
      enabledFromUtc: "2026-07-29T06:00:00Z",
      updatedAt: "2026-07-29T06:00:00Z",
      updatedBy: "Email Admin",
      rowVersion: "AQIDBA==",
    };
    const disabled = {
      ...enabled,
      isEnabled: false,
      enabledFromUtc: null,
      rowVersion: "BQYHCA==",
    };
    mocks.list
      .mockResolvedValueOnce(response(initialData))
      .mockResolvedValueOnce(response({ ...initialData, templates: [payment, enabled] }))
      .mockResolvedValueOnce(response({ ...initialData, templates: [payment, disabled] }));
    mocks.setEnabled
      .mockResolvedValueOnce({ data: enabled })
      .mockResolvedValueOnce({ data: disabled });

    render(<AdminEmailTemplatesManager />);
    fireEvent.click(await openWelcomeConfirmation());

    await screen.findByText(/Welcome email is now on/);
    const enabledRow = screen.getByText("Welcome email").closest("tr")!;
    expect(within(enabledRow).getByText("On")).toBeDefined();
    expect(within(enabledRow).getByText("Email Admin")).toBeDefined();

    fireEvent.click(within(enabledRow).getByRole("button", { name: "Turn off" }));
    await screen.findByText(/Welcome email is now off/);

    expect(mocks.setEnabled).toHaveBeenNthCalledWith(
      1,
      "OwnerWelcome",
      true,
      ""
    );
    expect(mocks.setEnabled).toHaveBeenNthCalledWith(
      2,
      "OwnerWelcome",
      false,
      "AQIDBA=="
    );
    expect(within(screen.getByText("Welcome email").closest("tr")!).getByText("Off"))
      .toBeDefined();
  });

  it("prevents a confirmation double-click from submitting twice and shows loading", async () => {
    let resolveUpdate:
      | ((value: { data: AdminEmailTemplate }) => void)
      | undefined;
    mocks.setEnabled.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    render(<AdminEmailTemplatesManager />);
    const confirm = await openWelcomeConfirmation();
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(mocks.setEnabled).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getAllByRole("button", { name: "Turning on..." })
        .every((button) => (button as HTMLButtonElement).disabled)
    ).toBe(true);

    resolveUpdate?.({
      data: {
        ...welcome,
        isEnabled: true,
        rowVersion: "AQIDBA==",
      },
    });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it("shows a concurrency-specific message and reloads the latest data", async () => {
    mocks.list
      .mockResolvedValueOnce(response(initialData))
      .mockResolvedValueOnce(response(initialData));
    mocks.setEnabled.mockRejectedValueOnce(
      new ApiClientError(409, "concurrency_conflict", "Conflict")
    );

    render(<AdminEmailTemplatesManager />);
    fireEvent.click(await openWelcomeConfirmation());

    await screen.findByText(
      "This setting was changed by another administrator. The latest value has been loaded."
    );
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("shows migration-specific load guidance without exposing database details", async () => {
    mocks.list.mockRejectedValueOnce(
      new ApiClientError(
        503,
        "email_template_configuration_unavailable",
        "Email template configuration is not available because the database update has not been applied."
      )
    );

    render(<AdminEmailTemplatesManager />);

    await screen.findByText(
      "Email template configuration is temporarily unavailable. The required database update has not been applied."
    );
    expect(screen.queryByText(/EmailTemplateSettings|SQL/i)).toBeNull();
  });

  it("clears an earlier validation error after a successful retry", async () => {
    const enabled = {
      ...welcome,
      isEnabled: true,
      rowVersion: "AQIDBA==",
    };
    mocks.list
      .mockResolvedValueOnce(response(initialData))
      .mockResolvedValueOnce(response({ ...initialData, templates: [payment, enabled] }));
    mocks.setEnabled
      .mockRejectedValueOnce(
        new ApiClientError(
          400,
          "validation_failed",
          "Please check the submitted fields."
        )
      )
      .mockResolvedValueOnce({ data: enabled });

    render(<AdminEmailTemplatesManager />);
    fireEvent.click(await openWelcomeConfirmation());
    await screen.findByText(
      "The request is incomplete. Refresh the page and try again."
    );

    fireEvent.click(await openWelcomeConfirmation());
    await screen.findByText(/Welcome email is now on/);
    expect(
      screen.queryByText(
        "The request is incomplete. Refresh the page and try again."
      )
    ).toBeNull();
  });
});
