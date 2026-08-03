// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type { AdminOrderCheckoutSettings } from "@/services/adminOrderCheckoutService";
import { AdminOrderCheckoutSettingsManager } from "./AdminOrderCheckoutSettingsManager";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/services/adminOrderCheckoutService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminOrderCheckoutService")>();
  return { ...actual, getOrderCheckoutSettings: mocks.get, updateOrderCheckoutSettings: mocks.update };
});

const settings: AdminOrderCheckoutSettings = {
  paymentReservationMinutes: 120,
  minPaymentReservationMinutes: 30,
  maxPaymentReservationMinutes: 4320,
  updatedAt: "2026-08-03T12:00:00Z",
  updatedBy: "Admin One",
  rowVersion: "AQID",
  expiryWorker: { enabled: true, pollIntervalSeconds: 60, batchSize: 25 },
};

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue({ data: settings });
  mocks.update.mockReset();
});
afterEach(cleanup);

describe("AdminOrderCheckoutSettingsManager", () => {
  it("loads safe worker status and saves with the current RowVersion", async () => {
    const saved = { ...settings, paymentReservationMinutes: 180, rowVersion: "BAUG" };
    mocks.update.mockResolvedValue({ data: saved });
    render(<AdminOrderCheckoutSettingsManager />);

    expect(await screen.findByText("Enabled")).toBeTruthy();
    expect(screen.getByText("1 min")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Unpaid order reservation window"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await screen.findByText("Order checkout settings saved.");
    expect(mocks.update).toHaveBeenCalledWith(180, "AQID");
    expect((screen.getByLabelText("Unpaid order reservation window") as HTMLInputElement).value).toBe("180");
  });

  it.each(["29", "4321"])("rejects the invalid boundary %s without a request", async (value) => {
    render(<AdminOrderCheckoutSettingsManager />);
    await screen.findByText("Payment reservation");
    fireEvent.change(screen.getByLabelText("Unpaid order reservation window"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Enter between 30 minutes and 72 hours/);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reloads the latest setting after a RowVersion conflict", async () => {
    const latest = { ...settings, paymentReservationMinutes: 240, rowVersion: "LATEST" };
    mocks.get
      .mockResolvedValueOnce({ data: settings })
      .mockResolvedValueOnce({ data: latest });
    mocks.update.mockRejectedValue(new ApiClientError(409, "concurrency_conflict", "Conflict"));
    render(<AdminOrderCheckoutSettingsManager />);
    await screen.findByText("Payment reservation");
    fireEvent.change(screen.getByLabelText("Unpaid order reservation window"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText(/changed by another administrator/)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Unpaid order reservation window") as HTMLInputElement).value).toBe("240"));
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
