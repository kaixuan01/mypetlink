// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { ApiClientError } from "@/services/apiClient";
import type { DeliveryQuote } from "@/services/deliveryService";
import type { TagProduct } from "@/services/tagCatalogService";

const mocks = vi.hoisted(() => ({
  getDeliveryQuote: vi.fn(),
  getPets: vi.fn(),
}));

const catalog: TagProduct[] = [
  {
    slug: "smart-tag",
    name: "MyPetLink Smart Tag",
    shortDescription: "Durable identification for a safer way home.",
    media: [],
    variants: [
      {
        key: "PUBLICVARIANT001",
        sku: "PAW-STD-NFC",
        name: "Standard NFC",
        supportsQr: true,
        supportsNfc: true,
        tagVariant: "Standard",
        price: {
          basePrice: 59,
          discountAmount: 0,
          finalPrice: 59,
          currency: "MYR",
        },
        inStock: true,
        media: [],
      },
    ],
  },
];

const selangorQuote: DeliveryQuote = {
  stateCode: "SGR",
  stateName: "Selangor",
  country: "Malaysia",
  zoneCode: "PEN",
  zoneName: "Peninsular",
  deliveryMethod: "Standard Delivery",
  itemSubtotal: 59,
  discountAmount: 0,
  deliveryFee: 8,
  isFreeDelivery: false,
  total: 67,
  currency: "MYR",
};

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/tagCatalogService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagCatalogService")>();
  return { ...original, listTagProducts: vi.fn(async () => catalog) };
});
vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return { ...original, createTagOrder: vi.fn() };
});
vi.mock("@/services/deliveryService", () => ({
  listMalaysiaStates: vi.fn(async () => [
    { code: "SGR", name: "Selangor", zoneCode: "PEN", zoneName: "Peninsular", aliases: [] },
    { code: "SBH", name: "Sabah", zoneCode: "EM", zoneName: "East Malaysia", aliases: [] },
  ]),
  resolveLegacyStateCode: vi.fn(() => ""),
  getDeliveryQuote: (...args: unknown[]) => mocks.getDeliveryQuote(...args),
}));

const { TagOrderFlow } = await import("./TagOrderFlow");

beforeEach(() => {
  window.localStorage.clear();
  mocks.getPets.mockResolvedValue({ data: [mockPets[0]], error: null });
  mocks.getDeliveryQuote.mockResolvedValue(selangorQuote);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Smart Tag wizard pet selection", () => {
  it("preselects a valid pet-specific preference without another pet click", async () => {
    mocks.getPets.mockResolvedValue({ data: mockPets, error: null });
    render(<TagOrderFlow pets={[]} preselectedPetId={mockPets[1].id} />);

    await openChooseTagsStep();

    expect((screen.getByLabelText(/^Pet/) as HTMLSelectElement).value).toBe(mockPets[1].id);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Who is this physical tag for?")).toBeNull();
  });

  it("requires one selection in the wizard for multiple eligible pets", async () => {
    mocks.getPets.mockResolvedValue({ data: mockPets, error: null });
    render(<TagOrderFlow pets={[]} />);

    await openChooseTagsStep();

    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Pet/), { target: { value: mockPets[0].id } });
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);
    expect(await screen.findByText("Review tags")).toBeTruthy();
  });

  it("does not trust a cross-owner preferred pet id", async () => {
    mocks.getPets.mockResolvedValue({ data: mockPets, error: null });
    render(<TagOrderFlow pets={[]} preselectedPetId="pet_from_another_owner" />);

    await openChooseTagsStep();

    expect((screen.getByLabelText(/^Pet/) as HTMLSelectElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the contextual Add Pet path only after a successful empty result", async () => {
    mocks.getPets.mockResolvedValue({ data: [], error: null });
    render(<TagOrderFlow pets={[]} />);

    const link = await screen.findByRole("link", { name: "Add Pet" });
    expect(link.getAttribute("href")).toBe("/pets/new?returnTo=%2Ftags%2Forder");
  });

  it("keeps load failure retryable instead of treating it as zero pets", async () => {
    mocks.getPets
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: [mockPets[0]], error: null });
    render(<TagOrderFlow pets={[]} />);

    expect(await screen.findByText("Order details could not load")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add Pet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Choose your physical tags")).toBeTruthy();
  });
});

