// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/services/sampleExperienceService", () => ({
  getPublicSampleExperience: mocks.load,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import HomePage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const milo = {
  available: true,
  pet: {
    name: "Milo",
    species: "Dog",
    breed: "Golden Retriever",
    ageDisplayLabel: "About 3 years old",
    bio: "Gentle, playful, and happiest near the garden.",
    profilePhotoUrl: "/pets/milo.jpg",
    publicSlug: "milo",
    publicCode: "PUBMILO",
    safetyCode: "SAFE-MILO",
  },
};

describe("homepage pet finder preview", () => {
  it("uses the configured pet's name, image, details, bio, and finder copy", async () => {
    mocks.load.mockResolvedValue(milo);
    render(<HomePage />);

    const preview = (await screen.findByRole("heading", { name: "Milo" })).closest("article");
    expect(preview).toBeTruthy();

    const finderOptions = within(preview!).getByLabelText("Finder contact options");
    expect(within(preview!).getByRole("img", { name: "Milo's profile" }).getAttribute("src")).toBe("/pets/milo.jpg");
    expect(within(preview!).getByText("Dog - Golden Retriever - About 3 years old")).toBeTruthy();
    expect(within(preview!).getByText("Gentle, playful, and happiest near the garden.")).toBeTruthy();
    expect(within(preview!).getByText("If someone finds Milo")).toBeTruthy();
    expect(within(finderOptions).getByText("WhatsApp owner")).toBeTruthy();
    expect(within(finderOptions).getByText("Call owner")).toBeTruthy();
    expect(
      within(preview!).getByText("Found location can be shared with the owner.")
    ).toBeTruthy();
    expect(within(preview!).queryByText("Scan to contact owner")).toBeNull();
    expect(within(finderOptions).queryByRole("button")).toBeNull();
    expect(within(finderOptions).queryByRole("link")).toBeNull();
    expect(preview!.textContent).not.toContain("Topu");
  });

  it("refreshes from one configured pet to another without carrying stale content", async () => {
    mocks.load.mockResolvedValueOnce({
      ...milo,
      pet: { ...milo.pet, name: "Pet A", profilePhotoUrl: "/pets/a.jpg" },
    });
    const first = render(<HomePage />);
    expect(await screen.findByRole("heading", { name: "Pet A" })).toBeTruthy();
    first.unmount();

    mocks.load.mockResolvedValueOnce({
      ...milo,
      pet: { ...milo.pet, name: "Pet B", bio: null, breed: null, profilePhotoUrl: null },
    });
    render(<HomePage />);
    expect(await screen.findByRole("heading", { name: "Pet B" })).toBeTruthy();
    expect(screen.queryByText("Pet A")).toBeNull();
    expect(screen.queryByText("Gentle, playful, and happiest near the garden.")).toBeNull();
    expect(screen.getByRole("img", { name: "Pet B profile photo unavailable" })).toBeTruthy();
  });

  it("falls back safely when configuration or the selected image is unavailable", async () => {
    mocks.load.mockResolvedValueOnce(milo);
    const first = render(<HomePage />);
    const image = await screen.findByRole("img", { name: "Milo's profile" });
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Milo profile photo unavailable" })).toBeTruthy();
    first.unmount();

    mocks.load.mockResolvedValueOnce({ available: false, pet: null });
    render(<HomePage />);
    expect(await screen.findByRole("heading", { name: "Your pet's shareable profile" })).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
    expect(screen.queryByText("Topu")).toBeNull();
  });

  it("routes the two homepage sample actions to their matching guided sections", async () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
    render(<HomePage />);

    expect(
      screen.getByRole("link", { name: "Explore Sample Profile" }).getAttribute("href")
    ).toBe("/sample#public-share-profile");
    expect(
      screen.getByRole("link", { name: "View Sample Safety Profile" }).getAttribute("href")
    ).toBe("/sample#safety-profile");
  });

  it("labels reminders as future functionality instead of an active promise", () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
    render(<HomePage />);

    expect(screen.getByText("Reminders coming soon")).toBeTruthy();
    expect(screen.queryByText(/we.?ll remind|automatic reminders|notify you/i)).toBeNull();
  });
});
