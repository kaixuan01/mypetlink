// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { deriveProfileCompletion } from "@/lib/profileCompletion";

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: mocks.trackEvent };
});

const { ProfileCompletionCard } = await import("./ProfileCompletionCard");

function completionPet(overrides = {}) {
  return {
    ...structuredClone(mockPets[0]),
    hasUsableSafetyContact: true,
    ...overrides,
  };
}

function completion(pet = completionPet(), momentCount = 0, careRecordCount = 0) {
  return deriveProfileCompletion({
    pet,
    momentCount,
    careRecordCount,
    safetyProfilesEnabled: true,
  });
}

describe("ProfileCompletionCard", () => {
  beforeEach(() => {
    mocks.trackEvent.mockReset();
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it("leads with progress and a single next step, keeping the route precise", () => {
    const pet = completionPet();
    const result = completion(pet);
    render(<ProfileCompletionCard completion={result} isFirstPet pet={pet} />);

    expect(screen.getByRole("heading", { name: "Finish Milo's profile" })).toBeTruthy();
    expect(screen.getByText(`${result.percentage}% complete`)).toBeTruthy();
    // Compact by default: one next action rather than the whole checklist.
    expect(screen.getAllByRole("link", { name: /^Add / })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Add Milo's profile photo" }).getAttribute("href")
    ).toBe("/pets/pet_milo/edit?tab=appearance");
  });

  it("expands to the full checklist without changing the percentage or routes", () => {
    const pet = completionPet();
    const result = completion(pet);
    render(<ProfileCompletionCard completion={result} isFirstPet pet={pet} />);

    const toggle = screen.getByRole("button", { name: "View all profile steps" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Same percentage, same deep links as before the redesign.
    expect(screen.getByText(`${result.percentage}% complete`)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Add Milo's first Moment" }).getAttribute("href")
    ).toBe("/pets/pet_milo/moments?edit=new");
    expect(
      screen.getByRole("link", { name: "Add Milo's first care record" }).getAttribute("href")
    ).toBe("/pets/pet_milo/records?create=1");

    fireEvent.click(screen.getByRole("button", { name: "Hide profile steps" }));
    expect(
      screen.queryByRole("link", { name: "Add Milo's first care record" })
    ).toBeNull();
  });

  it("uses neutral framing for an additional pet and supports long names", () => {
    const name = "Princess Fluffington the Third of Kuala Lumpur and Beyond";
    const pet = completionPet({ name });
    render(<ProfileCompletionCard completion={completion(pet)} pet={pet} />);
    expect(screen.getByRole("heading", { name: `Add more about ${name}` })).toBeTruthy();
  });

  it("renders no full completion card when every applicable item is complete", () => {
    const pet = completionPet({
      photoUrl: "photo.jpg",
      breed: "Poodle",
      gender: "Female",
      personalityTags: ["Playful"],
      birthday: "2023-10-12",
      bio: "Gentle and curious.",
    });
    const result = deriveProfileCompletion({
      pet,
      momentCount: 1,
      careRecordCount: 1,
      safetyProfilesEnabled: true,
    });
    expect(result.isComplete).toBe(true);

    const { container } = render(
      <ProfileCompletionCard completion={result} pet={pet} />
    );

    expect(container.querySelector('[data-profile-completion="full"]')).toBeNull();
    expect(container.innerHTML).toBe("");
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("keeps the compact incomplete indicator and completed hiding unchanged", () => {
    const pet = completionPet();
    const incompleteResult = completion(pet);
    const incompleteView = render(
      <ProfileCompletionCard compact completion={incompleteResult} pet={pet} />
    );

    expect(
      incompleteView.container.querySelector('[data-profile-completion="compact"]')
    ).toBeTruthy();
    expect(screen.getByText(`${incompleteResult.percentage}% complete`)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^Add / })).toHaveLength(1);
    incompleteView.unmount();

    const completePet = completionPet({
      photoUrl: "photo.jpg",
      breed: "Poodle",
      gender: "Female",
      personalityTags: ["Playful"],
      birthday: "2023-10-12",
      bio: "Gentle and curious.",
    });
    const completeResult = completion(completePet, 1, 1);
    const completeView = render(
      <ProfileCompletionCard compact completion={completeResult} pet={completePet} />
    );
    expect(completeView.container.innerHTML).toBe("");
  });

  it("suggests a higher-weight first Moment before missing basic information", () => {
    const pet = completionPet({
      photoUrl: "photo.jpg",
      breed: "Poodle",
      gender: "",
      personalityTags: ["Playful"],
      birthday: "2023-10-12",
      bio: "Gentle and curious.",
    });
    const result = completion(pet, 0, 1);

    render(<ProfileCompletionCard completion={result} pet={pet} />);

    expect(screen.getAllByRole("link", { name: /^Add / })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Add Milo's first Moment" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Add Milo's basic information" })
    ).toBeNull();
  });

  it("renders nothing for memorial pets", () => {
    const pet = completionPet({ lifecycleStatus: "Memorial" });
    const { container } = render(
      <ProfileCompletionCard completion={completion(pet)} pet={pet} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("fires one prompt event across ordinary rerenders and a bounded action event", () => {
    const pet = completionPet();
    const result = completion(pet);
    const view = render(<ProfileCompletionCard completion={result} pet={pet} />);
    view.rerender(<ProfileCompletionCard completion={result} pet={pet} />);
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith("completion_prompt_viewed", {
      surface: "owner_portal",
    });

    fireEvent.click(screen.getByRole("link", { name: "Add Milo's profile photo" }));
    expect(mocks.trackEvent).toHaveBeenLastCalledWith("completion_action_clicked", {
      surface: "owner_portal",
      completion_item: "photo",
    });
    expect(JSON.stringify(mocks.trackEvent.mock.calls)).not.toContain(pet.id);
    expect(JSON.stringify(mocks.trackEvent.mock.calls)).not.toContain(pet.name);
  });

  it("links a ready public profile through the canonical route", () => {
    const pet = completionPet({ photoUrl: "photo.jpg", bio: "" });
    render(
      <ProfileCompletionCard
        completion={completion(pet, 1)}
        pet={pet}
      />
    );
    const link = screen.getByRole("link", { name: "View Public Profile" });
    expect(link.getAttribute("href")).toBe("/p/milo-k7q2");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("omits the share line when public profiles are disabled", () => {
    const pet = completionPet({ photoUrl: "photo.jpg", bio: "" });
    const result = deriveProfileCompletion({
      pet,
      momentCount: 1,
      careRecordCount: 0,
      publicProfilesEnabled: false,
    });
    render(<ProfileCompletionCard completion={result} pet={pet} />);
    expect(screen.queryByRole("link", { name: "View Public Profile" })).toBeNull();
  });
});
