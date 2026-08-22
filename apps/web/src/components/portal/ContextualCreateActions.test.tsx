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

function completeCareRecordForm() {
  fireEvent.change(screen.getByLabelText("Record Type"), {
    target: { value: "Grooming" },
  });
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Routine grooming" },
  });
  fireEvent.change(screen.getByLabelText("Grooming Date"), {
    target: { value: "2020-06-15" },
  });
}

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
    expect(
      screen.getByText(
        "Add your pet's first record so important health details are easy to find later."
      )
    ).toBeTruthy();

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
      screen.getByText("Set the date for your pet’s next grooming session.")
    ).toBeTruthy();
    expect(screen.queryByText(/remind|notif/i)).toBeNull();
    expect(
      (screen.getByLabelText("Grooming Date") as HTMLInputElement).value
    ).toBe("2020-06-15");
    expect(
      (screen.getByLabelText(/Next Grooming Date/) as HTMLInputElement).value
    ).toBe("2020-07-15");
    expect(primaryDate.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not offer Allergy for a new Care Record", async () => {
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /add first care record/i })
    );

    const type = screen.getByLabelText("Record Type") as HTMLSelectElement;
    expect(Array.from(type.options).map((option) => option.value)).not.toContain(
      "Allergy"
    );
    expect(screen.queryByRole("heading", { name: "Allergy" })).toBeNull();
  });

  it("offers exactly the two final Care audiences", async () => {
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /add first care record/i })
    );

    const audience = screen.getByLabelText(
      "Who can see this record?"
    ) as HTMLSelectElement;
    expect(Array.from(audience.options).map((option) => option.text)).toEqual([
      "Only me",
      "Anyone with the link",
    ]);
    expect(screen.queryByText("Public details")).toBeNull();
    expect(screen.queryByText("Public badge only")).toBeNull();
    expect(
      screen.getByText("Public records show only their type and date.")
    ).toBeTruthy();
  });

  it.each([
    ["Only me", "Private"],
    ["Anyone with the link", "Public badge only"],
  ])("creates %s Care records with the normalized visibility", async (label, expected) => {
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    mocks.createRecord.mockResolvedValue({ data: mockRecords[0] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[]} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /add first care record/i })
    );
    completeCareRecordForm();
    fireEvent.change(screen.getByLabelText("Who can see this record?"), {
      target: { value: label === "Only me" ? "Private" : "Public" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Record" }));

    await waitFor(() => expect(mocks.createRecord).toHaveBeenCalledOnce());
    expect(mocks.createRecord.mock.calls[0][1].publicVisibility).toBe(expected);
    expect(mocks.createRecord.mock.calls[0][1].publicVisibility).not.toBe(
      "Public details"
    );
  });

  it.each([
    ["Private", "Private"],
    ["Public badge only", "Public"],
    ["Public details", "Public"],
  ] as const)("hydrates %s as the effective %s audience", async (visibility, expected) => {
    const record = {
      ...mockRecords[0],
      publicVisibility: visibility,
    };
    mocks.getPetRecords.mockResolvedValue({ data: [record] });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[record]} />);

    expect(await screen.findByText(record.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      (screen.getByLabelText("Who can see this record?") as HTMLSelectElement)
        .value
    ).toBe(expected);
    expect(screen.queryByText("Public details")).toBeNull();
  });

  it("normalizes a legacy public-details save without clearing owner Care data", async () => {
    const record = {
      ...mockRecords[0],
      title: "Annual September vaccination",
      date: "02 Sept 2020",
      dueDate: "15 Sept 2027",
      provider: "Happy Paws Clinic",
      notes: "Booster batch and owner notes",
      publicVisibility: "Public details" as const,
      status: "upcoming" as const,
    };
    mocks.getPetRecords.mockResolvedValue({ data: [record] });
    mocks.updateRecord.mockResolvedValue({
      data: { ...record, publicVisibility: "Public badge only" },
    });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[record]} />);

    expect(await screen.findByText(record.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updateRecord).toHaveBeenCalledOnce());
    expect(mocks.updateRecord.mock.calls[0][1]).toMatchObject({
      title: record.title,
      date: record.date,
      dueDate: record.dueDate,
      provider: record.provider,
      notes: record.notes,
      publicVisibility: "Public badge only",
    });
    expect(mocks.updateRecord.mock.calls[0][1]).not.toHaveProperty("status");
  });

  it("retains Allergy while explicitly editing a legacy record", async () => {
    const legacyRecord = {
      ...mockRecords[0],
      id: "legacy-allergy",
      type: "Allergy" as const,
      title: "Legacy allergy note",
    };
    mocks.getPetRecords.mockResolvedValue({ data: [legacyRecord] });
    render(
      <RecordsManager petId={mockPets[0].id} initialRecords={[legacyRecord]} />
    );

    expect(await screen.findByText("Legacy allergy note")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const type = screen.getByLabelText("Record Type") as HTMLSelectElement;
    expect(type.value).toBe("Allergy");
    expect(Array.from(type.options).map((option) => option.value)).toContain(
      "Allergy"
    );
    expect(screen.getByRole("heading", { name: "Allergy" })).toBeTruthy();
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
        "Grooming date cannot be in the future. Use Next Grooming Date to track future care."
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

  it("round-trips September care dates without clearing or changing them", async () => {
    const record = {
      ...mockRecords[0],
      date: "02 Sept 2020",
      dueDate: "15 Sept 2027",
    };
    mocks.getPetRecords.mockResolvedValue({ data: [record] });
    mocks.updateRecord.mockResolvedValue({ data: record });
    render(<RecordsManager petId={mockPets[0].id} initialRecords={[record]} />);

    expect(await screen.findByText(record.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      (screen.getByLabelText("Vaccination Date") as HTMLInputElement).value
    ).toBe("2020-09-02");
    expect(
      (screen.getByLabelText(/Next Vaccination Due Date/) as HTMLInputElement)
        .value
    ).toBe("2027-09-15");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updateRecord).toHaveBeenCalledOnce());
    expect(mocks.updateRecord.mock.calls[0][1]).toMatchObject({
      date: "02 Sept 2020",
      dueDate: "15 Sept 2027",
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
