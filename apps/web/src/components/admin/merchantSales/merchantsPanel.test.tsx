// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { merchant, paged, salesperson } from "./merchantSalesFixtures";

const listMerchants = vi.fn();
const listSalespersons = vi.fn();
const createMerchant = vi.fn();
const updateMerchant = vi.fn();
const setMerchantActive = vi.fn();

vi.mock("@/services/adminMerchantSalesService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantSalesService")
  >("@/services/adminMerchantSalesService");
  return {
    ...actual,
    listMerchants: (...args: unknown[]) => listMerchants(...args),
    listSalespersons: (...args: unknown[]) => listSalespersons(...args),
    createMerchant: (...args: unknown[]) => createMerchant(...args),
    updateMerchant: (...args: unknown[]) => updateMerchant(...args),
    setMerchantActive: (...args: unknown[]) => setMerchantActive(...args),
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn() }),
  usePathname: () => "/admin/merchant-sales",
  useSearchParams: () => new URLSearchParams("tab=merchants"),
}));

const { MerchantsPanel } = await import("./MerchantsPanel");

const noop = () => {};
const renderPanel = (props: Partial<Parameters<typeof MerchantsPanel>[0]> = {}) =>
  render(
    <MerchantsPanel
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
  listMerchants.mockResolvedValue(paged([merchant()]));
  listSalespersons.mockResolvedValue(
    paged([salesperson(), salesperson({ id: "rep-2", name: "Retired Rep", isActive: false })])
  );
});
afterEach(cleanup);

