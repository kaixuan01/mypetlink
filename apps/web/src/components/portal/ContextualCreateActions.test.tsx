// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/recordService", () => ({
  createRecord: (...args: unknown[]) => mocks.createRecord(...args),
  deleteRecord: vi.fn(),
  getFriendlyRecordErrorMessage: () => "Please try again.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  updateRecord: (...args: unknown[]) => mocks.updateRecord(...args),
}));
vi.mock("@/services/momentService", () => ({
  deletePetMoment: vi.fn(),
  getFriendlyMomentErrorMessage: () => "Please try again.",
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  updatePetMoment: vi.fn(),
}));
vi.mock("@/components/portal/RecordCard", () => ({
  RecordCard: ({
    record,
    onEdit,
  }: {
    record: { title: string };
    onEdit?: () => void;
  }) => (
    <article>
      {record.title}
      {onEdit ? <button onClick={onEdit}>Edit</button> : null}
    </article>
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
    mocks.createRecord.mockReset();
    mocks.updateRecord.mockReset();
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

  it("updates Care Record date wording without clearing entered dates", async () => {
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /add first care record/i })
    );

    const primaryDate = screen.getByLabelText("Record Date") as HTMLInputElement;
    const nextDate = screen.getByLabelText(
      /Next Care Date/
    ) as HTMLInputElement;
    fireEvent.change(primaryDate, { target: { value: "2020-06-15" } });
    fireEvent.change(nextDate, { target: { value: "2020-07-15" } });

    fireEvent.change(screen.getByLabelText("Record Type"), {
      target: { value: "Grooming" },
    });

    expect(screen.getByText("Grooming Date")).toBeTruthy();
    expect(screen.getByText("Next Grooming Date (Optional)")).toBeTruthy();
    expect(
      screen.getByText(/Record when this grooming happened/)
    ).toBeTruthy();
    expect(
      screen.getByText(/WhatsApp reminders will be available with Premium/)
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Grooming Date") as HTMLInputElement).value
    ).toBe("2020-06-15");
    expect(
      (screen.getByLabelText(/Next Grooming Date/) as HTMLInputElement).value
    ).toBe("2020-07-15");
    expect(primaryDate.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects a future primary date with record-specific guidance", async () => {
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /add first care record/i })
    );
    fireEvent.change(screen.getByLabelText("Record Type"), {
      target: { value: "Grooming" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Booked grooming" },
    });

    const future = new Date();
    future.setDate(future.getDate() + 1);
    const futureValue = [
      future.getFullYear(),
      String(future.getMonth() + 1).padStart(2, "0"),
      String(future.getDate()).padStart(2, "0"),
    ].join("-");
    fireEvent.change(screen.getByLabelText("Grooming Date"), {
      target: { value: futureValue },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save Record" }).closest("form")!
    );

    expect(
      screen.getByText(
        "Grooming date cannot be in the future. Use Next Grooming Date for future care or reminders."
      )
    ).toBeTruthy();
    expect(mocks.createRecord).not.toHaveBeenCalled();
  });

  it("allows an existing optional next date to be cleared on edit", async () => {
    const record = mockRecords[0];
    mocks.getPetRecords.mockResolvedValue({ data: [record] });
    mocks.updateRecord.mockResolvedValue({
      data: { ...record, dueDate: undefined },
    });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[record]} />);

    expect(await screen.findByText(record.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Next Vaccination Due Date/), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updateRecord).toHaveBeenCalledOnce());
    expect(mocks.updateRecord.mock.calls[0][1]).toMatchObject({
      dueDate: undefined,
    });
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
