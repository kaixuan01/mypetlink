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
});
