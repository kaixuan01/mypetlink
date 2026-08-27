// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CareRecord } from "@/types";
import { RecordCard } from "./RecordCard";

afterEach(() => cleanup());

describe("RecordCard date terminology", () => {
  it("uses concise history labels without changing type-specific meaning", () => {
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

    expect(screen.getByText("Date:")).toBeTruthy();
    expect(screen.getByText(/Next follow-up: 15 Aug 2026/)).toBeTruthy();
    expect(screen.queryByText("Visit Date:")).toBeNull();
  });

  it("keeps Medication start and review wording in owner history", () => {
    render(
      <RecordCard
        record={{
          id: "record-medication",
          petId: "pet-1",
          type: "Medication",
          title: "Apoquel",
          date: "15 Jul 2026",
          dueDate: "15 Aug 2026",
          provider: "Happy Paws Vet",
          notes: "Once daily with food.",
          publicVisibility: "Private",
          status: "upcoming",
        }}
      />
    );

    expect(screen.getByText("Start date:")).toBeTruthy();
    expect(screen.getByText(/Next review: 15 Aug 2026/)).toBeTruthy();
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

  it("shows CareName separately and replaces an explicitly fulfilled due status with Completed", () => {
    const record: CareRecord = {
      id: "record-fulfilled",
      petId: "pet-1",
      type: "Vaccine",
      careName: "DHPP",
      title: "Annual booster",
      date: "24 Sep 2022",
      dueDate: "15 Oct 2022",
      provider: "Happy Paws Vet",
      notes: "Historical schedule remains visible.",
      publicVisibility: "Private",
      status: "overdue",
    };

    render(<RecordCard effectiveStatus="fulfilled" record={record} />);

    expect(screen.getByText("DHPP")).toBeTruthy();
    expect(screen.getByText("Annual booster")).toBeTruthy();
    expect(screen.getByText(/Next due: 15 Oct 2022/)).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it.each(["Public badge only", "Public details"] as const)(
    "presents %s compatibility records as the public owner audience",
    (publicVisibility) => {
      render(
        <RecordCard
          record={{
            id: `record-${publicVisibility}`,
            petId: "pet-1",
            type: "Vaccine",
            title: "Annual vaccination",
            date: "15 Jul 2026",
            provider: "Happy Paws Vet",
            notes: "Owner notes remain visible here.",
            publicVisibility,
            status: "complete",
          }}
        />
      );

      expect(screen.getByText("Shared")).toBeTruthy();
      expect(screen.queryByText("Anyone with the link")).toBeNull();
      expect(screen.queryByText(publicVisibility)).toBeNull();
    }
  );

  it("presents a private record as Only me", () => {
    render(
      <RecordCard
        record={{
          id: "private-record",
          petId: "pet-1",
          type: "Vaccine",
          title: "Private vaccination",
          date: "15 Jul 2026",
          provider: "Happy Paws Vet",
          notes: "Owner notes remain private.",
          publicVisibility: "Private",
          status: "complete",
        }}
      />
    );

    expect(screen.getByText("Only me")).toBeTruthy();
    expect(screen.queryByText("Anyone with the link")).toBeNull();
  });
});
