// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { paged, salesperson } from "./merchantSalesFixtures";

const listSalespersons = vi.fn();
const createSalesperson = vi.fn();
const updateSalesperson = vi.fn();
const setSalespersonActive = vi.fn();

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    listSalespersons: (...args: unknown[]) => listSalespersons(...args),
    createSalesperson: (...args: unknown[]) => createSalesperson(...args),
    updateSalesperson: (...args: unknown[]) => updateSalesperson(...args),
    setSalespersonActive: (...args: unknown[]) => setSalespersonActive(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams("tab=salespersons"),
}));

const { SalespersonsPanel } = await import("./SalespersonsPanel");

const noop = () => {};
const renderPanel = (props: Partial<Parameters<typeof SalespersonsPanel>[0]> = {}) =>
  render(
    <SalespersonsPanel
      editing={false}
      onCloseEditor={noop}
      onEdit={noop}
      onOpen={noop}
      openId={null}
      {...props}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  listSalespersons.mockResolvedValue(
    paged([
      salesperson(),
      salesperson({ id: "rep-2", salespersonCode: "MPL-SALES-002", name: "Retired Rep", isActive: false }),
    ])
  );
});
afterEach(cleanup);

describe("Salespersons list", () => {
  it("shows code, name, contact, percentage and status together", async () => {
    renderPanel();

    const code = await screen.findByText("MPL-SALES-001");
    const row = code.closest("tr") as HTMLElement;
    expect(within(row).getByText("Nur Aisyah")).toBeTruthy();
    expect(within(row).getByText("aisyah@mypetlink.example")).toBeTruthy();
    expect(within(row).getByText("5%")).toBeTruthy();
    expect(within(row).getByText("Active")).toBeTruthy();
  });

  it("keeps the percentage on one line so it cannot read ambiguously", async () => {
    renderPanel();
    const code = await screen.findByText("MPL-SALES-001");
    const percentage = within(code.closest("tr") as HTMLElement).getByText("5%");

    expect(percentage.className).toContain("whitespace-nowrap");
  });

  it("shows an inactive salesperson as inactive rather than hiding them", async () => {
    renderPanel();

    const code = await screen.findByText("MPL-SALES-002");
    expect(within(code.closest("tr") as HTMLElement).getByText("Inactive")).toBeTruthy();
  });

  it("offers a status filter", async () => {
    renderPanel();
    await screen.findByText("MPL-SALES-001");

    expect(screen.getByLabelText("Status")).toBeTruthy();
  });

  it("explains a failed load without leaking the error code", async () => {
    listSalespersons.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something failed.")
    );
    renderPanel();

    expect(await screen.findByText(/couldn’t load salespersons/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("server_error");
  });
});

describe("Salesperson editor", () => {
  const openEditor = async () => {
    renderPanel({ editing: true, openId: "new" });
    return screen.findByTestId("salesperson-editor");
  };

  it("refuses a commission below zero, and says the range", async () => {
    const editor = await openEditor();
    const percentage = editor.querySelector('input[type="number"]') as HTMLInputElement;

    fireEvent.change(editor.querySelectorAll('input[type="text"]')[0], {
      target: { value: "Pat Lee" },
    });
    fireEvent.change(percentage, { target: { value: "-1" } });
    fireEvent.click(within(editor).getByTestId("save-salesperson"));

    expect(await screen.findByText("Enter a percentage between 0 and 100.")).toBeTruthy();
    expect(createSalesperson).not.toHaveBeenCalled();
  });

  it("refuses a commission above one hundred", async () => {
    const editor = await openEditor();

    fireEvent.change(editor.querySelectorAll('input[type="text"]')[0], {
      target: { value: "Pat Lee" },
    });
    fireEvent.change(editor.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: "101" },
    });
    fireEvent.click(within(editor).getByTestId("save-salesperson"));

    expect(await screen.findByText("Enter a percentage between 0 and 100.")).toBeTruthy();
    expect(createSalesperson).not.toHaveBeenCalled();
  });

  it("accepts the boundary values", async () => {
    createSalesperson.mockResolvedValue(salesperson({ defaultCommissionPercentage: 0 }));
    const editor = await openEditor();

    fireEvent.change(editor.querySelectorAll('input[type="text"]')[0], {
      target: { value: "Zero Rep" },
    });
    fireEvent.change(editor.querySelector('input[type="number"]') as HTMLInputElement, {
      target: { value: "0" },
    });
    fireEvent.click(within(editor).getByTestId("save-salesperson"));

    expect(await screen.findByText(/saved/i)).toBeTruthy();
  });

  it("asks for the name in plain words when the server rejects it", async () => {
    createSalesperson.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        Name: ["Enter the salesperson's name."],
      })
    );
    const editor = await openEditor();

    fireEvent.change(editor.querySelectorAll('input[type="text"]')[0], {
      target: { value: "Pat Lee" },
    });
    fireEvent.click(within(editor).getByTestId("save-salesperson"));

    expect(await screen.findByText("Enter the salesperson's name.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("field is required");
  });

  it("connects the message to its own field with a usable id", async () => {
    createSalesperson.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        Email: ["Enter a valid email address."],
      })
    );
    const editor = await openEditor();

    fireEvent.change(editor.querySelectorAll('input[type="text"]')[0], {
      target: { value: "Pat Lee" },
    });
    fireEvent.click(within(editor).getByTestId("save-salesperson"));
    await screen.findByText("Enter a valid email address.");

    const input = editor.querySelector('input[aria-invalid="true"]') as HTMLInputElement;
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).not.toContain(" ");
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Enter a valid email address."
    );
  });

  it("asks for a reload when someone else changed the record", async () => {
    createSalesperson.mockRejectedValue(
      new ApiClientError(
        409,
        "concurrency_conflict",
        "Someone else changed this record. Reload and try again."
      )
    );
    const editor = await openEditor();

    fireEvent.change(editor.querySelectorAll('input[type="text"]')[0], {
      target: { value: "Pat Lee" },
    });
    fireEvent.click(within(editor).getByTestId("save-salesperson"));

    expect(await screen.findByText(/updated by another administrator/i)).toBeTruthy();
  });
});

describe("Salesperson activation", () => {
  it("explains that deactivation does not disturb commission already earned", async () => {
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for MPL-SALES-001" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Commission already earned on past orders is unaffected/i)
    ).toBeTruthy();
  });

  it("offers activation for an inactive salesperson", async () => {
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for MPL-SALES-002" })
    );

    expect(screen.getByRole("menuitem", { name: "Activate" })).toBeTruthy();
  });
});