describe("Merchants list", () => {
  it("shows each merchant by code, business name and status", async () => {
    renderPanel();

    const code = await screen.findByText("MPL-MER-00001");
    expect(code).toBeTruthy();
    expect(screen.getByText("Happy Paws Veterinary Group Sdn Bhd")).toBeTruthy();

    // "Active" is also a filter option, so read the status from the row itself.
    const row = code.closest("tr") as HTMLElement;
    expect(within(row).getByText("Active")).toBeTruthy();
  });

  it("offers a status filter and a salesperson filter", async () => {
    renderPanel();
    await screen.findByText("MPL-MER-00001");

    expect(screen.getByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Salesperson")).toBeTruthy();
  });

  it("names the row action control after the merchant it acts on", async () => {
    renderPanel();

    expect(
      await screen.findByRole("button", { name: "Actions for MPL-MER-00001" })
    ).toBeTruthy();
  });

  it("explains an empty result instead of showing a blank table", async () => {
    listMerchants.mockResolvedValue(paged([], 0));
    renderPanel();

    expect(await screen.findByText(/No merchants/i)).toBeTruthy();
  });

  it("explains a failed load in words an operator can act on", async () => {
    listMerchants.mockRejectedValue(
      new ApiClientError(500, "server_error", "Something failed.")
    );
    renderPanel();

    const message = await screen.findByText(/couldn’t load merchants/i);
    expect(message).toBeTruthy();
    expect(document.body.textContent).not.toContain("server_error");
  });

  it("keeps the internal note out of the list and inside the detail", async () => {
    const { rerender } = renderPanel();
    await screen.findByText("MPL-MER-00001");
    expect(screen.queryByText(/Margin is thin/)).toBeNull();

    rerender(
      <MerchantsPanel
        editing={false}
        onCloseEditor={noop}
        onEdit={noop}
        onOpen={noop}
        openId="merchant-1"
      />
    );

    expect(await screen.findByText(/Margin is thin/)).toBeTruthy();
    expect(screen.getByText(/Admin only/i)).toBeTruthy();
  });
});

describe("Merchant editor", () => {
  const openEditor = async () => {
    renderPanel({ editing: true, openId: "new" });
    return screen.findByTestId("merchant-editor");
  };

  it("asks for the missing fields by name rather than reporting a code property", async () => {
    createMerchant.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        LegalBusinessName: ["Enter the registered business name."],
        "BillingAddress.AddressLine1": ["Enter the street address."],
        "BillingAddress.Postcode": ["Enter the postcode."],
      })
    );
    const editor = await openEditor();

    fireEvent.click(within(editor).getByTestId("save-merchant"));

    expect(await screen.findByText("Enter the registered business name.")).toBeTruthy();
    expect(screen.getByText("Enter the street address.")).toBeTruthy();
    expect(screen.getByText("Enter the postcode.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("field is required");
  });

  it("connects each message to its own field for a screen reader", async () => {
    createMerchant.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        LegalBusinessName: ["Enter the registered business name."],
      })
    );
    const editor = await openEditor();

    fireEvent.click(within(editor).getByTestId("save-merchant"));
    await screen.findByText("Enter the registered business name.");

    const input = editor.querySelector('input[aria-invalid="true"]') as HTMLInputElement;
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).not.toContain(" ");
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Enter the registered business name."
    );
  });

  it("names a duplicate registration number instead of asking for a reload", async () => {
    createMerchant.mockRejectedValue(
      new ApiClientError(
        409,
        "merchant_registration_duplicate",
        "Another merchant already uses this business registration number."
      )
    );
    const editor = await openEditor();

    fireEvent.click(within(editor).getByTestId("save-merchant"));

    expect(await screen.findByText(/business registration number/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("no longer available");
  });

  it("asks for a reload only when the record really was changed by someone else", async () => {
    createMerchant.mockRejectedValue(
      new ApiClientError(
        409,
        "concurrency_conflict",
        "Someone else changed this record. Reload and try again."
      )
    );
    const editor = await openEditor();

    fireEvent.click(within(editor).getByTestId("save-merchant"));

    expect(await screen.findByText(/updated by another administrator/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("RowVersion");
  });

  it("reveals the delivery address only when it differs from billing", async () => {
    const editor = await openEditor();

    expect(within(editor).queryByText("Deliver to")).toBeNull();
    fireEvent.click(editor.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(within(editor).getByText("Deliver to")).toBeTruthy();
  });

  it("does not offer an inactive salesperson for a new merchant", async () => {
    const editor = await openEditor();

    await waitFor(() => expect(listSalespersons).toHaveBeenCalled());
    const options = [...editor.querySelectorAll("option")].map((el) => el.textContent);
    expect(options.join(" ")).toContain("Nur Aisyah");
    expect(options.join(" ")).not.toContain("Retired Rep");
  });

  it("keeps what was typed when the save is rejected", async () => {
    createMerchant.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        ContactEmail: ["Enter a contact email address."],
      })
    );
    const editor = await openEditor();
    const first = editor.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;

    fireEvent.change(first, { target: { value: "Keeps My Typing Sdn Bhd" } });
    fireEvent.click(within(editor).getByTestId("save-merchant"));
    await screen.findByText("Enter a contact email address.");

    expect(first.value).toBe("Keeps My Typing Sdn Bhd");
  });

  it("sends the structured address, not a single blob of text", async () => {
    createMerchant.mockResolvedValue(merchant());
    const editor = await openEditor();
    const text = editor.querySelectorAll('input[type="text"]');

    fireEvent.change(text[0], { target: { value: "Structured Sdn Bhd" } });
    fireEvent.change(text[5], { target: { value: "Contact" } });
    fireEvent.change(editor.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: "contact@example.com" },
    });
    fireEvent.change(text[6], { target: { value: "+60123456789" } });
    fireEvent.change(text[7], { target: { value: "1 Jalan Uji" } });
    fireEvent.change(text[9], { target: { value: "50000" } });
    fireEvent.change(text[10], { target: { value: "Kuala Lumpur" } });
    fireEvent.change(text[11], { target: { value: "Wilayah Persekutuan" } });
    fireEvent.click(within(editor).getByTestId("save-merchant"));

    await waitFor(() => expect(createMerchant).toHaveBeenCalled());
    const sent = createMerchant.mock.calls[0][0] as {
      billingAddress: Record<string, string>;
      deliveryAddressSameAsBilling: boolean;
    };
    expect(sent.billingAddress.postcode).toBe("50000");
    expect(sent.billingAddress.city).toBe("Kuala Lumpur");
    expect(sent.deliveryAddressSameAsBilling).toBe(true);
  });
});

describe("Merchant activation", () => {
  it("offers deactivation rather than deletion", async () => {
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for MPL-MER-00001" })
    );

    expect(screen.getByRole("menuitem", { name: "Deactivate" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Delete/i })).toBeNull();
  });

  it("confirms before deactivating, and says what it means", async () => {
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for MPL-MER-00001" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/inactive merchant cannot be chosen/i)).toBeTruthy();
    expect(setMerchantActive).not.toHaveBeenCalled();
  });
});
