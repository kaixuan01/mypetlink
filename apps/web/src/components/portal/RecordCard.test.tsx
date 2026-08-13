// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CareRecord } from "@/types";
import { RecordCard } from "./RecordCard";

afterEach(() => cleanup());

describe("RecordCard date terminology", () => {
  it("uses the saved Record Type for primary and next date labels", () => {
    const record: CareRecord = {
      id: "record-1",
      petId: "pet-1",
      type: "Vet Visit",
      title: "Skin follow-up",
      date: "15 Jul 2026",
      dueDate: "15 Aug 2026",
      provider: "Happy Paws Vet",
      notes: "Monitor progress.",
      publicVisibility: "Private",
      status: "upcoming",
    };

    render(<RecordCard record={record} />);

    expect(screen.getByText("Visit Date:")).toBeTruthy();
    expect(screen.getByText(/Next Follow-up Date: 15 Aug 2026/)).toBeTruthy();
  });

  it("shows an overdue next date as a distinct danger status", () => {
    const record: CareRecord = {
      id: "record-overdue",
      petId: "pet-1",
      type: "Vaccine",
      title: "Annual vaccination",
      date: "15 Jul 2025",
      dueDate: "15 Jul 2026",
      provider: "Happy Paws Vet",
      notes: "Schedule the next visit.",
      publicVisibility: "Private",
      status: "overdue",
    };

    render(<RecordCard record={record} />);

    const overdue = screen.getByText("Overdue");
    expect(overdue.className).toContain("bg-[#ffe8e3]");
    expect(screen.queryByText("Due soon")).toBeNull();
  });
});
