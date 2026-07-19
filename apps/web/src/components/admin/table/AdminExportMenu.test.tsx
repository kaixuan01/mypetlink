// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminExportMenu } from "./AdminExportMenu";

afterEach(cleanup);

const productionDescription =
  "Production export contains only the tag data required for QR printing and NFC encoding. Owner and pet information is excluded.";

describe("AdminExportMenu", () => {
  it("keeps the internal CSV and Excel exports working without a production section", () => {
    const onExport = vi.fn();
    render(<AdminExportMenu onExport={onExport} selectedCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Export all filtered rows as CSV" })
    );
    expect(onExport).toHaveBeenCalledWith("csv", "filtered");
    expect(screen.queryByText("Production")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Export 2 selected as Excel" })
    );
    expect(onExport).toHaveBeenCalledWith("xlsx", "selected");
  });

  it("shows the production actions in a clearly separated section with the privacy note", () => {
    const onProduction = vi.fn();
    render(
      <AdminExportMenu
        onExport={vi.fn()}
        production={{ onExport: onProduction, description: productionDescription }}
        selectedCount={3}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByText("Production")).toBeTruthy();
    expect(screen.getByText(productionDescription)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Export filtered rows for manufacturer" })
    );
    expect(onProduction).toHaveBeenCalledWith("filtered");

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Export 3 selected rows for manufacturer" })
    );
    expect(onProduction).toHaveBeenCalledWith("selected");
  });

  it("disables the selected production export when nothing is selected and explains why", () => {
    const onProduction = vi.fn();
    render(
      <AdminExportMenu
        onExport={vi.fn()}
        production={{ onExport: onProduction, description: productionDescription }}
        selectedCount={0}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));
    const item = screen.getByRole("menuitem", {
      name: "Export selected rows for manufacturer",
    }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.getAttribute("title")).toBe("Select rows to enable this export.");
    fireEvent.click(item);
    expect(onProduction).not.toHaveBeenCalled();
  });

  it("prevents duplicate export requests while busy", () => {
    render(
      <AdminExportMenu
        busy
        onExport={vi.fn()}
        production={{ onExport: vi.fn(), description: productionDescription }}
        selectedCount={1}
      />
    );

    const trigger = screen.getByRole("button", { name: /Exporting/ }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});
