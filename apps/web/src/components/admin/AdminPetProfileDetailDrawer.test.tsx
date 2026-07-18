// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminPetProfile, AdminPetProfileDetail } from "@/services/adminPetProfileService";
import { AdminPetProfileDetailDrawer } from "./AdminPetProfileDetailDrawer";

const mocks = vi.hoisted(() => ({ getDetail: vi.fn() }));

vi.mock("@/services/adminPetProfileService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminPetProfileService")>();
  return { ...actual, getAdminPetProfileDetail: mocks.getDetail };
});

const pet: AdminPetProfile = {
  id: "pet-1",
  name: "Topu",
  species: "Cat",
  breed: "Domestic Shorthair",
  gender: "Male",
  ageMode: "Exact birthday",
  ageDisplay: "4 years old",
  ownerId: "owner-1",
  ownerName: "Aina Owner",
  ownerEmail: "aina@example.com",
  lifecycle: "Active",
  lostModeEnabled: true,
  lostLastSeenDateTime: "2026-07-16T07:42:00Z",
  publicProfileEnabled: true,
  publicProfileAccessible: true,
  publicProfileSetupIssue: false,
  publicSlug: "topu-publiccode",
  publicCode: "publiccode",
  profileTheme: "mint",
  qrSafetyEnabled: true,
  qrSafetyAccessible: true,
  qrSafetySetupIssue: false,
  safetyCode: "safetycode",
  hasFinderContact: true,
  hasAllergies: true,
  showAllergiesPublicly: false,
  activeSmartTagCount: 1,
  totalSmartTagCount: 1,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-16T07:42:00Z",
};

const detail: AdminPetProfileDetail = {
  pet,
  color: "Orange",
  birthday: "2022-01-19",
  adoptionDay: "2022-02-20",
  generalArea: "Ampang",
  ownerPhone: "+60110000001",
  finderOwnerName: "Aina",
  finderPhone: "+60110000001",
  showOwnerName: true,
  showGeneralArea: true,
  showPhone: true,
  showWhatsapp: false,
  showEmergencyNote: true,
  showHealthSummary: false,
  showAllergiesOnPublicProfile: false,
  allergies: ["Penicillin", "Fish"],
  safetyNote: "Approach slowly",
  emergencyNote: "Call vet",
  lostLastSeenArea: "Ampang",
  lostMessage: "Please help Topu get home.",
  lostRewardNote: "RM50 reward offered",
  lostContactInstructions: "Please call instead of messaging.",
  showMemorialOnPublicProfile: false,
  smartTags: [{
    id: "tag-1",
    tagCode: "MPL-TOPU",
    hasNfc: true,
    variant: "Lightweight",
    status: "Active",
    isArchived: false,
  }],
  history: [{
    action: "pet-profiles.support-note",
    actorType: "Admin",
    actorName: "Support Admin",
    detail: "Owner verified identity",
    createdAt: "2026-07-16T08:00:00Z",
  }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminPetProfileDetailDrawer", () => {
  it("shows safe support details, human dates, allergies, and valid route actions", async () => {
    mocks.getDetail.mockResolvedValue(detail);
    render(<AdminPetProfileDetailDrawer onClose={vi.fn()} summary={pet} />);

    const dialog = await screen.findByRole("dialog", { name: "Pet profile details for Topu, owned by Aina Owner" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Penicillin")).toBeTruthy();
    expect(screen.getByText("Fish")).toBeTruthy();
    expect(screen.getByText("RM50 reward offered")).toBeTruthy();
    expect(screen.getByText("Please call instead of messaging.")).toBeTruthy();
    expect(screen.queryByText("2026-07-16T07:42:00Z")).toBeNull();
    expect(screen.getByRole("link", { name: "Open Public Share Profile" }).getAttribute("href")).toBe("/p/topu-publiccode");
    expect(screen.getByRole("link", { name: "Open Safety Profile" }).getAttribute("href")).toBe("/q/safetycode");
    expect(screen.getByRole("link", { name: "View Smart Tags" }).getAttribute("href")).toBe("/admin/tags?pet=pet-1");
    expect(screen.getByText("Owner verified identity")).toBeTruthy();
  });

  it("hides broken public actions and explains setup issues", async () => {
    const broken = {
      ...pet,
      publicProfileAccessible: false,
      publicProfileSetupIssue: true,
      qrSafetyAccessible: false,
      qrSafetySetupIssue: true,
      safetyCode: undefined,
    };
    mocks.getDetail.mockResolvedValue({ ...detail, pet: broken });
    render(<AdminPetProfileDetailDrawer onClose={vi.fn()} summary={broken} />);

    await screen.findByText("The profile is enabled but its lifecycle or route identity prevents access. No public action is shown.");
    expect(screen.queryByRole("link", { name: "Open Public Share Profile" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open Safety Profile" })).toBeNull();
  });

  it("traps focus, closes with Escape, and restores focus", async () => {
    mocks.getDetail.mockResolvedValue(detail);
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const view = render(<AdminPetProfileDetailDrawer onClose={onClose} summary={pet} />);

    const close = await screen.findByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
