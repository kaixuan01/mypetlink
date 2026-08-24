// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MobileFormActionBar } from "./MobileFormActionBar";

afterEach(cleanup);

it("keeps nav and safe-area clearance on the fixed bar, not its content spacer", () => {
  render(<MobileFormActionBar primaryLabel="Save" />);

  const actions = screen.getByRole("group", { name: "Form actions" });
  const spacer = screen.getByTestId("mobile-form-actions-clearance");

  expect(actions.className).toContain("--owner-bottom-nav-height");
  expect(actions.className).toContain("safe-area-inset-bottom");
  expect(spacer.className).toContain("--owner-mobile-form-action-height");
  expect(spacer.className).not.toContain("--owner-bottom-nav-height");
  expect(spacer.className).not.toContain("safe-area-inset-bottom");
});
