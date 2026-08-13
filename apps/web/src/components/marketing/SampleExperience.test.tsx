// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(() => false),
  load: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/services/sampleExperienceService", () => ({
  getPublicSampleExperience: mocks.load,
}));
vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: mocks.authenticated,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { SampleExperience } from "./SampleExperience";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.authenticated.mockReturnValue(false);
});

const configuredPet = {
  available: true,
  pet: {
    name: "Princess Buttercup the Third",
    species: "Dog",
    breed: "Poodle",
    ageDisplayLabel: "2 years old",
    bio: "Friendly and fond of long walks.",
    profilePhotoUrl: "/pets/buttercup.jpg",
    publicSlug: "princess-buttercup",
    publicCode: "PUB999",
    safetyCode: "SAFE999",
  },
};

describe("SampleExperience", () => {
  it("uses only the configured pet's approved public projection", async () => {
    mocks.load.mockResolvedValue(configuredPet);

    const { container } = render(<SampleExperience />);

    expect(
      await screen.findByRole("heading", {
        name: "Princess Buttercup the Third's mini website",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Found Princess Buttercup the Third?",
      })
    ).toBeTruthy();
    expect(container.querySelector("#public-share-profile")).toBeTruthy();
    expect(container.querySelector("#safety-profile")).toBeTruthy();
    expect(container.textContent).not.toContain("owner@example.com");
    expect(container.textContent).not.toContain("PUB999");
    expect(container.textContent).not.toContain("SAFE999");
    expect(container.innerHTML).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
  });

  it("provides the complete generic journey when sample configuration is missing", async () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });

    render(<SampleExperience />);

    expect(
      await screen.findByRole("heading", { name: "Topu's mini website" })
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Found Topu?" })).toBeTruthy();
    expect(
      screen.getByText("Curious, friendly, and always looking for treats.")
    ).toBeTruthy();
    expect(screen.getByText("Public moments and life timeline")).toBeTruthy();
    expect(screen.getByText("No full owner address shown")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create Your Pet's Profile" })
    ).toBeTruthy();
  });

  it("fails safely into the same complete journey when configuration is invalid", async () => {
    mocks.load.mockRejectedValue(new Error("invalid selection"));

    render(<SampleExperience />);

    expect(
      await screen.findByRole("heading", { name: "Topu's mini website" })
    ).toBeTruthy();
    expect(screen.queryByText(/invalid selection/i)).toBeNull();
    expect(screen.queryByText(/check again soon/i)).toBeNull();
  });

  it("sends an anonymous visitor from the single acquisition CTA to sign in and create", async () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
    render(<SampleExperience />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Create Your Pet's Profile" })
    );

    expect(mocks.push).toHaveBeenCalledWith("/login?redirect=%2Fpets%2Fnew");
    expect(
      screen.getAllByRole("button", { name: "Create Your Pet's Profile" })
    ).toHaveLength(1);
  });
});
