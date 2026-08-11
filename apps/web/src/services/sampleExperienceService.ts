import { apiRequest, isApiClientError } from "@/services/apiClient";

export type PublicSamplePet = {
  name: string;
  species: string;
  breed: string | null;
  ageDisplayLabel: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  publicSlug: string;
  publicCode: string;
  safetyCode: string;
};

export type PublicSampleExperience = {
  available: boolean;
  pet: PublicSamplePet | null;
};

export type AdminSamplePetOption = {
  petId: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  lifecycle: string;
  isSampleEligible: boolean;
  publicProfileAvailable: boolean;
  safetyProfileAvailable: boolean;
  canBeFeatured: boolean;
  profilePhotoUrl: string | null;
  publicSlug: string | null;
  publicCode: string | null;
  safetyCode: string | null;
};

export type AdminSampleExperience = {
  featuredSamplePetId: string | null;
  status: "Unconfigured" | "Ready" | "NeedsReplacement";
  selectedPet: AdminSamplePetOption | null;
  eligiblePets: AdminSamplePetOption[];
  updatedAt: string;
  updatedBy: string | null;
  rowVersion: string;
};

const publicEndpoint = "/api/v1/public/sample-experience";
const adminEndpoint = "/api/v1/admin/sample-experience";

export async function getPublicSampleExperience(signal?: AbortSignal) {
  const response = await apiRequest<PublicSampleExperience>(publicEndpoint, {
    auth: false,
    cache: "no-store",
    signal,
  });
  return response.data ?? { available: false, pet: null };
}

export async function getAdminSampleExperience(signal?: AbortSignal) {
  const response = await apiRequest<AdminSampleExperience>(adminEndpoint, { signal });
  if (!response.data) throw new Error("The Sample Experience response was empty.");
  return response.data;
}

export async function updateAdminSampleExperience(
  featuredSamplePetId: string | null,
  rowVersion: string
) {
  const response = await apiRequest<AdminSampleExperience>(adminEndpoint, {
    method: "PUT",
    body: { featuredSamplePetId, rowVersion },
  });
  if (!response.data) throw new Error("The Sample Experience response was empty.");
  return response.data;
}

export async function updateSamplePetEligibility(
  petId: string,
  isSampleEligible: boolean,
  rowVersion: string
) {
  return apiRequest(`/api/v1/admin/pets/${encodeURIComponent(petId)}/sample-eligibility`, {
    method: "PUT",
    body: { isSampleEligible, rowVersion },
  });
}

export function sampleExperienceError(error: unknown) {
  if (!isApiClientError(error)) return "We couldn’t save these settings. Please try again.";
  if (error.code === "concurrency_conflict" || error.status === 409) {
    return error.code === "featured_sample_pet_in_use"
      ? "Choose or clear the Featured Sample Pet before removing this approval."
      : "Another administrator changed these settings. The latest values have been loaded.";
  }
  if (error.status === 400) return error.message;
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You do not have permission to manage the Sample Experience.";
  return "We couldn’t save these settings. Please try again.";
}
