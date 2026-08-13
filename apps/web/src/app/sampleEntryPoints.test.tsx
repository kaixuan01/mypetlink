// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingRoutes } from "@/lib/routes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => false,
}));

import HowItWorksPage from "./how-it-works/page";
import PetProfileGuidePage from "./pet-profile/page";

afterEach(cleanup);

describe("public sample entry points", () => {
  it("sends the how-it-works CTA to the Public Share Profile section", () => {
    render(<HowItWorksPage />);

    expect(
      screen.getByRole("link", { name: "View Sample Profile" }).getAttribute("href")
    ).toBe(marketingRoutes.samplePublicProfile);
  });

  it("sends the pet-profile CTA to the Public Share Profile section", () => {
    render(<PetProfileGuidePage />);

    expect(
      screen.getByRole("link", { name: "View Sample Profile" }).getAttribute("href")
    ).toBe(marketingRoutes.samplePublicProfile);
  });
});
