// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateInput } from "./DateInput";

afterEach(() => cleanup());

describe("DateInput", () => {
  it("renders one shared custom indicator for a populated native date input", () => {
    render(
      <label>
        Exact birthday
        <DateInput onChange={() => undefined} value="2026-01-19" />
      </label>
    );

    const input = screen.getByLabelText("Exact birthday") as HTMLInputElement;
    const shell = input.parentElement;

    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-01-19");
    expect(input.classList.contains("brand-date-input")).toBe(true);
    expect(shell?.classList.contains("brand-date-field")).toBe(true);
    expect(shell?.querySelectorAll(".brand-date-indicator svg")).toHaveLength(1);
    expect(shell?.querySelectorAll("button")).toHaveLength(0);
  });

  it("keeps an empty date enabled, focusable, and editable", () => {
    const onChange = vi.fn();
    render(
      <label>
        Adoption day
        <DateInput onChange={onChange} value="" />
      </label>
    );

    const input = screen.getByLabelText("Adoption day") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("");

    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "2026-01-19" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("opens the native picker from the input click area when supported", () => {
    render(
      <label>
        Date
        <DateInput onChange={() => undefined} value="" />
      </label>
    );

    const input = screen.getByLabelText("Date") as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(input, "showPicker", { value: showPicker });

    fireEvent.click(input);
    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("supports the shared datetime-local control without changing its value", () => {
    render(
      <label>
        Last seen date and time
        <DateInput
          onChange={() => undefined}
          type="datetime-local"
          value="2026-01-19T18:30"
        />
      </label>
    );

    const input = screen.getByLabelText(
      "Last seen date and time"
    ) as HTMLInputElement;
    expect(input.type).toBe("datetime-local");
    expect(input.value).toBe("2026-01-19T18:30");
  });
});
