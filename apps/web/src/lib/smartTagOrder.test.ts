import { describe, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { ownerRoutes } from "@/lib/routes";
import {
  getEligibleSmartTagOrderPets,
  getPreferredSmartTagOrderPetId,
  resolveSmartTagOrderContinuation,
} from "@/lib/smartTagOrder";

describe("Smart Tag order routing", () => {
  it("keeps only active owner pets without requiring optional fields", () => {
    const incompleteActivePet = {
      ...mockPets[0],
      id: "pet_incomplete",
      breed: "",
      color: "",
      photoUrl: "",
      lifecycleStatus: "Active" as const,
    };
    const archivedPet = {
      ...mockPets[1],
      lifecycleStatus: "Archived" as const,
    };

    expect(
      getEligibleSmartTagOrderPets([incompleteActivePet, archivedPet])
    ).toEqual([incompleteActivePet]);
  });

  it("accepts only the exact local Smart Tag continuation", () => {
    expect(resolveSmartTagOrderContinuation(ownerRoutes.tagOrder())).toBe(
      "/tags/order"
    );
    expect(
      resolveSmartTagOrderContinuation("https://evil.example/tags/order")
    ).toBeNull();
    expect(resolveSmartTagOrderContinuation("//evil.example/tags/order")).toBeNull();
    expect(resolveSmartTagOrderContinuation("javascript:alert(1)")).toBeNull();
    expect(resolveSmartTagOrderContinuation("/tags/order?pet=other")).toBeNull();
  });

  it("reads a preferred pet only from the local order-entry query", () => {
    expect(
      getPreferredSmartTagOrderPetId("/tags/order?pet=pet_milo")
    ).toBe("pet_milo");
    expect(getPreferredSmartTagOrderPetId("not a valid url")).toBe("");
  });

  it("centralizes generic order and Add Pet continuation paths", () => {
    expect(ownerRoutes.tagOrder()).toBe("/tags/order");
    expect(ownerRoutes.tagOrder({ petId: "pet newly created" })).toBe(
      "/tags/order?pet=pet+newly+created"
    );
    expect(ownerRoutes.petNewForTagOrder()).toBe(
      "/pets/new?returnTo=%2Ftags%2Forder"
    );
  });
});
