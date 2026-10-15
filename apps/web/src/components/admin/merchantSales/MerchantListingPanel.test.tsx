// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type { MerchantListing } from "@/services/merchantDirectoryService";

const get = vi.fn(), update = vi.fn(), save = vi.fn();
vi.mock("@/services/merchantDirectoryService", () => ({ getMerchantListing: (...a: unknown[]) => get(...a), updateMerchantListing: (...a: unknown[]) => update(...a), saveMerchantBranch: (...a: unknown[]) => save(...a) }));
const { MerchantListingPanel } = await import("./MerchantListingPanel");
const listing: MerchantListing = { showOnWebsite: false, businessDescription: null, isPublished: false, publicCode: "public-code", concurrencyToken: "AQ==", branches: [
  { id: "branch-1", name: "Main", address: { addressLine1: "1 Street", addressLine2: null, postcode: "50000", city: "KL", state: "KL", country: "Malaysia" }, googleMapsUrl: null, wazeUrl: null, latitude: null, longitude: null, contactPhone: null, whatsApp: null, businessHours: null, isActive: true, showOnWebsite: true, isPublished: false, displayOrder: 0, concurrencyToken: "Ag==" }
] };
beforeEach(() => { get.mockReset().mockResolvedValue(listing); update.mockReset().mockResolvedValue({ ...listing, showOnWebsite: true, isPublished: true }); save.mockReset().mockResolvedValue(listing); });
afterEach(cleanup);
const panel = (canManage = true) => render(<MerchantListingPanel merchantId="merchant-1" merchantActive merchantToken="AQ==" canManage={canManage} />);
describe("Merchant listing management", () => {
  it("separates active status from effective visibility and explains the parent dependency", async () => {
    get.mockResolvedValue({ ...listing, branches: [...listing.branches, { ...listing.branches[0], id: "inactive", name: "Closed location", isActive: false }] });
    panel(); await screen.findByText("Main");
    expect(screen.getByRole("heading", { name: "Store Locations (2)" })).toBeTruthy();
    const active = within(screen.getByText("Main").closest("article")!);
    expect(active.getByText("Active")).toBeTruthy(); expect(active.getByText("Hidden")).toBeTruthy();
    expect(active.getByText(/currently hidden by merchant settings/)).toBeTruthy();
    const inactive = within(screen.getByText("Closed location").closest("article")!);
    expect(inactive.getByText("Inactive")).toBeTruthy(); expect(inactive.getByText("Hidden")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Edit location" })).toHaveLength(2);
  });
  it("presents legacy validation messages as store locations without changing request keys", async () => {
    save.mockRejectedValue(new ApiClientError(400, "validation_failed", "Branch details are invalid.", { Name: ["Branch name is required."] }));
    panel(); await screen.findByText("Main");
    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await screen.findByText("Store location name is required.");
    expect(save).toHaveBeenCalledWith("merchant-1", "branch-1", expect.objectContaining({ name: "Main" }));
  });
  it("gives an empty merchant a clear location action without changing publication defaults", async () => {
    get.mockResolvedValue({ ...listing, branches: [] }); panel();
    await screen.findByText(/No store locations added/);
    expect(screen.getByRole("heading", { name: "Store Locations (0)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add location" }));
    expect(screen.getByLabelText("Store address")).toBeTruthy();
    expect((screen.getByLabelText("Show this location on website") as HTMLInputElement).checked).toBe(false);
  });
  it("requires explicit confirmation for publishing without changing sales fields", async () => {
    panel(); await screen.findByText("Main");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show on Website" }));
    fireEvent.change(screen.getByLabelText("Permission reference"), { target: { value: "Owner WhatsApp agreement 13 Oct" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I confirm permission/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save listing settings" }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("merchant-1", { showOnWebsite: true, businessDescription: null, concurrencyToken: "AQ==", permission: { source: "WhatsApp", reference: "Owner WhatsApp agreement 13 Oct", branchIds: ["branch-1"] } }));
    expect(await screen.findByRole("link", { name: "View public listing" })).toBeTruthy();
  });
  it("defaults new branches to hidden and saves structured fields", async () => {
    panel(); await screen.findByText("Main"); fireEvent.click(screen.getByRole("button", { name: "Add location" }));
    expect((screen.getByRole("checkbox", { name: "Show this location on website" }) as HTMLInputElement).checked).toBe(false);
    for (const [label, value] of [["Store name / Location name", "North"], ["Store address", "2 Street"], ["City", "Shah Alam"], ["State", "Selangor"], ["Postcode", "40000"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("merchant-1", null, expect.objectContaining({ name: "North", showOnWebsite: false, isActive: true, address: expect.objectContaining({ city: "Shah Alam" }) })));
  });
  it("disables an existing branch without clearing its consent choice", async () => {
    panel(); await screen.findByText("Main"); fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Active location" })); fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("merchant-1", "branch-1", expect.objectContaining({ isActive: false, showOnWebsite: true, concurrencyToken: "Ag==" })));
  });
  it("hides editing actions from a read-only administrator", async () => {
    panel(false); await screen.findByText("Main");
    expect(screen.queryByRole("button", { name: "Add location" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save listing settings" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: "Show on Website" }) as HTMLInputElement).disabled).toBe(true);
  });
  it("renders field validation and concurrency errors", async () => {
    save.mockRejectedValue(new ApiClientError(400, "validation_failed", "Invalid", { GoogleMapsUrl: ["Enter a supported HTTPS navigation link."] }));
    panel(); await screen.findByText("Main"); fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await screen.findByText("Enter a supported HTTPS navigation link.");
    update.mockRejectedValue(new ApiClientError(409, "concurrency_conflict", "Stale"));
    fireEvent.click(screen.getByRole("button", { name: "Save listing settings" }));
    await screen.findByText(/updated by another administrator/);
  });

  it("preserves unsaved merchant fields when a branch is saved", async () => {
    panel(); await screen.findByText("Main");
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: "Unsaved merchant description" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Show on Website" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.change(screen.getByLabelText("Store name / Location name"), { target: { value: "Changed branch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await screen.findByText("Store location saved.");
    expect(screen.getByDisplayValue("Unsaved merchant description")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Show on Website" }) as HTMLInputElement).checked).toBe(true);
  });

  it("preserves a branch draft during merchant save and parent token refresh", async () => {
    update.mockResolvedValue({ ...listing, businessDescription: "Saved description", concurrencyToken: "Aw==" });
    const view = panel(); await screen.findByText("Main");
    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.change(screen.getByLabelText("Store name / Location name"), { target: { value: "Unsaved branch name" } });
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: "Saved description" } });
    fireEvent.click(screen.getByRole("button", { name: "Save listing settings" }));
    await screen.findByText("Public listing settings saved.");
    get.mockResolvedValue({ ...listing, businessDescription: "Saved description", concurrencyToken: "Aw==" });
    view.rerender(<MerchantListingPanel merchantId="merchant-1" merchantActive merchantToken="Aw==" canManage />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.getByDisplayValue("Unsaved branch name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("merchant-1", "branch-1", expect.objectContaining({ name: "Unsaved branch name", concurrencyToken: "Ag==" })));
  });

  it("keeps a dirty merchant token across external changes and retains input on conflict", async () => {
    update.mockRejectedValue(new ApiClientError(409, "concurrency_conflict", "Stale"));
    const view = panel(); await screen.findByText("Main");
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: "My changes" } });
    get.mockResolvedValue({ ...listing, businessDescription: "Someone else", concurrencyToken: "Aw==" });
    view.rerender(<MerchantListingPanel merchantId="merchant-1" merchantActive merchantToken="Aw==" canManage />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Save listing settings" }));
    await screen.findByText(/updated by another administrator/);
    expect(update).toHaveBeenCalledWith("merchant-1", expect.objectContaining({ concurrencyToken: "AQ==", businessDescription: "My changes" }));
    expect(screen.getByDisplayValue("My changes")).toBeTruthy();
  });

  it("asks before reload, branch switching and cancelling discard dirty input", async () => {
    panel(); await screen.findByText("Main");
    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.change(screen.getByLabelText("Store name / Location name"), { target: { value: "Keep this draft" } });
    for (const name of ["Reload listing", "Add location", "Cancel"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(screen.getByDisplayValue("Keep this draft")).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Reload listing" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await screen.findByText("Listing reloaded."); expect(screen.queryByDisplayValue("Keep this draft")).toBeNull();
  });

  it("confirms effective republication on reactivation and records branch evidence", async () => {
    const inactive = { ...listing, showOnWebsite: true, branches: [{ ...listing.branches[0], isActive: false }] };
    get.mockResolvedValue(inactive); panel(); await screen.findByText("Main");
    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Active location" }));
    fireEvent.change(screen.getByLabelText("Permission reference"), { target: { value: "Approved Main branch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(save).not.toHaveBeenCalled(); expect(screen.getByRole("dialog", { name: "Change public availability?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("merchant-1", "branch-1", expect.objectContaining({ isActive: true, showOnWebsite: true, permission: { source: "WhatsApp", reference: "Approved Main branch" } })));
  });

  it("does not confirm or require evidence for branch edits that remain private", async () => {
    panel(); await screen.findByText("Main"); fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Active location" })); fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await screen.findByText("Store location saved."); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByLabelText("Permission reference")).toBeNull();
  });
  it("requires new evidence when a selected public branch moves to a different address", async () => {
    get.mockResolvedValue({ ...listing, showOnWebsite: true, isPublished: true }); panel(); await screen.findByText("Main");
    fireEvent.click(screen.getByRole("button", { name: "Edit location" }));
    expect(screen.queryByLabelText("Permission reference")).toBeNull();
    fireEvent.change(screen.getByLabelText("Store address"), { target: { value: "New approved location" } });
    fireEvent.change(screen.getByLabelText("Permission reference"), { target: { value: "Owner approved relocation" } });
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("merchant-1", "branch-1", expect.objectContaining({ permission: { source: "WhatsApp", reference: "Owner approved relocation" }, merchantConcurrencyToken: "AQ==" })));
  });
});
