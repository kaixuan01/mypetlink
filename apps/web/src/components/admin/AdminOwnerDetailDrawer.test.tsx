// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminOwner, AdminOwnerDetail } from "@/services/adminOwnerService";
import { AdminOwnerDetailDrawer } from "./AdminOwnerDetailDrawer";

const mocks = vi.hoisted(() => ({ getDetail: vi.fn() }));

vi.mock("@/services/adminOwnerService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminOwnerService")>();
  return { ...actual, getAdminOwnerDetail: mocks.getDetail };
});

const owner: AdminOwner = {
  ownerUserId: "92222222-2222-4222-8222-222222222222",
  displayName: "Aina Owner",
  email: "aina@example.com",
  status: "Active",
  planCode: "Free",
  planName: "Free Plan",
  profileComplete: true,
  contactReady: true,
  contactSummary: "Phone and WhatsApp · +60 •••• 3333",
  finderReadyPetCount: 1,
  finderContactIssuePetCount: 1,
  petCount: 1,
  activePetCount: 1,
  memorialPetCount: 0,
  archivedPetCount: 0,
  lostModePetCount: 1,
  orderCount: 1,
  pendingPaymentOrderCount: 1,
  pendingProofCount: 1,
  activeFulfilmentOrderCount: 0,
  deliveredOrderCount: 0,
  activeSmartTagCount: 1,
  totalSmartTagCount: 1,
  memoryCount: 9,
  maxPets: 3,
  maxMemoriesPerPet: 10,
  petUsageNearLimit: false,
  memoryUsageNearLimit: true,
  joinedAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const detail: AdminOwnerDetail = {
  owner,
  phoneE164: "+60112223333",
  whatsappE164: "+60112223333",
  defaultGeneralArea: "Ampang",
  defaultPrivacy: {
    showOwnerName: true,
    showGeneralArea: true,
    showPhone: true,
    showWhatsapp: false,
    showEmergencyNote: true,
    showCareBadges: true,
    showMoments: true,
    showTimeline: true,
    showBirthdayOnTimeline: false,
    showAdoptionDayOnTimeline: false,
    showHealthSummary: false,
    showAllergiesOnPublicProfile: false,
  },
  authenticationProviders: ["Google"],
  highestMemoriesOnPet: 9,
  memoryUsageNearLimit: true,
  pets: [{ petId: "pet-1", name: "Topu", lifecycle: "Active", lostModeEnabled: true, publicProfileSetupIssue: false, qrSafetySetupIssue: false, updatedAt: "2026-07-16T07:42:00Z" }],
  recentOrders: [{ orderId: "order-1", orderNumber: "MPL-ORDER-1", status: "PendingPayment", paymentStatus: "Pending", amount: 39, currency: "MYR", createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-16T00:00:00Z" }],
  recentPaymentProofs: [{ paymentProofId: "proof-1", orderId: "order-1", orderNumber: "MPL-ORDER-1", status: "PendingReview", submittedAt: "2026-07-16T00:00:00Z" }],
  smartTags: [{ tagId: "tag-1", tagCode: "MPL-AINA-TAG", status: "Active", isArchived: false, createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-16T00:00:00Z" }],
  history: [{ label: "owner profile updated", actor: "Owner", createdAt: "2026-07-16T00:00:00Z" }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminOwnerDetailDrawer", () => {
  it("loads full contact on demand and shows read-only privacy, usage, and related records", async () => {
    mocks.getDetail.mockResolvedValue(detail);
    render(<AdminOwnerDetailDrawer onClose={vi.fn()} summary={owner} />);

    const dialog = await screen.findByRole("dialog", { name: "Owner account details for Aina Owner, aina@example.com" });
    expect(dialog).toBeTruthy();
    expect(screen.getAllByText("+60112223333").length).toBeGreaterThan(0);
    expect(screen.getByText("Phone shown by default").parentElement?.textContent).toContain("Yes");
    expect(screen.getByText("WhatsApp shown by default").parentElement?.textContent).toContain("No");
    expect(screen.getByText("Memory usage is near the current plan limit.")).toBeTruthy();
    expect(screen.getByText("Pending Review")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all pets" }).getAttribute("href")).toBe("/admin/pets?ownerId=92222222-2222-4222-8222-222222222222");
    expect(screen.getByRole("link", { name: "View payment proofs" }).getAttribute("href")).toBe("/admin/payment-proofs?ownerId=92222222-2222-4222-8222-222222222222");
    expect(screen.queryByText("92222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("traps focus, closes with Escape, and restores focus", async () => {
    mocks.getDetail.mockResolvedValue(detail);
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const view = render(<AdminOwnerDetailDrawer onClose={onClose} summary={owner} />);

    const close = await screen.findByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
