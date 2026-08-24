// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingRow } from "./SettingRow";

afterEach(cleanup);

function ControlledSetting({ control }: { control: "switch" | "checkbox" }) {
  const [checked, setChecked] = useState(false);
  return (
    <SettingRow
      checked={checked}
      control={control}
      helperText="Share this detail with finders."
      label="Show phone number"
      onChange={setChecked}
    />
  );
}

function LinkedSetting({
  control,
  onLink,
}: {
  control: "switch" | "checkbox";
  onLink: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <SettingRow
      checked={checked}
      control={control}
      helperText={
        <a
          href="#privacy"
          onClick={(event) => {
            event.preventDefault();
            onLink();
          }}
        >
          Privacy guide
        </a>
      }
      label="Show phone number"
      onChange={setChecked}
    />
  );
}

describe("SettingRow", () => {
  it("provides an accessible full-row switch without persistence semantics", () => {
    render(<ControlledSetting control="switch" />);
    const control = screen.getByRole("switch", { name: "Show phone number" });

    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.getAttribute("aria-describedby")).toBe(
      screen.getByText("Share this detail with finders.").id
    );
    fireEvent.click(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("provides a labelled checkbox with the same helper layout and full-row target", () => {
    render(<ControlledSetting control="checkbox" />);
    const checkbox = screen.getByRole("checkbox", { name: "Show phone number" });
    const row = checkbox.closest("[data-setting-row]");

    expect(checkbox).toHaveProperty("checked", false);
    expect(row?.className).toContain("min-h-14");
    fireEvent.click(screen.getByText("Show phone number"));
    expect(checkbox).toHaveProperty("checked", true);
  });

  it.each(["switch", "checkbox"] as const)(
    "does not toggle the %s when a helper link is activated",
    (control) => {
      const onLink = vi.fn();
      render(<LinkedSetting control={control} onLink={onLink} />);
      const setting = screen.getByRole(control, { name: "Show phone number" });

      fireEvent.click(screen.getByRole("link", { name: "Privacy guide" }));

      expect(onLink).toHaveBeenCalledOnce();
      expect(
        control === "switch"
          ? setting.getAttribute("aria-checked")
          : (setting as HTMLInputElement).checked
      ).toBe(control === "switch" ? "false" : false);
    }
  );

  it.each(["switch", "checkbox"] as const)(
    "exposes disabled state for %s controls",
    (control) => {
      const onChange = vi.fn();
      render(
        <SettingRow
          checked
          control={control}
          disabled
          helperText="Unavailable right now."
          label="Care reminders"
          onChange={onChange}
        />
      );

      const element = screen.getByRole(control, { name: "Care reminders" });
      expect(element).toHaveProperty("disabled", true);
      fireEvent.click(element);
      expect(onChange).not.toHaveBeenCalled();
    }
  );
});
