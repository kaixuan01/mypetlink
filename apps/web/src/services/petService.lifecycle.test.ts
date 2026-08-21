// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import {
  getPetById,
  updatePet,
  updatePetLifecycle,
} from "@/services/petService";
import type { Pet } from "@/types";

const petId = mockPets[0].id;

async function saveProfileWithoutLifecycleChange(pet: Pet) {
  return updatePet(pet.id, {
    name: `${pet.name} updated`,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("local preview lifecycle ownership", () => {
  it("keeps an Active pet Active after a normal profile edit", async () => {
    const pet = (await getPetById(petId)).data;
    expect(pet).not.toBeNull();

    const saved = await saveProfileWithoutLifecycleChange(pet!);

    expect(saved.data?.lifecycleStatus).toBe("Active");
    expect(saved.data?.memorial).toEqual(pet!.memorial);
  });

  it("updates existing Memorial details without changing Memorial status", async () => {
    const memorial = {
      passedAwayDate: "15 Sep 2025",
      memorialMessage: "Always loved and remembered.",
      showMemorialOnPublicProfile: false,
    };
    await updatePetLifecycle(petId, "Memorial", memorial);
    const pet = (await getPetById(petId)).data;
    expect(pet).not.toBeNull();

    const saved = await saveProfileWithoutLifecycleChange(pet!);
    const details = await updatePetLifecycle(petId, "Memorial", memorial);

    expect(saved.data?.lifecycleStatus).toBe("Memorial");
    expect(details.data?.lifecycleStatus).toBe("Memorial");
    expect(details.data?.memorial).toEqual(memorial);
  });

  it("keeps an Archived pet Archived after a normal profile edit", async () => {
    await updatePetLifecycle(petId, "Archived");
    const pet = (await getPetById(petId)).data;
    expect(pet).not.toBeNull();

    const saved = await saveProfileWithoutLifecycleChange(pet!);

    expect(saved.data?.lifecycleStatus).toBe("Archived");
    expect(saved.data?.previousLifecycleStatus).toBe("Active");
    expect(saved.data?.memorial).toEqual(pet!.memorial);
  });
});
