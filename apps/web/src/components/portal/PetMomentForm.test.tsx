// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  createPetMoment: vi.fn(),
  getPetMoments: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/services/momentService", () => ({
  createPetMoment: (...args: unknown[]) => mocks.createPetMoment(...args),
  getFriendlyMomentErrorMessage: () => "Please try again.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/components/portal/MomentMediaField", () => ({
  MomentMediaField: () => <div data-testid="moment-media-field" />,
}));

const { PetMomentForm } = await import("./PetMomentForm");

describe("PetMomentForm route-backed create flow", () => {
  beforeEach(() => {
    mocks.router.replace.mockReset();
    mocks.createPetMoment.mockReset();
    mocks.getPetMoments.mockReset();
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.createPetMoment.mockResolvedValue({ data: { id: "new-moment" } });
    window.history.replaceState({}, "", `/pets/${mockPets[0].id}/moments/new`);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates from the shared editor and returns to the refreshed Moments route", async () => {
    render(<PetMomentForm pet={mockPets[0]} />);

    expect(await screen.findByRole("dialog", { name: /add a moment/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "First swim" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-07-10" },
    });
    fireEvent.change(screen.getByLabelText("Moment category"), {
      target: { value: "Funny Moment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));

    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledOnce());
    expect(mocks.createPetMoment.mock.calls[0][0]).toBe(mockPets[0].id);
    expect(mocks.createPetMoment.mock.calls[0][1]).toMatchObject({
      title: "First swim",
      date: "10 Jul 2026",
      type: "Funny Moment",
    });

    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        `/pets/${mockPets[0].id}/moments`
      )
    );
  });

  it("asks before discarding changed fields and treats browser Back like Close", async () => {
    render(<PetMomentForm pet={mockPets[0]} />);
    await screen.findByRole("dialog", { name: /add a moment/i });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Unsaved memory" },
    });

    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("dialog", { name: "Discard this moment?" })).toBeTruthy();
    expect(mocks.router.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledOnce());
  });
});
