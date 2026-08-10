// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import HomePage from "./page";

afterEach(cleanup);

describe("homepage pet finder preview", () => {
  it("shows clear finder actions without presenting fake controls", () => {
    render(<HomePage />);

    const preview = screen.getByRole("heading", { name: "Topu" }).closest("article");
    expect(preview).toBeTruthy();

    const finderOptions = within(preview!).getByLabelText("Finder contact options");
    expect(within(preview!).getByText("If someone finds Topu")).toBeTruthy();
    expect(within(finderOptions).getByText("WhatsApp owner")).toBeTruthy();
    expect(within(finderOptions).getByText("Call owner")).toBeTruthy();
    expect(
      within(preview!).getByText("Found location can be shared with the owner.")
    ).toBeTruthy();
    expect(within(preview!).queryByText("Scan to contact owner")).toBeNull();
    expect(within(finderOptions).queryByRole("button")).toBeNull();
    expect(within(finderOptions).queryByRole("link")).toBeNull();
  });
});
