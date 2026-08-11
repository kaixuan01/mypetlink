// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SampleExperience } from "./SampleExperience";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/services/sampleExperienceService", () => ({ getPublicSampleExperience: mocks.load }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SampleExperience", () => {
  it("uses the configured pet in both cards without exposing internal identities", async () => {
    mocks.load.mockResolvedValue({ available: true, pet: {
      name: "Princess Buttercup the Third", species: "Dog", breed: "Poodle",
      ageDisplayLabel: "2 years old", bio: "Friendly and fond of long walks.",
      profilePhotoUrl: "/pets/buttercup.jpg", publicSlug: "princess-buttercup",
      publicCode: "PUB999", safetyCode: "SAFE999",
    } });
    const { container } = render(<SampleExperience />);
    expect(await screen.findByRole("heading", { name: "Princess Buttercup the Third's mini website" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Found Princess Buttercup the Third?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Sample Public Profile" }).getAttribute("href")).toBe("/p/princess-buttercup-pub999");
    expect(screen.getByRole("link", { name: "View Sample Safety Profile" }).getAttribute("href")).toBe("/q/SAFE999");
    expect(container.textContent).not.toContain("owner@example.com");
    expect(container.innerHTML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  it("shows a safe generic state when the configured pet is invalid", async () => {
    mocks.load.mockResolvedValue({ available: false, pet: null });
    render(<SampleExperience />);
    expect(await screen.findByRole("heading", { name: "The Sample Experience is being prepared" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("link", { name: /View Sample/ })).toBeNull());
  });

  it("refreshes both cards and links together when the configured pet changes", async () => {
    mocks.load.mockResolvedValueOnce({ available: true, pet: {
      name: "Pet A", species: "Cat", breed: null, ageDisplayLabel: "Age unknown", bio: null,
      profilePhotoUrl: null, publicSlug: "pet-a", publicCode: "PUBA", safetyCode: "SAFEA",
    } });
    const first = render(<SampleExperience />);
    expect(await screen.findByRole("heading", { name: "Pet A's mini website" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Found Pet A?" })).toBeTruthy();
    first.unmount();

    mocks.load.mockResolvedValueOnce({ available: true, pet: {
      name: "Pet B", species: "Dog", breed: "Corgi", ageDisplayLabel: "4 years old", bio: "Bright and friendly.",
      profilePhotoUrl: "/pets/b.jpg", publicSlug: "pet-b", publicCode: "PUBB", safetyCode: "SAFEB",
    } });
    render(<SampleExperience />);
    expect(await screen.findByRole("heading", { name: "Pet B's mini website" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Found Pet B?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Sample Public Profile" }).getAttribute("href")).toBe("/p/pet-b-pubb");
    expect(screen.getByRole("link", { name: "View Sample Safety Profile" }).getAttribute("href")).toBe("/q/SAFEB");
    expect(document.body.textContent).not.toContain("Pet A");
    expect(document.body.textContent).not.toContain("Topu");
  });
});
