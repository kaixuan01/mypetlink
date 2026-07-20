// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSmartTagAssignmentDialog } from "./AdminSmartTagAssignmentDialog";
import type { AdminOwner } from "@/services/adminOwnerService";
import type { AdminPetProfile } from "@/services/adminPetProfileService";
import type { AdminSmartTag } from "@/services/adminSmartTagService";

const mocks = vi.hoisted(() => ({ listOwners: vi.fn(), listPets: vi.fn() }));

vi.mock("@/services/adminOwnerService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/adminOwnerService")>()),
  listAdminOwners: mocks.listOwners,
}));
vi.mock("@/services/adminPetProfileService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/adminPetProfileService")>()),
  listAdminPetProfiles: mocks.listPets,
}));

const owner = { ownerUserId: "owner-1", displayName: "Aina Owner", email: "aina@example.com" } as AdminOwner;
const newOwner = { ownerUserId: "owner-2", displayName: "Bala Owner", email: "bala@example.com" } as AdminOwner;
const pet = { id: "pet-2", name: "Luna", species: "Dog", breed: "Poodle", ownerId: "owner-1" } as AdminPetProfile;
const currentPet = { ...pet, id: "pet-1", name: "Topu" } as AdminPetProfile;
const newOwnerPet = { ...pet, id: "pet-3", name: "Pepper", ownerId: "owner-2" } as AdminPetProfile;
const tag: AdminSmartTag = {
  id: "tag-1", tagCode: "MPL-TEST-0001", hasNfc: true, variant: "Standard", status: "Active",
  isArchived: false, ownerId: owner.ownerUserId, ownerName: owner.displayName, ownerEmail: owner.email,
  petId: "pet-1", petName: "Topu", qrSafetyEnabled: true, scanCount: 2,
  activatedAt: "2026-07-01T00:00:00Z", createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z",
};

beforeEach(() => {
  mocks.listOwners.mockResolvedValue({ items: [owner, newOwner], total: 2 });
  mocks.listPets.mockImplementation(({ ownerId }: { ownerId?: string }) => Promise.resolve({ items: ownerId === "owner-2" ? [newOwnerPet] : [currentPet, pet], total: 2 }));
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AdminSmartTagAssignmentDialog", () => {
  it("limits an ordinary pet change to the current owner's pets and excludes the current pet", async () => {
    const onSubmit = vi.fn();
    render(<AdminSmartTagAssignmentDialog action="change-pet" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} tag={tag} />);

    const petSelect = await screen.findByRole("combobox", { name: "Pet" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Luna · Dog · Poodle" })).toBeTruthy());
    expect(mocks.listPets).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-1", lifecycle: "Active" }), expect.any(AbortSignal));
    expect(screen.queryByRole("option", { name: /Topu/ })).toBeNull();

    fireEvent.change(petSelect, { target: { value: "pet-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Change assigned pet" }));
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: undefined, petId: "pet-2", reason: undefined });
  });

  it("claims an unclaimed tag by selecting an owner before that owner's pet", async () => {
    const onSubmit = vi.fn();
    render(<AdminSmartTagAssignmentDialog action="claim" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} tag={{ ...tag, status: "Unassigned", ownerId: undefined, ownerName: undefined, ownerEmail: undefined, petId: undefined, petName: undefined }} />);

    const ownerSelect = await screen.findByRole("combobox", { name: "New owner" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Aina Owner · aina@example.com" })).toBeTruthy());
    fireEvent.change(ownerSelect, { target: { value: "owner-1" } });
    const petSelect = await screen.findByRole("combobox", { name: "Pet" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Topu · Dog · Poodle" })).toBeTruthy());
    fireEvent.change(petSelect, { target: { value: "pet-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    expect(onSubmit).toHaveBeenCalledWith({ ownerId: "owner-1", petId: "pet-1", reason: undefined });
  });

  it("requires a reason and explicit acknowledgement for ownership transfer", async () => {
    const onSubmit = vi.fn();
    render(<AdminSmartTagAssignmentDialog action="transfer" busy={false} error="The tag changed." onCancel={vi.fn()} onSubmit={onSubmit} tag={tag} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Find owner" }), { target: { value: "Bala" } });
    const ownerSelect = await screen.findByRole("combobox", { name: "New owner" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Bala Owner · bala@example.com" })).toBeTruthy());
    fireEvent.change(ownerSelect, { target: { value: "owner-2" } });
    const petSelect = await screen.findByRole("combobox", { name: "New owner's pet" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Pepper · Dog · Poodle" })).toBeTruthy());
    fireEvent.change(petSelect, { target: { value: "pet-3" } });

    const submit = screen.getByRole("button", { name: "Transfer ownership" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Verified owner request" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("tag changed");
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: "owner-2", petId: "pet-3", reason: "Verified owner request" });
  });

  it("explains unassignment and requires a reason for an active tag", () => {
    const onSubmit = vi.fn();
    render(<AdminSmartTagAssignmentDialog action="unassign-pet" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} tag={tag} />);

    expect(screen.getByText(/owner keeps this tag/i)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Unassign pet" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Owner selecting another pet" } });
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: undefined, petId: undefined, reason: "Owner selecting another pet" });
  });
});
