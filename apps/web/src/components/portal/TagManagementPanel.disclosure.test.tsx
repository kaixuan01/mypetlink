// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { mockOrders } from "@/data/mockOrders";
import { getQrSafetyPath, ownerRoutes, tagNfcPath, tagQrPath } from "@/lib/routes";
import type { PetListItem, PetTag } from "@/types";

const mocks = vi.hoisted(() => ({
  getAllTags: vi.fn(), getPetTags: vi.fn(), getOrders: vi.fn(), getPets: vi.fn(),
  reportTagLost: vi.fn(), disableTag: vi.fn(), archiveTag: vi.fn(), restoreTag: vi.fn(),
  getFinderState: vi.fn(), getTagScanHistory: vi.fn(), push: vi.fn(), writeText: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/features", () => ({ smartTagOrderingEnabled: true, smartTagPurchaseEnabled: true }));
vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: (...args: unknown[]) => mocks.getPets(...args) }));
vi.mock("@/services/tagService", () => ({
  getAllTags: (...args: unknown[]) => mocks.getAllTags(...args),
  getPetTags: (...args: unknown[]) => mocks.getPetTags(...args),
  getOrders: (...args: unknown[]) => mocks.getOrders(...args),
  reportTagLost: (...args: unknown[]) => mocks.reportTagLost(...args),
  disableTag: (...args: unknown[]) => mocks.disableTag(...args),
  archiveTag: (...args: unknown[]) => mocks.archiveTag(...args),
  restoreTag: (...args: unknown[]) => mocks.restoreTag(...args),
  getFinderState: (...args: unknown[]) => mocks.getFinderState(...args),
  getTagScanHistory: (...args: unknown[]) => mocks.getTagScanHistory(...args),
  getFriendlyTagErrorMessage: () => "We couldn't update this tag. Please try again.",
}));

const { TagManagementPanel } = await import("./TagManagementPanel");
const tag = (id: string, petId: string, overrides: Partial<PetTag> = {}): PetTag => ({
  id, tagCode: `MPL-TEST-${id}`, petId, ownerUserId: "owner-test", hasNfc: true,
  variant: "Lightweight", status: "Active", activatedAt: "10 Oct 2026",
  lastScannedAt: "16 Oct 2026, 14:38", lastScanSource: "Qr", qrScansLast30Days: 1, nfcTapsLast30Days: 0,
  ...overrides,
});
const activeTags = [tag("AAAA", mockPets[0].id), tag("BBBB", mockPets[0].id), tag("CCCC", mockPets[1].id)];
const stateTags = [
  tag("PEND", mockPets[0].id, { status: "Delivered", activatedAt: undefined, lastScannedAt: undefined }),
  tag("DSBL", mockPets[0].id, { status: "Disabled" }),
  tag("LOST", mockPets[0].id, { status: "Lost" }),
  tag("REPL", mockPets[0].id, { status: "Replaced" }),
  tag("ARCH", mockPets[0].id, { status: "Disabled", isArchived: true }),
];
async function renderPanel(tags = [...activeTags, ...stateTags], pets: PetListItem[] = mockPets, petId?: string) {
  mocks.getAllTags.mockResolvedValue({ data: tags });
  mocks.getPetTags.mockResolvedValue({ data: tags });
  mocks.getPets.mockResolvedValue({ data: pets });
  render(<TagManagementPanel initialTags={tags} pets={pets} petId={petId} />);
  await waitFor(() => expect(screen.queryByText("Loading Smart Tags...")).toBeNull());
}
function card(item: PetTag) {
  return within(screen.getByText(item.tagCode).closest("article")!);
}
function expand(item: PetTag) {
  fireEvent.click(card(item).getByRole("button", { name: "Manage Tag & Details" }));
}
function filter(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrders.mockResolvedValue({ data: [] });
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.writeText } });
});
afterEach(cleanup);

