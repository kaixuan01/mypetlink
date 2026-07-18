// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";

afterEach(cleanup);

it("keeps an empty number absent when only the country code changes", () => {
  const onChange = vi.fn();
  render(
    <PhoneNumberInput
      label="Phone number"
      onChange={onChange}
      value=""
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: /Malaysia \+60.*Change country code/i })
  );
  fireEvent.click(
    screen.getByRole("option", { name: /United Kingdom.*\+44/i })
  );

  expect(onChange).toHaveBeenLastCalledWith("");
  expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe("");
});
