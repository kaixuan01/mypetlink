// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSmartTagDetailDrawer } from "./AdminSmartTagDetailDrawer";
import type { AdminSmartTag } from "@/services/adminSmartTagService";
import * as adminSmartTagService from "@/services/adminSmartTagService";

vi.mock("@/components/qr/QrCodeButton", () => ({
  QrCodeButton: ({ label, targetPath }: { label: string; targetPath: string }) => <button data-target={targetPath} type="button">{label}</button>,
}));

const tag: AdminSmartTag = {
  id: "tag-1",
  tagCode: "MPL-TEST-0001",
  hasNfc: true,
  variant: "Lightweight",
  status: "Active",
  isArchived: false,
  petName: "Topu",
  petId: "pet-1",
  safetyCode: "safe-topu",
  qrSafetyEnabled: true,
  ownerName: "Aina",
  ownerId: "owner-1",
  ownerEmail: "aina@example.com",
  orderId: "order-1",
  orderNumber: "MPL-1001",
  activatedAt: "2026-07-01T02:00:00Z",
  lastScannedAt: "2026-07-10T02:00:00Z",
  scanCount: 3,
  createdAt: "2026-06-01T02:00:00Z",
  updatedAt: "2026-07-10T02:00:00Z",
};

afterEach(() => cleanup());

describe("AdminSmartTagDetailDrawer", () => {
  it("uses accurate public-page labels and readable detail values", () => {
    render(<AdminSmartTagDetailDrawer busy={false} onAction={vi.fn()} onAssignmentAction={vi.fn()} onClose={vi.fn()} tag={tag} />);

    expect(screen.getByRole("link", { name: "Open QR Scan Page" }).getAttribute("href")).toBe("/q/MPL-TEST-0001");
    expect(screen.getByRole("button", { name: "Show Tag QR" }).getAttribute("data-target")).toBe("/q/MPL-TEST-0001");
    expect(screen.getByRole("link", { name: "Open NFC Tap Page" }).getAttribute("href")).toBe("/n/MPL-TEST-0001");
    expect(screen.getByRole("link", { name: "Open Legacy Tag Link" }).getAttribute("href")).toBe("/t/MPL-TEST-0001");
    expect(screen.getByRole("link", { name: "Open Safety Profile" }).getAttribute("href")).toBe("/q/safe-topu");
    expect(screen.queryByRole("button", { name: "QR" })).toBeNull();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("2026-07-10T02:00:00Z")).toBeNull();
  });

  it("shows and filters source-attributed scan history", async () => {
    vi.spyOn(adminSmartTagService, "getAdminSmartTagScans").mockResolvedValue([
      {
        id: "scan-1",
        scanSource: "Nfc",
        resolvedState: "Active",
        scannedAt: "2026-07-10T02:00:00Z",
      },
    ]);
    render(<AdminSmartTagDetailDrawer busy={false} onAction={vi.fn()} onAssignmentAction={vi.fn()} onClose={vi.fn()} tag={tag} />);

    fireEvent.click(screen.getByRole("button", { name: "View scan history" }));
    expect(await screen.findByText(/NFC tap · Active/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Scan source"), {
      target: { value: "Nfc" },
    });

    await waitFor(() =>
      expect(adminSmartTagService.getAdminSmartTagScans).toHaveBeenLastCalledWith(
        tag.id,
        "Nfc",
        expect.any(AbortSignal)
      )
    );
  });

  it("only exposes lifecycle actions valid for the current state", () => {
    const onAction = vi.fn();
    const onAssignmentAction = vi.fn();
    const { rerender } = render(<AdminSmartTagDetailDrawer busy={false} onAction={onAction} onAssignmentAction={onAssignmentAction} onClose={vi.fn()} tag={tag} />);
    fireEvent.click(screen.getByRole("button", { name: "Disable Tag" }));
    expect(onAction).toHaveBeenCalledWith("disable");
    fireEvent.click(screen.getByRole("button", { name: "Change assigned pet" }));
    expect(onAssignmentAction).toHaveBeenCalledWith("change-pet");

    rerender(<AdminSmartTagDetailDrawer busy={false} onAction={onAction} onAssignmentAction={vi.fn()} onClose={vi.fn()} tag={{ ...tag, status: "Replaced" }} />);
    expect(screen.queryByRole("button", { name: "Disable Tag" })).toBeNull();
  });

  it("hides a broken QR Safety action when no active safety identifier exists", () => {
    render(<AdminSmartTagDetailDrawer busy={false} onAction={vi.fn()} onAssignmentAction={vi.fn()} onClose={vi.fn()} tag={{ ...tag, safetyCode: undefined, qrSafetyEnabled: false }} />);
    expect(screen.queryByRole("link", { name: "Open Safety Profile" })).toBeNull();
  });

  it("does not advertise NFC for a QR-only SKU", () => {
    render(<AdminSmartTagDetailDrawer busy={false} onAction={vi.fn()} onAssignmentAction={vi.fn()} onClose={vi.fn()} tag={{ ...tag, hasNfc: false }} />);

    expect(screen.queryByRole("link", { name: "Open NFC Tap Page" })).toBeNull();
    expect(screen.queryByText("NFC taps")).toBeNull();
  });
});
