// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type { MerchantListing } from "@/services/merchantDirectoryService";

const get = vi.fn(), updateLogo = vi.fn(), updateListing = vi.fn(), branch = vi.fn(), upload = vi.fn(), remove = vi.fn(), read = vi.fn();
vi.mock("@/services/merchantDirectoryService", () => ({ getMerchantListing: (...a: unknown[]) => get(...a),
  updateMerchantLogo: (...a: unknown[]) => updateLogo(...a), updateMerchantListing: (...a: unknown[]) => updateListing(...a), saveMerchantBranch: (...a: unknown[]) => branch(...a) }));
vi.mock("@/services/mediaService", () => ({ uploadMediaFile: (...a: unknown[]) => upload(...a), deleteMedia: (...a: unknown[]) => remove(...a) }));
vi.mock("@/lib/imageUpload", () => ({ readImageAsDataUrl: (...a: unknown[]) => read(...a) }));
const { MerchantListingPanel } = await import("./MerchantListingPanel");
const initial: MerchantListing = { showOnWebsite: false, businessDescription: null, isPublished: false,
  publicCode: "store", concurrencyToken: "AQ==", branches: [], logoMediaFileId: null, logoUrl: null };
const saved = { ...initial, concurrencyToken: "Ag==", logoMediaFileId: "logo-1", logoUrl: "https://media.example.test/logo.png" };
beforeEach(() => {
  get.mockReset().mockResolvedValue(initial); updateLogo.mockReset().mockResolvedValue(saved);
  updateListing.mockReset().mockResolvedValue(saved); branch.mockReset().mockResolvedValue(initial);
  upload.mockReset().mockResolvedValue({ mediaId: "logo-1" }); remove.mockReset().mockResolvedValue(undefined);
  read.mockReset().mockResolvedValue("data:image/png;base64,cHJldmlldw==");
});
afterEach(cleanup);
const panel = (canManage = true, onDirtyChange = vi.fn()) => render(<MerchantListingPanel merchantId="merchant-1" merchantName="Happy Pets"
  merchantActive merchantToken="AQ==" canManage={canManage} onDirtyChange={onDirtyChange} />);
async function select(file = new File(["image"], "logo.png", { type: "image/png" })) {
  fireEvent.change(await screen.findByLabelText("Merchant logo"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save logo" }).hasAttribute("disabled")).toBe(false));
}

describe("Merchant logo editing", () => {
  it("uploads only on Save, persists the reference, and reloads its preview", async () => {
    const dirty = vi.fn(); const view = panel(true, dirty); await select();
    expect(upload).not.toHaveBeenCalled(); expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Save logo" }));
    await screen.findByText("Merchant logo saved.");
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ category: "MerchantLogo", merchantId: "merchant-1", cleanupOnFailure: true }));
    expect(updateLogo).toHaveBeenCalledWith("merchant-1", "logo-1", "AQ==");
    expect(screen.getByAltText("Merchant logo preview").getAttribute("src")).toBe(saved.logoUrl);
    expect(dirty).toHaveBeenLastCalledWith(false);
    view.unmount(); get.mockResolvedValue(saved); panel();
    await waitFor(() => expect(screen.getByAltText("Merchant logo preview").getAttribute("src")).toBe(saved.logoUrl));
  });
  it("keeps merchant and branch drafts when a logo is saved", async () => {
    panel(); await screen.findByLabelText("Business description");
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: "Unsaved description" } });
    fireEvent.click(screen.getByRole("button", { name: "Add branch" }));
    fireEvent.change(screen.getByLabelText("Branch name"), { target: { value: "Unsaved branch" } });
    await select(); fireEvent.click(screen.getByRole("button", { name: "Save logo" })); await screen.findByText("Merchant logo saved.");
    expect((screen.getByLabelText("Business description") as HTMLTextAreaElement).value).toBe("Unsaved description");
    expect((screen.getByLabelText("Branch name") as HTMLInputElement).value).toBe("Unsaved branch");
    fireEvent.click(screen.getByRole("button", { name: "Save listing settings" }));
    await waitFor(() => expect(updateListing).toHaveBeenCalledWith("merchant-1", expect.objectContaining({ concurrencyToken: "Ag==", businessDescription: "Unsaved description" })));
  });
  it("removes a logo only on Save and supports replacing it", async () => {
    get.mockResolvedValue(saved); updateLogo.mockResolvedValue({ ...initial, concurrencyToken: "Aw==" }); panel();
    await screen.findByAltText("Merchant logo preview"); fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(updateLogo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save logo" })); await screen.findByText("Merchant logo removed.");
    expect(updateLogo).toHaveBeenCalledWith("merchant-1", null, "Ag=="); expect(upload).not.toHaveBeenCalled();
    await select(); fireEvent.click(screen.getByRole("button", { name: "Save logo" })); await screen.findByText("Merchant logo saved.");
    expect(updateLogo).toHaveBeenLastCalledWith("merchant-1", "logo-1", "Aw==");
  });
  it("retains the selected file on upload failure and permits retry", async () => {
    upload.mockRejectedValueOnce(new Error("Upload failed. Please check your connection.")); panel(); await select();
    fireEvent.click(screen.getByRole("button", { name: "Save logo" })); await screen.findByText("Upload failed. Please check your connection.");
    expect(screen.getByAltText("Merchant logo preview").getAttribute("src")).toContain("data:image/png");
    expect(updateLogo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save logo" })); await screen.findByText("Merchant logo saved.");
  });
  it("cleans up an unattached upload after a stale save and retains the draft", async () => {
    updateLogo.mockRejectedValue(new ApiClientError(409, "concurrency_conflict", "Changed")); panel(); await select();
    fireEvent.click(screen.getByRole("button", { name: "Save logo" }));
    await screen.findByText(/updated by another administrator/);
    expect(remove).toHaveBeenCalledWith("logo-1"); expect(screen.getByAltText("Merchant logo preview")).toBeTruthy();
  });
  it("does not silently adopt a concurrent logo update while a local file is selected", async () => {
    const view = panel(); await select();
    get.mockResolvedValue({ ...saved, logoMediaFileId: "another-admin-logo", concurrencyToken: "BA==" });
    view.rerender(<MerchantListingPanel merchantId="merchant-1" merchantActive merchantToken="BA==" canManage />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    updateLogo.mockRejectedValue(new ApiClientError(409, "concurrency_conflict", "Changed"));
    fireEvent.click(screen.getByRole("button", { name: "Save logo" }));
    await screen.findByText(/updated by another administrator/);
    expect(updateLogo).toHaveBeenCalledWith("merchant-1", "logo-1", "AQ==");
    expect(screen.getByAltText("Merchant logo preview").getAttribute("src")).toContain("data:image/png");
  });
  it.each([new File(["svg"], "logo.svg", { type: "image/svg+xml" }), new File([new Uint8Array(2097153)], "large.png", { type: "image/png" })])(
    "rejects invalid or oversized files without uploading", async file => {
      panel(); fireEvent.change(await screen.findByLabelText("Merchant logo"), { target: { files: [file] } });
      await screen.findByText(file.type === "image/svg+xml" ? "Please choose a PNG, JPG, or WebP image." : "Choose an image up to 2 MB.");
      expect(upload).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    });
  it("shows a placeholder without upload controls for read-only admins", async () => {
    panel(false); await screen.findByRole("img", { name: "Happy Pets logo placeholder" });
    expect(screen.queryByLabelText("Merchant logo")).toBeNull(); expect(screen.queryByRole("button", { name: "Save logo" })).toBeNull();
  });
});
