// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";
import type { PetListItem, PetMoment } from "@/types";

const mocks = vi.hoisted(() => ({
  createPetMoment: vi.fn(),
  getPetMoments: vi.fn(),
  getPets: vi.fn(),
  updatePetMoment: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return { ...actual, getPets: (...args: unknown[]) => mocks.getPets(...args) };
});
vi.mock("@/services/momentService", () => ({
  createPetMoment: (...args: unknown[]) => mocks.createPetMoment(...args),
  deletePetMoment: vi.fn(),
  getFriendlyMomentErrorMessage: () => "Please try again.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  updatePetMoment: (...args: unknown[]) => mocks.updatePetMoment(...args),
}));
vi.mock("@/lib/analytics", () => ({
  AnalyticsEvent: { MomentCreated: "moment_created" },
  trackEvent: vi.fn(),
}));
vi.mock("@/components/portal/MomentMediaField", () => ({
  MomentMediaField: () => <div data-testid="moment-media-field" />,
}));
vi.mock("@/components/portal/PetMomentCard", () => ({
  PetMomentCard: ({
    moment,
    onEdit,
    subjectNames,
  }: {
    moment: { title: string };
    onEdit?: () => void;
    subjectNames?: string[];
  }) => (
    <article>
      <span>{moment.title}</span>
      <span data-testid="card-subjects">{(subjectNames ?? []).join(", ")}</span>
      {onEdit ? <button onClick={onEdit}>Edit</button> : null}
    </article>
  ),
}));

const { PetMomentsManager } = await import("./PetMomentsManager");

/**
 * Who's in a Moment, from a pet's own Moments page.
 *
 * The Owner Portal opens its editor from one pet, so that pet is decided by the
 * route and must never have to be chosen again. What the owner can add beside
 * it has to match Community's Share a Moment exactly: the same household, the
 * same Moment, the same rule — their own pets, less any archived one.
 */

const topu: PetListItem = { ...mockPets[0], id: "pet-topu", name: "Topu", lifecycleStatus: "Active" };
const linko: PetListItem = { ...mockPets[0], id: "pet-linko", name: "Linko", lifecycleStatus: "Active" };
const biscuit: PetListItem = { ...mockPets[0], id: "pet-biscuit", name: "Biscuit", lifecycleStatus: "Memorial" };
const pebble: PetListItem = { ...mockPets[0], id: "pet-pebble", name: "Pebble", lifecycleStatus: "Archived" };

function moment(overrides: Partial<PetMoment> = {}): PetMoment {
  return {
    ...mockMoments[0],
    id: "moment-1",
    petId: topu.id,
    title: "Morning zoomies",
    additionalPetIds: [],
    ...overrides,
  };
}

function subjectSelector() {
  return screen.getByRole("group", { name: /Who.s in this Moment/ });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.getPets.mockResolvedValue({ data: [topu, linko, biscuit, pebble] });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.createPetMoment.mockResolvedValue({ data: moment({ id: "moment-new" }) });
  window.history.replaceState({}, "", `/pets/${topu.id}/moments`);
});

describe("Owner Portal Moment subjects", () => {
  it("starts from the page's pet, already in the Moment and not a choice", async () => {
    render(<PetMomentsManager pet={topu} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
    await waitFor(() => expect(within(subjectSelector()).getByText("Linko")).toBeTruthy());

    const primary = screen.getByTestId("moment-subject-primary");
    expect(primary.textContent).toContain("This Moment belongs to Topu");
    // Not a checkbox: there is nothing to reselect and nothing to untick.
    expect(within(primary).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("moment-primary-pet")).toBeNull();
  });

  it("offers the owner's other pets, memorial included, archived not", async () => {
    render(<PetMomentsManager pet={topu} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
    await waitFor(() => expect(within(subjectSelector()).getByText("Linko")).toBeTruthy());

    const offered = within(subjectSelector())
      .getAllByRole("checkbox")
      .map((box) => box.closest("label")?.textContent?.trim());

    expect(offered).toEqual(["Linko", "Biscuit"]);
  });

  it("adds another own pet to a new Moment without reselecting the first", async () => {
    render(<PetMomentsManager pet={topu} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add Moment" }));
    await waitFor(() => expect(within(subjectSelector()).getByText("Linko")).toBeTruthy());

    fireEvent.click(within(subjectSelector()).getByRole("checkbox", { name: /Linko/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Two of them" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("Moment category"), { target: { value: "Funny Moment" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Moment" }));

    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledOnce());
    expect(mocks.createPetMoment.mock.calls[0][0]).toBe(topu.id);
    expect(mocks.createPetMoment.mock.calls[0][1].additionalPetIds).toEqual([linko.id]);
  });

  it("keeps every pet already in a Moment through an unrelated edit", async () => {
    // Topu + Linko + an archived Pebble. Fixing the title is not a decision
    // about who was there.
    const saved = moment({ additionalPetIds: [linko.id, pebble.id] });
    mocks.getPetMoments.mockResolvedValue({ data: [saved] });
    mocks.updatePetMoment.mockResolvedValue({ data: { ...saved, title: "Morning zoomies!" } });

    render(<PetMomentsManager pet={topu} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await waitFor(() => expect(within(subjectSelector()).getByText("Linko")).toBeTruthy());

    // The archived pet is shown, ticked, because it is in this Moment — so it
    // can be seen and removed, not kept out of sight.
    expect(
      (within(subjectSelector()).getByRole("checkbox", { name: /Pebble/ }) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (within(subjectSelector()).getByRole("checkbox", { name: /Linko/ }) as HTMLInputElement).checked
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Morning zoomies!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updatePetMoment).toHaveBeenCalledOnce());
    const payload = mocks.updatePetMoment.mock.calls[0][1];
    expect([...payload.additionalPetIds].sort()).toEqual([linko.id, pebble.id].sort());
  });

  it("leaves a Moment's pets alone when the owner's pets could not be loaded", async () => {
    mocks.getPets.mockRejectedValue(new Error("offline"));
    const saved = moment({ additionalPetIds: [linko.id] });
    mocks.getPetMoments.mockResolvedValue({ data: [saved] });
    mocks.updatePetMoment.mockResolvedValue({ data: saved });

    render(<PetMomentsManager pet={topu} initialMoments={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updatePetMoment).toHaveBeenCalledOnce());
    // No list offered means no list sent: the server keeps what it has.
    expect(mocks.updatePetMoment.mock.calls[0][1]).not.toHaveProperty("additionalPetIds");
  });

  it("names a memorial pet that is in a Moment on the Moment's card", async () => {
    mocks.getPetMoments.mockResolvedValue({
      data: [moment({ additionalPetIds: [biscuit.id] })],
    });

    render(<PetMomentsManager pet={topu} initialMoments={[]} />);

    await waitFor(() =>
      expect(screen.getByTestId("card-subjects").textContent).toBe("Topu, Biscuit")
    );
  });
});
