// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";

vi.mock("@/components/ui/PetPhotoViewer", () => ({
  PetPhotoViewer: () => <span>Pet portrait</span>,
}));

afterEach(cleanup);

it("applies the same saved theme to the QR safety profile", async () => {
  const pet = { ...mockPets[0], profileTheme: "peach" as const };
  const { container } = render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink safety page");
  const themedProfile = container.querySelector("[data-profile-theme]");
  expect(themedProfile?.getAttribute("data-profile-theme")).toBe("peach");
  expect(screen.getByText("Safety note").parentElement?.getAttribute("style"))
    .toContain("background");
});
