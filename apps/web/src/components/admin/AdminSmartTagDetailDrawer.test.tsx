// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSmartTagDetailDrawer } from "./AdminSmartTagDetailDrawer";
import type { AdminSmartTag } from "@/services/adminSmartTagService";

vi.mock("@/components/qr/QrCodeButton", () => ({
  QrCodeButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const tag: AdminSmartTag = {
  id: "tag-1",
  tagCode: "MPL-TEST-0001",
  hasNfc: true,
  variant: "Lightweight",
  status: "Active",
  isArchived: false,
  petName: "Topu",
  safetyCode: "safe-topu",
  qrSafetyEnabled: true,
  ownerName: "Aina",
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
    render(<AdminSmartTagDetailDrawer busy={false} onAction={vi.fn()} onClose={vi.fn()} tag={tag} />);

    expect(screen.getByRole("link", { name: "Open Tag Scan Page" }).getAttribute("href")).toBe("/t/MPL-TEST-0001");
    expect(screen.getByRole("button", { name: "Show Tag QR" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Safety Profile" }).getAttribute("href")).toBe("/q/safe-topu");
    expect(screen.queryByRole("button", { name: "QR" })).toBeNull();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("2026-07-10T02:00:00Z")).toBeNull();
  });

  it("only exposes lifecycle actions valid for the current state", () => {
    const onAction = vi.fn();
    const { rerender } = render(<AdminSmartTagDetailDrawer busy={false} onAction={onAction} onClose={vi.fn()} tag={tag} />);
    fireEvent.click(screen.getByRole("button", { name: "Disable Tag" }));
    expect(onAction).toHaveBeenCalledWith("disable");

    rerender(<AdminSmartTagDetailDrawer busy={false} onAction={onAction} onClose={vi.fn()} tag={{ ...tag, status: "Replaced" }} />);
    expect(screen.queryByRole("button", { name: "Disable Tag" })).toBeNull();
  });

  it("hides a broken QR Safety action when no active safety identifier exists", () => {
    render(<AdminSmartTagDetailDrawer busy={false} onAction={vi.fn()} onClose={vi.fn()} tag={{ ...tag, safetyCode: undefined, qrSafetyEnabled: false }} />);
    expect(screen.queryByRole("link", { name: "Open Safety Profile" })).toBeNull();
  });
});
