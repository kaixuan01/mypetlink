// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type { InventoryReceipt } from "@/services/adminInventoryCostingService";
import { AdminInventoryCostingPanel } from "./AdminInventoryCostingPanel";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  options: vi.fn(),
}));

vi.mock("@/services/adminService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/adminService")>()),
  canUseAdminApi: () => true,
}));

vi.mock("@/services/adminInventoryCostingService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/adminInventoryCostingService")>()),
  createInventoryReceipt: mocks.create,
  listInventoryReceipts: mocks.list,
  listInventoryReceiptOptions: mocks.options,
}));

const variantId = "3a3a3a3a-0000-4000-8000-000000000001";
const batchId = "4b4b4b4b-0000-4000-8000-000000000002";
const batchNumber = "MPL-BAT-260911002857-1515";

function options(unreceived = 300) {
  return [{
    id: variantId,
    sku: "PAWSOME-LW-QR-NFC",
    productName: "MyPetLink Pawsome Pet Tag",
    variantName: "Lightweight",
    batches: [{ id: batchId, batchNumber, generatedQuantity: 300, unreceivedEligibleQuantity: unreceived }],
  }];
}

function receipt(overrides: Partial<InventoryReceipt> = {}): InventoryReceipt {
  return {
    id: "5c5c5c5c-0000-4000-8000-000000000003",
    receiptNumber: "MPL-STK-20261011-ABCD",
    productVariantId: variantId,
    sku: "PAWSOME-LW-QR-NFC",
    productName: "MyPetLink Pawsome Pet Tag",
    smartTagBatchId: batchId,
    batchNumber,
    quantityReceived: 300,
    receivedAt: "2026-10-11T00:00:00Z",
    purchaseCurrency: "MYR",
    exchangeRateToMyr: 1,
    costMode: "Simple",
    totalLandedCostMyr: 951.84,
    unitLandedCostMyr: 3.1728,
    rowVersion: "AAAAAAAAB9E=",
    ...overrides,
  };
}

async function fillShipmentReceipt() {
  render(<AdminInventoryCostingPanel canManageReceipts />);
  await waitFor(() => expect(screen.getByText(`${batchNumber} · 300 eligible`)).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Production batch (optional)"), { target: { value: batchId } });
  fireEvent.change(screen.getByLabelText("Quantity received"), { target: { value: "300" } });
  fireEvent.change(screen.getByLabelText("Received date"), { target: { value: "2026-10-11" } });
  fireEvent.change(screen.getByLabelText("Landed cost per tag (MYR)"), { target: { value: "3.1728" } });
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save Stock Receipt" }));

beforeEach(() => {
  mocks.create.mockReset();
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.options.mockReset().mockResolvedValue(options());
});

afterEach(() => cleanup());

describe("AdminInventoryCostingPanel stock receipts", () => {
  it("sends the shipment exactly, with no supplier, and confirms the saved receipt", async () => {
    mocks.create.mockResolvedValue(receipt());
    await fillShipmentReceipt();
    expect(screen.getByText(/RM\s?951\.84 total/)).toBeTruthy();

    save();

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(
      "MPL-STK-20261011-ABCD saved and linked to 300 serialized tag(s)."
    ));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      productVariantId: variantId,
      smartTagBatchId: batchId,
      quantityReceived: 300,
      receivedAt: "2026-10-11T00:00:00Z",
      supplierName: undefined,
      supplierReference: undefined,
      purchaseCurrency: "MYR",
      costMode: "Simple",
      unitLandedCostMyr: 3.1728,
    }));
  });

  it("keeps a saved receipt saved when the list then fails to reload", async () => {
    mocks.create.mockResolvedValue(receipt());
    await fillShipmentReceipt();
    mocks.list.mockRejectedValue(new ApiClientError(500, "server_error", "Something went wrong while processing the request."));

    save();

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(
      "MPL-STK-20261011-ABCD saved and linked to 300 serialized tag(s). The receipts list couldn't be refreshed; reload the page to see it."
    ));
  });

  it("after an unconfirmed failure, finds a receipt that did land and says not to save it again", async () => {
    mocks.create.mockRejectedValue(new ApiClientError(500, "server_error", "Something went wrong while processing the request.", null, undefined, "0HNP7REQ"));
    await fillShipmentReceipt();
    mocks.list.mockResolvedValue([receipt()]);
    mocks.options.mockResolvedValue(options(0));

    save();

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(
      "MPL-STK-20261011-ABCD was saved and linked to 300 serialized tag(s). Do not save it again."
    ));
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("after an unconfirmed failure with nothing saved, asks to check the list and shows a reference", async () => {
    mocks.create.mockRejectedValue(new ApiClientError(500, "server_error", "Something went wrong while processing the request.", null, undefined, "0HNP7REQ"));
    await fillShipmentReceipt();

    save();

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(
      "We couldn't confirm whether this stock receipt was saved. Check the receipts list before trying again. Reference: 0HNP7REQ."
    ));
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it("shows the field message from a validation refusal", async () => {
    mocks.create.mockRejectedValue(new ApiClientError(400, "validation_failed", "Please check the submitted fields.",
      { quantityReceived: ["Enter a quantity from 1 to 100,000."] }));
    await fillShipmentReceipt();

    save();

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Enter a quantity from 1 to 100,000."));
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("explains a batch that was already received", async () => {
    mocks.create.mockRejectedValue(new ApiClientError(409, "receipt_inventory_shortfall",
      `Only 0 tag(s) in batch ${batchNumber} are still without a stock receipt. If this batch was already received, it appears in the receipts list.`));
    await fillShipmentReceipt();

    save();

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain(`Only 0 tag(s) in batch ${batchNumber}`));
  });

  it("refuses more tags than the batch still has, without sending anything", async () => {
    mocks.options.mockResolvedValue(options(120));
    render(<AdminInventoryCostingPanel canManageReceipts />);
    await waitFor(() => expect(screen.getByText(`${batchNumber} · 120 eligible`)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Production batch (optional)"), { target: { value: batchId } });
    fireEvent.change(screen.getByLabelText("Quantity received"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Landed cost per tag (MYR)"), { target: { value: "3.1728" } });

    save();

    expect(screen.getByRole("status").textContent).toBe(`Batch ${batchNumber} has only 120 tag(s) without a stock receipt.`);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
