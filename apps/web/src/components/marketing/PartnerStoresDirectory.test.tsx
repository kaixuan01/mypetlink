// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import type { PublicPartnerStore } from "@/services/merchantDirectoryService";
import { renderToString } from "react-dom/server";
import { metadata } from "@/app/where-to-buy/page";

const list = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/services/merchantDirectoryService", () => ({ listPartnerStores: (...args: unknown[]) => list(...args) }));
const { PartnerStoresDirectory } = await import("./PartnerStoresDirectory");
const store: PublicPartnerStore = { publicCode: "public-code", name: "Happy Pets", businessDescription: "Physical pet stores", branches: [
  { name: "Main", address: { addressLine1: "1 Pet Street", addressLine2: null, postcode: "50000", city: "Kuala Lumpur", state: "Kuala Lumpur", country: "Malaysia" }, googleMapsUrl: "https://www.google.com/maps/?q=Pets", wazeUrl: null, latitude: null, longitude: null, contactPhone: null, whatsApp: null, businessHours: "Mon–Sat 10am–6pm" },
  { name: "North", address: { addressLine1: "2 Pet Street", addressLine2: null, postcode: "40000", city: "Shah Alam", state: "Selangor", country: "Malaysia" }, googleMapsUrl: null, wazeUrl: "https://www.waze.com/ul?ll=3,101", latitude: null, longitude: null, contactPhone: "+60123456789", whatsApp: "+60123456789", businessHours: null },
] };
beforeEach(() => { list.mockReset(); window.history.replaceState(null, "", "/where-to-buy"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PartnerStoresDirectory", () => {
  it.each([false, true])("keeps directory metadata indexable with published stores=%s without embedding records", async published => {
    list.mockResolvedValue({ items: published ? [store] : [], total: published ? 1 : 0 });
    const html = renderToString(<PartnerStoresDirectory />);
    expect(html).not.toContain("Happy Pets"); expect(html).not.toContain("1 Pet Street"); expect(list).not.toHaveBeenCalled();
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toContain("/where-to-buy");
    render(<PartnerStoresDirectory />);
    await screen.findByText(published ? "Happy Pets" : /No partner stores are listed yet/);
    expect(metadata.robots).toMatchObject({ index: true });
  });
  it("groups branches and shows only each available provider with safe external links", async () => {
    list.mockResolvedValue({ items: [store], total: 1 }); render(<PartnerStoresDirectory />);
    await screen.findByText("Happy Pets");
    expect(screen.getByText("Main")).toBeTruthy(); expect(screen.getByText("North")).toBeTruthy();
    expect(screen.getByText(/1 Pet Street/)).toBeTruthy(); expect(screen.getByText(/Shah Alam/)).toBeTruthy();
    for (const name of ["Google Maps", "Waze", "WhatsApp"]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("target")).toBe("_blank"); expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.getByRole("link", { name: "Call branch" }).getAttribute("href")).toBe("tel:+60123456789");
  });
  it("supports searching by location and paginates", async () => {
    list.mockResolvedValue({ items: [store], total: 41 }); render(<PartnerStoresDirectory />);
    await screen.findByText("Happy Pets");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(list.mock.calls.some(args => args[0] === 2)).toBe(true));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Selangor" } });
    await waitFor(() => expect(list.mock.calls.some(args => args[0] === 1 && args[1] === "Selangor")).toBe(true));
  });
  it("clears stale listings on focus and resolves withdrawn public links safely", async () => {
    window.history.replaceState(null, "", "/where-to-buy?store=public-code");
    list.mockResolvedValueOnce({ items: [store], total: 1 }).mockRejectedValue(new ApiClientError(404, "partner_store_not_found", "Unavailable"));
    render(<PartnerStoresDirectory />); await screen.findByText("Happy Pets");
    fireEvent(window, new Event("focus"));
    await screen.findByText("This store is no longer available in the directory.");
    expect(screen.queryByText("Happy Pets")).toBeNull();
    expect(list.mock.calls[0][2]).toBe("public-code");
  });
  it("shows empty and connection failure states and allows retry", async () => {
    list.mockResolvedValueOnce({ items: [], total: 0 }).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ items: [store], total: 1 });
    render(<PartnerStoresDirectory />); await screen.findByText(/No partner stores are listed yet/);
    fireEvent(window, new Event("focus")); await screen.findByText(/We couldn’t load partner stores/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByText("Happy Pets");
  });
  it("treats a list 404 as a loading failure rather than a withdrawn store", async () => {
    list.mockRejectedValue(new ApiClientError(404, "http_404", "Missing route"));
    render(<PartnerStoresDirectory />);
    await screen.findByText(/We couldn’t load partner stores/);
    expect(screen.queryByText(/This store is no longer available/)).toBeNull();
  });
  it("retains cards during background refresh and removes withdrawn results on success", async () => {
    let finish!: (value: { items: PublicPartnerStore[]; total: number }) => void;
    list.mockResolvedValueOnce({ items: [store], total: 1 }).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<PartnerStoresDirectory />); await screen.findByText("Happy Pets");
    fireEvent(window, new Event("focus"));
    await screen.findByText("Refreshing partner stores…");
    expect(screen.getByText("Happy Pets")).toBeTruthy(); expect(screen.getByText("Main")).toBeTruthy();
    finish({ items: [], total: 0 }); await screen.findByText(/No partner stores are listed yet/);
    expect(screen.queryByText("Happy Pets")).toBeNull();
  });
  it("retains fresh results on transient failure but expires them within a minute", async () => {
    list.mockResolvedValueOnce({ items: [store], total: 1 }).mockRejectedValue(new Error("Offline"));
    render(<PartnerStoresDirectory />); await screen.findByText("Happy Pets");
    fireEvent(window, new Event("focus")); await screen.findByText(/We couldn’t refresh partner stores/);
    expect(screen.getByText("Happy Pets")).toBeTruthy();
    vi.useFakeTimers();
    // Focus again under fake timers to schedule the remaining freshness lease.
    await act(async () => { fireEvent(window, new Event("focus")); await vi.advanceTimersByTimeAsync(60001); });
    expect(screen.queryByText("Happy Pets")).toBeNull();
  });
  it("expires old cards even when a background request is still pending", async () => {
    list.mockResolvedValueOnce({ items: [store], total: 1 }).mockImplementation(() => new Promise(() => {}));
    render(<PartnerStoresDirectory />); await screen.findByText("Happy Pets");
    vi.useFakeTimers();
    await act(async () => { fireEvent(window, new Event("focus")); });
    expect(screen.getByText("Happy Pets")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(60001); });
    expect(screen.queryByText("Happy Pets")).toBeNull();
  });
});
