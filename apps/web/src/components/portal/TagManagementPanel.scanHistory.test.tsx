// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { PetTag, TagScanHistory } from "@/types";

const mocks = vi.hoisted(() => ({
  getAllTags: vi.fn(),
  getPetTags: vi.fn(),
  getOrders: vi.fn(),
  getPets: vi.fn(),
  getTagScanHistory: vi.fn(),
  getOwnerPlanSummary: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/features", () => ({ smartTagOrderingEnabled: false }));
vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/ownerProfileService", () => ({
  getOwnerPlanSummary: (...args: unknown[]) => mocks.getOwnerPlanSummary(...args),
}));
vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return {
    ...original,
    getAllTags: (...args: unknown[]) => mocks.getAllTags(...args),
    getPetTags: (...args: unknown[]) => mocks.getPetTags(...args),
    getOrders: (...args: unknown[]) => mocks.getOrders(...args),
    getTagScanHistory: (...args: unknown[]) => mocks.getTagScanHistory(...args),
  };
});

const { TagManagementPanel } = await import("./TagManagementPanel");

const tag: PetTag = {
  id: "tag-activity-1",
  tagCode: "MPL-ACTIVITY-01",
  petId: mockPets[0].id,
  ownerUserId: "owner-1",
  hasNfc: true,
  variant: "Standard",
  status: "Active",
  activatedAt: "10 Sep 2026",
  lastScannedAt: "11 Sep 2026, 10:34",
  lastScanSource: "Nfc",
  qrScansLast30Days: 14,
  nfcTapsLast30Days: 16,
};

function history(
  items: TagScanHistory["items"],
  overrides: Partial<TagScanHistory> = {}
): TagScanHistory {
  return {
    items,
    total: items.length,
    qrScans: items.filter((item) => item.scanSource === "Qr").length,
    nfcTaps: items.filter((item) => item.scanSource === "Nfc").length,
    legacyOrUnknown: items.filter(
      (item) => item.scanSource !== "Qr" && item.scanSource !== "Nfc"
    ).length,
    page: 1,
    pageSize: 20,
    hasMore: false,
    ...overrides,
  };
}

async function renderPanel(scanHistoryDays: number, tags: PetTag[] = [tag]) {
  mocks.getAllTags.mockResolvedValue({ data: tags });
  mocks.getPetTags.mockResolvedValue({ data: tags });
  mocks.getOwnerPlanSummary.mockResolvedValue({
    planName: scanHistoryDays ? "Premium Plan" : "Free Plan",
    planStatus: scanHistoryDays ? "ComingSoon" : "Available",
    maxPets: 3,
    maxMemoriesPerPet: 10,
    scanHistoryDays,
  });
  render(<TagManagementPanel initialTags={tags} pets={mockPets} />);
  await screen.findByText(tags[0].tagCode);
  await waitFor(() => expect(mocks.getOwnerPlanSummary).toHaveBeenCalled());
}

beforeEach(() => {
  mocks.getAllTags.mockResolvedValue({ data: [tag] });
  mocks.getPetTags.mockResolvedValue({ data: [tag] });
  mocks.getOrders.mockResolvedValue({ data: [] });
  mocks.getPets.mockResolvedValue({ data: mockPets });
  mocks.getTagScanHistory.mockResolvedValue(history([]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("owner Smart Tag activity", () => {
  it("keeps Free activity useful and compact without fetching full history", async () => {
    await renderPanel(0);

    expect(screen.getByRole("heading", { name: "Tag activity" })).toBeTruthy();
    expect(screen.getByText("11 Sep 2026, 10:34 · NFC")).toBeTruthy();
    expect(screen.getByText("14 QR · 16 NFC")).toBeTruthy();
    expect(screen.getByText(/Premium is coming soon/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "View Scan History — Premium coming soon" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(screen.queryByText("NFC tap")).toBeNull();
    expect(screen.queryByText(/Legacy/)).toBeNull();
    expect(mocks.getTagScanHistory).not.toHaveBeenCalled();
  });

  it("shows a useful empty activity state without opening or fetching history", async () => {
    await renderPanel(0, [
      {
        ...tag,
        id: "tag-never-scanned",
        tagCode: "MPL-NO-SCANS",
        lastScannedAt: undefined,
        lastScanSource: undefined,
        qrScansLast30Days: 0,
        nfcTapsLast30Days: 0,
      },
    ]);

    expect(screen.getByText("No scans yet")).toBeTruthy();
    expect(screen.getByText("0 QR · 0 NFC")).toBeTruthy();
    expect(mocks.getTagScanHistory).not.toHaveBeenCalled();
  });

  it("opens Premium history in a dialog and presents legacy rows generically", async () => {
    mocks.getTagScanHistory.mockResolvedValue(
      history([
        {
          id: "scan-nfc",
          scanSource: "Nfc",
          resolvedState: "Active",
          scannedAt: "2026-09-11T02:34:00Z",
          city: "Kuala Lumpur",
          deviceType: "Phone",
        },
        {
          id: "scan-legacy",
          scanSource: "Legacy",
          resolvedState: "Active",
          scannedAt: "2026-09-10T14:14:00Z",
        },
      ])
    );
    await renderPanel(365);

    expect(screen.queryByText("NFC tap")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Scan History" }));

    expect(await screen.findByRole("dialog", { name: "Scan history" })).toBeTruthy();
    expect(await screen.findByText("NFC tap")).toBeTruthy();
    expect(screen.getByText("Other scan")).toBeTruthy();
    expect(screen.queryByText(/Legacy/)).toBeNull();
    expect(screen.queryByText("Kuala Lumpur")).toBeNull();
    expect(screen.queryByText("Phone")).toBeNull();
  });

  it("renders a single QR scan as an owner-friendly activity row", async () => {
    mocks.getTagScanHistory.mockResolvedValue(
      history([
        {
          id: "scan-only",
          scanSource: "Qr",
          resolvedState: "Active",
          scannedAt: "2026-09-11T02:34:00Z",
        },
      ])
    );
    await renderPanel(365);
    fireEvent.click(screen.getByRole("button", { name: "View Scan History" }));

    expect(await screen.findByText("Showing 1 of 1 scans")).toBeTruthy();
    expect(screen.getByText("QR scan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("supports empty history, owner-safe filtering, and paginated loading", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      id: `scan-${index}`,
      scanSource: (index % 2 ? "Nfc" : "Qr") as "Qr" | "Nfc",
      resolvedState: "Active",
      scannedAt: `2026-09-11T${String(index).padStart(2, "0")}:00:00Z`,
    }));
    mocks.getTagScanHistory
      .mockResolvedValueOnce(history([], { total: 0 }))
      .mockResolvedValueOnce(history(firstPage, { total: 21, hasMore: true }))
      .mockResolvedValueOnce(
        history(
          [
            {
              id: "scan-20",
              scanSource: "Qr",
              resolvedState: "Active",
              scannedAt: "2026-09-10T01:00:00Z",
            },
          ],
          { total: 21, page: 2 }
        )
      );
    await renderPanel(365);
    fireEvent.click(screen.getByRole("button", { name: "View Scan History" }));
    expect(await screen.findByRole("heading", { name: "No scans yet" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    expect(await screen.findByText("Showing 20 of 21 scans")).toBeTruthy();
    expect(mocks.getTagScanHistory).toHaveBeenLastCalledWith(tag.id, "Qr", 1, 20);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 21 of 21 scans")).toBeTruthy();
    expect(mocks.getTagScanHistory).toHaveBeenLastCalledWith(tag.id, "Qr", 2, 20);
  });
});
