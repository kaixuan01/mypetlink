// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminSampleExperienceManager } from "./AdminSampleExperienceManager";

const mocks = vi.hoisted(() => ({ load: vi.fn(), update: vi.fn() }));
vi.mock("@/services/sampleExperienceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/sampleExperienceService")>();
  return { ...actual, getAdminSampleExperience: mocks.load, updateAdminSampleExperience: mocks.update };
});

const settings = {
  featuredSamplePetId: "pet-topu", status: "Ready" as const, updatedAt: "2026-08-11T00:00:00Z", updatedBy: "QA Admin", rowVersion: "AQID",
  selectedPet: null,
  eligiblePets: [
    { petId: "pet-topu", name: "Topu", ownerName: "Demo Owner", ownerEmail: "demo@example.test", lifecycle: "Active", isSampleEligible: true, publicProfileAvailable: true, safetyProfileAvailable: true, canBeFeatured: true, profilePhotoUrl: null, publicSlug: "topu", publicCode: "TOPU1", safetyCode: "SAFE1" },
    { petId: "pet-milo", name: "Milo", ownerName: "Demo Owner", ownerEmail: "demo@example.test", lifecycle: "Active", isSampleEligible: true, publicProfileAvailable: true, safetyProfileAvailable: true, canBeFeatured: true, profilePhotoUrl: null, publicSlug: "milo", publicCode: "MILO1", safetyCode: "SAFE2" },
  ],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("changes the featured sample from Topu to another eligible pet", async () => {
  mocks.load.mockResolvedValue(settings);
  mocks.update.mockResolvedValue({ ...settings, featuredSamplePetId: "pet-milo", rowVersion: "BAUG" });
  render(<AdminSampleExperienceManager />);
  const select = await screen.findByRole("combobox", { name: "Featured Sample Pet" });
  fireEvent.change(select, { target: { value: "pet-milo" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("pet-milo", "AQID"));
  expect(await screen.findByText("Featured Sample Pet saved.")).toBeTruthy();
});

it("warns when a configured pet requires replacement", async () => {
  mocks.load.mockResolvedValue({ ...settings, status: "NeedsReplacement", selectedPet: { ...settings.eligiblePets[0], canBeFeatured: false }, eligiblePets: [] });
  render(<AdminSampleExperienceManager />);
  expect((await screen.findByRole("alert")).textContent).toContain("no longer suitable");
});
