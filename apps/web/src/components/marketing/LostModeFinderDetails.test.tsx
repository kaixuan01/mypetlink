// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LostModeFinderDetails } from "@/components/marketing/LostModeFinderDetails";

afterEach(cleanup);

it("formats Malaysia finder time and labels every optional value", () => {
  const rawTimestamp = "2026-07-16T07:42:00+00:00";
  render(
    <LostModeFinderDetails
      lostMode={{
        lastSeenArea: "Ampang, Kuala Lumpur",
        lastSeenDateTime: rawTimestamp,
        lostMessage: "Please help Topu get home.",
        rewardNote: "RM50 reward offered",
        extraContactInstruction: "Please call me directly",
      }}
    />
  );

  expect(screen.getByText("Last seen area")).toBeTruthy();
  expect(screen.getByText("Last seen")).toBeTruthy();
  expect(screen.getByText("16 Jul 2026, 3:42 PM")).toBeTruthy();
  expect(screen.getByText("Reward")).toBeTruthy();
  expect(screen.getByText("Contact instructions")).toBeTruthy();
  expect(document.body.textContent).not.toContain(rawTimestamp);
});

it("hides empty and invalid optional rows", () => {
  render(
    <LostModeFinderDetails
      lostMode={{
        lastSeenArea: "Ampang",
        lastSeenDateTime: "not-a-date",
        lostMessage: "",
        rewardNote: "",
        extraContactInstruction: "",
      }}
    />
  );

  expect(screen.getByText("Last seen area")).toBeTruthy();
  expect(screen.queryByText("Last seen")).toBeNull();
  expect(screen.queryByText("Reward")).toBeNull();
  expect(screen.queryByText("Contact instructions")).toBeNull();
  expect(document.body.textContent).not.toContain("not-a-date");
});

it("treats a timezone-free owner value as Malaysia wall time", () => {
  render(
    <LostModeFinderDetails
      lostMode={{
        lastSeenArea: "",
        lastSeenDateTime: "2026-07-16T15:42",
        lostMessage: "",
        rewardNote: "",
        extraContactInstruction: "",
      }}
    />
  );

  expect(screen.getByText("16 Jul 2026, 3:42 PM")).toBeTruthy();
});