describe("delivery quote state", () => {
  it("does not quote or show availability for a blank or partial form", async () => {
    render(<TagOrderFlow pets={[]} />);
    await openDeliveryStep();

    expect(mocks.getDeliveryQuote).not.toHaveBeenCalled();
    expect(screen.queryByText(/Delivery is (?:not currently )?available/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Address line 1/), { target: { value: "12 Jalan Mawar" } });
    fireEvent.change(screen.getByLabelText(/State/), { target: { value: "SGR" } });
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(mocks.getDeliveryQuote).not.toHaveBeenCalled();
    expect(screen.queryByText(/Delivery is not currently available/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("quotes with optional fields empty and enables Continue only for the matching address", async () => {
    render(<TagOrderFlow pets={[]} />);
    await openDeliveryStep();
    fillRequiredDelivery("SGR");

    expect(screen.getByText("Calculating delivery...")).toBeTruthy();
    expect(await screen.findByText(/Delivery is available/i)).toBeTruthy();
    expect(screen.getByText(/Delivery fee:.*8\.00/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText(/Address line 2/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Notes for delivery/) as HTMLInputElement).value).toBe("");
  });

  it("renders configured unavailability once without a meaningless retry", async () => {
    mocks.getDeliveryQuote.mockRejectedValue(
      new ApiClientError(409, "delivery_unavailable", "No rate configured")
    );
    render(<TagOrderFlow pets={[]} />);
    await openDeliveryStep();
    fillRequiredDelivery("SGR");

    const messages = await screen.findAllByText(/Delivery is not currently available for this address/i);
    expect(messages).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Try delivery quote again" })).toBeNull();
    expect(screen.getByTestId("delivery-quote-status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getAllByText(/Delivery is not currently available/i)).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears stale success immediately when State changes", async () => {
    const sabahUnavailable = new ApiClientError(409, "delivery_unavailable", "No rate configured");
    mocks.getDeliveryQuote.mockImplementation((stateCode: string) =>
      stateCode === "SGR" ? Promise.resolve(selangorQuote) : Promise.reject(sabahUnavailable)
    );
    render(<TagOrderFlow pets={[]} />);
    await openDeliveryStep();
    fillRequiredDelivery("SGR");
    expect(await screen.findByText(/Delivery is available/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/State/), { target: { value: "SBH" } });

    expect(screen.queryByText(/Delivery is available/i)).toBeNull();
    expect(screen.queryByText(/Delivery fee:/i)).toBeNull();
    expect(screen.getByText("Calculating delivery...")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/Delivery is not currently available/i)).toBeTruthy();
  });

  it("ignores an older response after the address changes", async () => {
    const first = deferred<DeliveryQuote>();
    const second = deferred<DeliveryQuote>();
    mocks.getDeliveryQuote
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(<TagOrderFlow pets={[]} />);
    await openDeliveryStep();
    fillRequiredDelivery("SGR");
    await waitFor(() => expect(mocks.getDeliveryQuote).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/State/), { target: { value: "SBH" } });
    await waitFor(() => expect(mocks.getDeliveryQuote).toHaveBeenCalledTimes(2));
    second.reject(new ApiClientError(409, "delivery_unavailable", "No rate configured"));
    expect(await screen.findByText(/Delivery is not currently available/i)).toBeTruthy();
    first.resolve(selangorQuote);

    await waitFor(() => expect(screen.queryByText(/Delivery is available/i)).toBeNull());
    expect(screen.getAllByText(/Delivery is not currently available/i)).toHaveLength(1);
  });

  it("retries a temporary failure for the current address and clears the error", async () => {
    mocks.getDeliveryQuote
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(selangorQuote);
    render(<TagOrderFlow pets={[]} />);
    await openDeliveryStep();
    fillRequiredDelivery("SGR");

    expect(await screen.findByText(/couldn.t calculate delivery right now/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try delivery quote again" }));
    expect(screen.getByText("Calculating delivery...")).toBeTruthy();
    expect(await screen.findByText(/Delivery is available/i)).toBeTruthy();
    expect(screen.queryByText(/couldn.t calculate delivery right now/i)).toBeNull();
    expect(mocks.getDeliveryQuote).toHaveBeenCalledTimes(2);
  });
});

async function openChooseTagsStep() {
  await screen.findByText("Choose your physical tags");
}

async function openDeliveryStep() {
  await openChooseTagsStep();
  const pet = screen.getByLabelText(/^Pet/) as HTMLSelectElement;
  if (!pet.value) fireEvent.change(pet, { target: { value: mockPets[0].id } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Review tags")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Delivery details")).toBeTruthy();
}

function fillRequiredDelivery(stateCode: string) {
  fireEvent.change(screen.getByLabelText(/Recipient name/), { target: { value: "Kai Xuan" } });
  fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: "123456789" } });
  fireEvent.change(screen.getByLabelText(/Address line 1/), { target: { value: "12 Jalan Mawar" } });
  fireEvent.change(screen.getByLabelText(/Postcode/), { target: { value: "47300" } });
  fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Petaling Jaya" } });
  fireEvent.change(screen.getByLabelText(/State/), { target: { value: stateCode } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
