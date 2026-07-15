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
});
