// @vitest-environment jsdom

import { useState, type FormEvent } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  updatePetLostMode: vi.fn(),
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    updatePetLostMode: (...args: unknown[]) =>
      mocks.updatePetLostMode(...args),
  };
});

const { LostModeControl } = await import("./LostModeControl");

function petWithLostMode(enabled: boolean): Pet {
  return {
    ...structuredClone(mockPets[0]),
    lostModeEnabled: enabled,
  };
}

function Harness({ initialPet }: { initialPet: Pet }) {
  const [pet, setPet] = useState(initialPet);
  return (
    <LostModeControl pet={pet} onPetChange={setPet} variant="compact" />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("LostModeControl", () => {
  beforeEach(() => {
    mocks.updatePetLostMode.mockImplementation(
      async (_id: string, enabled: boolean, lostMode: Pet["lostMode"]) => ({
        data: {
          ...petWithLostMode(enabled),
          lostMode: { ...petWithLostMode(enabled).lostMode, ...lostMode },
        },
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("enables Lost Mode directly and updates the shared pet state", async () => {
    const pet = petWithLostMode(false);
    render(<Harness initialPet={pet} />);

    expect(screen.getByText("Current status")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: `Mark ${pet.name} as Lost` }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(`Mark ${pet.name} as lost?`)).toBeTruthy();
    expect(screen.getByText("Reward note (optional)")).toBeTruthy();
    expect(screen.getByText("For example: RM50 reward offered.")).toBeTruthy();
    expect(screen.getByText("Contact instructions (optional)")).toBeTruthy();
    expect(
      screen.getByText("For example: Please call instead of messaging.")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Activate Lost Mode" }));

    await waitFor(() =>
      expect(mocks.updatePetLostMode).toHaveBeenCalledWith(
        pet.id,
        true,
        expect.objectContaining({ lostMessage: expect.any(String) })
      )
    );
    expect(await screen.findByText("On")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Lost Mode is now on"
    );
  });

  it("confirms before marking the pet as found", async () => {
    const pet = petWithLostMode(true);
    render(<Harness initialPet={pet} />);

    fireEvent.click(
      screen.getByRole("button", { name: `Mark ${pet.name} as Found` })
    );
    expect(screen.getByText(`Mark ${pet.name} as found?`)).toBeTruthy();
    expect(mocks.updatePetLostMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mark as Found" }));

    await waitFor(() =>
      expect(mocks.updatePetLostMode).toHaveBeenCalledWith(
        pet.id,
        false,
        expect.objectContaining(pet.lostMode)
      )
    );
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "marked as found"
    );
  });

  it("keeps the editor open and reports a failed update", async () => {
    const pet = petWithLostMode(false);
    mocks.updatePetLostMode.mockRejectedValueOnce(new Error("offline"));
    render(<Harness initialPet={pet} />);

    fireEvent.click(screen.getByRole("button", { name: `Mark ${pet.name} as Lost` }));
    fireEvent.click(screen.getByRole("button", { name: "Activate Lost Mode" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Something went wrong. Please try again."
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("does not show success when the server returns the old state", async () => {
    const pet = petWithLostMode(false);
    mocks.updatePetLostMode.mockResolvedValueOnce({ data: pet });
    render(<Harness initialPet={pet} />);

    fireEvent.click(screen.getByRole("button", { name: `Mark ${pet.name} as Lost` }));
    fireEvent.click(screen.getByRole("button", { name: "Activate Lost Mode" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByText(/Lost Mode is now on/)).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("prevents duplicate submissions while an update is pending", async () => {
    const pet = petWithLostMode(false);
    const pending = deferred<{ data: Pet }>();
    mocks.updatePetLostMode.mockReturnValueOnce(pending.promise);
    render(<Harness initialPet={pet} />);

    fireEvent.click(screen.getByRole("button", { name: `Mark ${pet.name} as Lost` }));
    const activate = screen.getByRole("button", { name: "Activate Lost Mode" });
    fireEvent.click(activate);
    fireEvent.click(activate);

    expect(mocks.updatePetLostMode).toHaveBeenCalledOnce();
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    pending.resolve({ data: petWithLostMode(true) });
    expect(await screen.findByText("On")).toBeTruthy();
  });

  it("closes the Lost Mode editor with Escape and returns focus to the trigger", () => {
    const pet = petWithLostMode(false);
    render(<Harness initialPet={pet} />);

    const trigger = screen.getByRole("button", {
      name: `Mark ${pet.name} as Lost`,
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.updatePetLostMode).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab and Shift+Tab focus inside the Lost Mode editor", () => {
    const pet = petWithLostMode(false);
    render(<Harness initialPet={pet} />);

    fireEvent.click(screen.getByRole("button", { name: `Mark ${pet.name} as Lost` }));
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "button, input, textarea"
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("shows the owner card last-seen time in finder-friendly format", () => {
    const rawValue = "2026-07-16T15:42";
    const pet = {
      ...petWithLostMode(true),
      lostMode: {
        ...petWithLostMode(true).lostMode,
        lastSeenDateTime: rawValue,
      },
    };
    render(<LostModeControl onPetChange={() => undefined} pet={pet} variant="card" />);

    expect(screen.getByText("Last seen date/time")).toBeTruthy();
    expect(screen.getByText("16 Jul 2026, 3:42 PM")).toBeTruthy();
    expect(document.body.textContent).not.toContain(rawValue);
  });

  it("uses non-submitting buttons inside a parent form", () => {
    const pet = petWithLostMode(false);
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness initialPet={pet} />
      </form>
    );

    const action = screen.getByRole("button", {
      name: `Mark ${pet.name} as Lost`,
    }) as HTMLButtonElement;
    expect(action.type).toBe("button");
    fireEvent.click(action);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
