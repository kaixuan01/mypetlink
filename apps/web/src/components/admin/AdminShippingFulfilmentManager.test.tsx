// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ShippingCourier,
  ShippingFulfilmentConfiguration,
} from "@/services/adminShippingFulfilmentService";
import { AdminShippingFulfilmentManager } from "./AdminShippingFulfilmentManager";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  updateSettings: vi.fn(),
  createCourier: vi.fn(),
  updateCourier: vi.fn(),
  setActive: vi.fn(),
  setDefault: vi.fn(),
}));

vi.mock("@/services/adminShippingFulfilmentService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/adminShippingFulfilmentService")
  >();
  return {
    ...actual,
    getShippingFulfilmentConfiguration: mocks.get,
    updateShippingSettings: mocks.updateSettings,
    createShippingCourier: mocks.createCourier,
    updateShippingCourier: mocks.updateCourier,
    setShippingCourierActive: mocks.setActive,
    setDefaultShippingCourier: mocks.setDefault,
  };
});

const courier: ShippingCourier = {
  id: "courier-1",
  code: "JNT",
  displayName: "J&T Express",
  isActive: true,
  isDefault: true,
  trackingUrlTemplate: null,
  displayOrder: 10,
  internalNotes: null,
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:00:00Z",
  updatedBy: null,
  rowVersion: "AQ==",
};

const configuration: ShippingFulfilmentConfiguration = {
  settings: {
    senderName: "",
    companyName: null,
    senderPhone: "",
    senderEmail: null,
    addressLine1: "",
    addressLine2: null,
    city: "",
    postcode: "",
    stateCode: "",
    country: "Malaysia",
    defaultParcelWeightKg: 0.5,
    defaultParcelLengthCm: 18,
    defaultParcelWidthCm: 12,
    defaultParcelHeightCm: 3,
    customerTrackingLinksEnabled: false,
    senderConfigured: false,
    updatedAt: "2026-07-30T00:00:00Z",
    updatedBy: null,
    rowVersion: "AQ==",
  },
  couriers: [courier],
  malaysiaStates: [{ code: "KUL", name: "Kuala Lumpur" }],
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.get.mockResolvedValue(configuration);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminShippingFulfilmentManager", () => {
  it("loads separate sender, parcel and courier sections with safe defaults", async () => {
    render(<AdminShippingFulfilmentManager />);

    expect(await screen.findByRole("heading", { name: "Sender / return address" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Parcel defaults" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Courier providers" })).toBeTruthy();
    expect(screen.getByText("Needs setup")).toBeTruthy();
    expect(screen.getByDisplayValue("0.5")).toBeTruthy();
    expect(screen.getByText("J&T Express")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
  });

  it("saves sender and parcel settings with a loading-safe RowVersion", async () => {
    const saved = {
      ...configuration.settings,
      senderName: "MyPetLink Fulfilment",
      senderConfigured: true,
      rowVersion: "Ag==",
    };
    mocks.updateSettings.mockResolvedValue(saved);
    render(<AdminShippingFulfilmentManager />);

    const senderName = await screen.findByLabelText("Sender name *");
    fireEvent.change(senderName, { target: { value: "MyPetLink Fulfilment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save sender and parcel settings" }));

    await screen.findByText("Shipping and fulfilment settings saved.");
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        senderName: "MyPetLink Fulfilment",
        defaultParcelWeightKg: 0.5,
        customerTrackingLinksEnabled: false,
        rowVersion: "AQ==",
      })
    );
  });

  it("deactivates without deleting and can change the default courier", async () => {
    const inactive = { ...courier, isActive: false, isDefault: false, rowVersion: "Ag==" };
    mocks.setActive.mockResolvedValue(inactive);
    render(<AdminShippingFulfilmentManager />);

    const card = (await screen.findByText("J&T Express")).closest("article");
    if (!card) throw new Error("Courier card missing.");
    fireEvent.click(within(card).getByRole("button", { name: "Deactivate" }));

    await screen.findByText("Courier deactivated.");
    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.setActive).toHaveBeenCalledWith(courier, false);
    expect(screen.getByText("Inactive")).toBeTruthy();
  });
});