describe("compact Smart Tag management", () => {
  it("starts every card collapsed with the pet, status, code, activity, and safe preview", async () => {
    await renderPanel();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("heading", { name: mockPets[0].name })).toHaveLength(2);
    for (const item of activeTags) {
      const content = card(item);
      const toggle = content.getByRole("button", { name: "Manage Tag & Details" });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.getElementById(toggle.getAttribute("aria-controls")!)?.hidden).toBe(true);
      expect(content.getByText("Active")).toBeTruthy();
      expect(content.getByText("QR + NFC Smart Tag · Lightweight")).toBeTruthy();
      expect(content.getByText("16 Oct 2026, 14:38 · QR")).toBeTruthy();
      expect(content.getByText("1 QR · 0 NFC")).toBeTruthy();
      expect(content.queryByRole("button", { name: "Disable Tag" })).toBeNull();
      expect(content.queryByText(/Premium/)).toBeNull();
      const pet = mockPets.find(pet => pet.id === item.petId)!;
      const preview = content.getByRole("link", { name: "View Safety Profile" });
      expect(preview.getAttribute("href")).toBe(getQrSafetyPath(pet));
      expect(preview.getAttribute("target")).toBe("_blank");
      expect(preview.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("expands independently and remembers open cards across pet and status filters", async () => {
    await renderPanel();
    expand(activeTags[0]);
    expect(card(activeTags[0]).getByRole("button", { name: "Disable Tag" })).toBeTruthy();
    expect(card(activeTags[1]).queryByRole("button", { name: "Disable Tag" })).toBeNull();
    expand(activeTags[1]);
    expand(activeTags[0]);
    expect(card(activeTags[1]).getByRole("button", { name: "Disable Tag" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: mockPets[1].id } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(card(activeTags[1]).getByRole("button", { name: "Manage Tag & Details" }).getAttribute("aria-expanded")).toBe("true");
    filter("Pending");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    filter("Inactive");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Replaced")).toBeTruthy();
    filter("Archived");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText(/Archived tags stay inactive/)).toBeTruthy();
    filter("All");
    expect(screen.getAllByRole("article")).toHaveLength(8);
    filter("Active");
    expect(card(activeTags[1]).getByRole("button", { name: "Manage Tag & Details" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("preserves distinct physical QR and NFC routes and copies without resolving a scan", async () => {
    await renderPanel([activeTags[0]]);
    const item = activeTags[0];
    expand(item);
    expect(card(item).getByRole("button", { name: "View QR Code" })).toBeTruthy();
    expect(card(item).getByRole("link", { name: "View Tag Scan Page" }).getAttribute("href")).toBe(tagQrPath(item.tagCode));
    expect(card(item).getByRole("link", { name: "Open NFC Link" }).getAttribute("href")).toBe(tagNfcPath(item.tagCode));
    fireEvent.click(card(item).getByRole("button", { name: "Copy QR Link" }));
    await screen.findByText("QR link copied.");
    expect(mocks.writeText.mock.calls[0][0]).toMatch(new RegExp(`${tagQrPath(item.tagCode)}$`));
    fireEvent.click(card(item).getByRole("button", { name: "Copy NFC Link" }));
    await screen.findByText("NFC link copied.");
    expect(mocks.writeText.mock.calls[1][0]).toMatch(new RegExp(`${tagNfcPath(item.tagCode)}$`));
    expect(mocks.getFinderState).not.toHaveBeenCalled();
    expect(mocks.getTagScanHistory).not.toHaveBeenCalled();
    expect(mocks.reportTagLost).not.toHaveBeenCalled();
    expect(mocks.disableTag).not.toHaveBeenCalled();
  });

  it("retains legacy QR-only tags without offering NFC actions", async () => {
    const item = { ...activeTags[0], hasNfc: false };
    await renderPanel([item]);
    expect(screen.getByText("QR Pet Tag · Lightweight")).toBeTruthy();
    expand(item);
    expect(screen.queryByRole("link", { name: "Open NFC Link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy NFC Link" })).toBeNull();
  });

  it("keeps pending order and physical-link actions without offering direct activation or Safety Profile", async () => {
    const item = stateTags[0];
    const order = { ...mockOrders[0], petId: item.petId!, tagId: item.id };
    mocks.getOrders.mockResolvedValue({ data: [order] });
    await renderPanel();
    filter("Pending");
    expect(card(item).getByRole("link", { name: "View Order" }).getAttribute("href"))
      .toBe(ownerRoutes.orderDetail(order.orderNumber!));
    expand(item);
    expect(card(item).getByRole("link", { name: "View Tag Scan Page" }).getAttribute("href"))
      .toBe(tagQrPath(item.tagCode));
    expect(card(item).getByRole("link", { name: "Open NFC Link" }).getAttribute("href"))
      .toBe(tagNfcPath(item.tagCode));
    expect(card(item).getByRole("button", { name: "Copy QR Link" })).toBeTruthy();
    expect(card(item).queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    expect(card(item).queryByRole("button", { name: "Activate Tag" })).toBeNull();
    expect(card(item).queryByRole("button", { name: "Disable Tag" })).toBeNull();
  });

  it.each(["Memorial", "Archived"] as const)("does not preview tags linked to a %s pet or offer disabling an already disabled tag", async lifecycleStatus => {
    await renderPanel([activeTags[0], stateTags[1]], [{ ...mockPets[0], lifecycleStatus }, mockPets[1]]);
    filter("Inactive");
    expand(stateTags[1]);
    expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    expect(card(stateTags[1]).queryByRole("button", { name: "Disable Tag" })).toBeNull();
    expect(card(stateTags[1]).getByRole("button", { name: "Archive Tag" })).toBeTruthy();
  });

  it.each(["report lost", "disable"])("requires confirmation to %s and keeps other tags intact", async action => {
    await renderPanel();
    const item = activeTags[0];
    const method = action === "disable" ? mocks.disableTag : mocks.reportTagLost;
    const label = action === "disable" ? "Disable Tag" : "Report Tag Lost";
    method.mockResolvedValue({ data: { ...item, status: action === "disable" ? "Disabled" : "Lost" } });
    expand(item);
    fireEvent.click(card(item).getByRole("button", { name: label }));
    expect(method).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(method).not.toHaveBeenCalled();
    fireEvent.click(card(item).getByRole("button", { name: label }));
    if (action === "report lost") expect(within(screen.getByRole("dialog")).getByText(/does not turn on Lost Mode/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    await waitFor(() => expect(method).toHaveBeenCalledExactlyOnceWith(item.id));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    filter("All");
    expect(card(item).getByText(action === "disable" ? "Disabled" : "Lost")).toBeTruthy();
    expect(card(activeTags[1]).getByText("Active")).toBeTruthy();
    expect(card(item).queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    expect(card(item).queryByRole("button", { name: "Disable Tag" })).toBeNull();
    expect(card(item).getByText("1 QR · 0 NFC")).toBeTruthy();
  });

  it("keeps inactive and archived controls restricted and preserves confirmation and restore", async () => {
    const item = stateTags[1];
    await renderPanel();
    filter("Inactive");
    expand(item);
    expect(card(item).queryByRole("button", { name: "Report Tag Lost" })).toBeNull();
    expect(card(item).queryByRole("button", { name: "Disable Tag" })).toBeNull();
    expect(card(item).getByRole("link", { name: "Request Replacement" }).getAttribute("href"))
      .toBe(ownerRoutes.petTagOrder(item.petId!, { replacementFor: item.id }));
    mocks.archiveTag.mockResolvedValue({ data: { ...item, isArchived: true } });
    fireEvent.click(card(item).getByRole("button", { name: "Archive Tag" }));
    expect(mocks.archiveTag).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive Tag" }));
    await waitFor(() => expect(mocks.archiveTag).toHaveBeenCalledExactlyOnceWith(item.id));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(card(item).getByRole("button", { name: "Restore to List" })).toBeTruthy();
    expect(card(item).queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    expect(card(item).queryByRole("button", { name: "Disable Tag" })).toBeNull();
    mocks.restoreTag.mockResolvedValue({ data: { ...item, isArchived: false } });
    fireEvent.click(card(item).getByRole("button", { name: "Restore to List" }));
    await waitFor(() => expect(mocks.restoreTag).toHaveBeenCalledExactlyOnceWith(item.id));
    await waitFor(() => expect(card(item).getByText("Disabled")).toBeTruthy());
    expect(card(item).queryByRole("link", { name: "View Safety Profile" })).toBeNull();
  });

  it("omits previews when the linked Safety Profile is unavailable and preserves scoped pet navigation", async () => {
    await renderPanel([activeTags[0]], [{ ...mockPets[0], qrSafetyEnabled: false }, mockPets[1]], mockPets[0].id);
    expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    expect(screen.getByRole("link", { name: "Manage Safety Profile" }).getAttribute("href"))
      .toBe(ownerRoutes.petEdit(mockPets[0].id, { tab: "contact" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: mockPets[1].id } });
    expect(mocks.push).toHaveBeenCalledWith(ownerRoutes.petTags(mockPets[1].id));
  });

  it("preserves an archived tag's previous status on restore without promising it stays disabled", async () => {
    const item = { ...activeTags[0], isArchived: true };
    await renderPanel([item]);
    filter("Archived");
    expand(item);
    expect(card(item).queryByRole("link", { name: "View Safety Profile" })).toBeNull();
    expect(card(item).getByText(/Archived tags do not show owner contact details/)).toBeTruthy();
    mocks.restoreTag.mockResolvedValue({ data: { ...item, isArchived: false } });
    fireEvent.click(card(item).getByRole("button", { name: "Restore to List" }));
    expect(await screen.findByRole("link", { name: "View Safety Profile" })).toBeTruthy();
    expect(mocks.restoreTag).toHaveBeenCalledExactlyOnceWith(item.id);
  });

  it("shows service failures without changing the tag or its counters", async () => {
    await renderPanel([activeTags[0]]);
    mocks.disableTag.mockRejectedValue(new Error("Forbidden"));
    expand(activeTags[0]);
    fireEvent.click(screen.getByRole("button", { name: "Disable Tag" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Disable Tag" }));
    expect(await screen.findByText("We couldn't update this tag. Please try again.")).toBeTruthy();
    expect(card(activeTags[0]).getByText("Active")).toBeTruthy();
    expect(card(activeTags[0]).getByText("1 QR · 0 NFC")).toBeTruthy();
  });
});
