// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";

const mocks = vi.hoisted(() => ({
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/recordService", () => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  getFriendlyRecordErrorMessage: () => "Please try again.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  updateRecord: vi.fn(),
}));
vi.mock("@/services/momentService", () => ({
  deletePetMoment: vi.fn(),
  getFriendlyMomentErrorMessage: () => "Please try again.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  updatePetMoment: vi.fn(),
}));
vi.mock("@/components/portal/RecordCard", () => ({
  RecordCard: ({ record }: { record: { title: string } }) => (
    <article>{record.title}</article>
  ),
}));
vi.mock("@/components/portal/PetMomentCard", () => ({
  PetMomentCard: ({ moment }: { moment: { title: string } }) => (
    <article>{moment.title}</article>
  ),
}));

const { RecordsManager } = await import("./RecordsManager");
const { PetMomentsManager } = await import("./PetMomentsManager");

describe("contextual create actions", () => {
  beforeEach(() => {
    mocks.getPetRecords.mockReset();
    mocks.getPetMoments.mockReset();
    window.history.replaceState({}, "", "/pets/pet_milo/records");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("removes the populated Records page-level Add button", async () => {
    mocks.getPetRecords.mockResolvedValue({ data: [mockRecords[0]] });
    render(
      <RecordsManager petId={mockPets[0].id} initialRecords={[mockRecords[0]]} />
    );

    expect(await screen.findByText(mockRecords[0].title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^add record$/i })).toBeNull();
  });

  it("keeps one empty Records onboarding CTA and opens the existing form", async () => {
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    const action = await screen.findByRole("button", {
      name: /add first care record/i,
    });
    expect(
      screen.getAllByRole("button", { name: /add first care record/i })
    ).toHaveLength(1);

    fireEvent.click(action);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Save a care record")).toBeTruthy();
  });

  it("opens a requested Care Record flow once and removes the create query", async () => {
    window.history.replaceState({}, "", "/pets/pet_milo/records?create=1");
    mocks.getPetRecords.mockResolvedValue({ data: [mockRecords[0]] });
    render(
      <RecordsManager petId={mockPets[0].id} initialRecords={[mockRecords[0]]} />
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Save a care record")).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it("does not expose a create action when Records fail to load", async () => {
    mocks.getPetRecords.mockRejectedValue(new Error("offline"));
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    expect(await screen.findByText(/temporarily unavailable/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /add first care record/i })
    ).toBeNull();
  });

  it("removes the populated Moments page-level Add button", async () => {
    mocks.getPetMoments.mockResolvedValue({ data: [mockMoments[0]] });
    render(
      <PetMomentsManager
        pet={mockPets[0]}
        initialMoments={[mockMoments[0]]}
      />
    );

    expect(await screen.findByText(mockMoments[0].title)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^add moment$/i })).toBeNull();
  });

  it("keeps one empty Moments onboarding CTA", async () => {
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    render(<PetMomentsManager pet={mockPets[0]} initialMoments={[]} />);

    const action = await screen.findByRole("link", { name: /^add moment$/i });
    expect(action.getAttribute("href")).toBe(
      `/pets/${mockPets[0].id}/moments/new`
    );
    expect(screen.getAllByRole("link", { name: /^add moment$/i })).toHaveLength(
      1
    );
  });
});
