// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { OWNER_SETTINGS_STORAGE_KEY } from "@/lib/ownerSettings";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  planSummaryProps: vi.fn(),
  writeText: vi.fn(),
  share: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
  getFriendlyApiErrorMessage: () => "Please try again.",
}));
vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));
vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));
vi.mock("@/components/portal/PlanSummaryCard", () => ({
  PlanSummaryCard: (props: unknown) => {
    mocks.planSummaryProps(props);
    return <div data-testid="plan-summary-card" />;
  },
}));

const { DashboardClient } = await import("./DashboardClient");

function renderDashboard() {
  render(
    <DashboardClient
      initialMoments={[]}
      initialPets={[mockPets[0]]}
      initialRecords={[]}
    />
  );
}

describe("DashboardClient API-mode initialization", () => {
  beforeEach(() => {
    mocks.getPets.mockReset();
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    mocks.planSummaryProps.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading without rendering server-provided mock pets and fetches once", async () => {
    let resolvePets: ((value: { data: never[] }) => void) | undefined;
    mocks.getPets.mockReturnValue(
      new Promise((resolve) => {
        resolvePets = resolve;
      })
    );

    renderDashboard();

    expect(screen.getByText("Loading owner portal")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
    expect(mocks.getPets).toHaveBeenCalledOnce();

    resolvePets?.({ data: [] });
    await screen.findByText("Welcome to MyPetLink");
  });

  it("shows the zero-pet onboarding empty state for an empty API response", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    renderDashboard();

    expect(await screen.findByText("Welcome to MyPetLink")).toBeTruthy();
    expect(screen.getByText("Add your first pet")).toBeTruthy();
    // No dashboard statistics or plan card for a brand-new owner.
    expect(screen.queryByTestId("plan-summary-card")).toBeNull();
    expect(screen.queryByText("Quick actions")).toBeNull();
  });

  it("renders a retryable error without falling back to mock pets", async () => {
    mocks.getPets.mockRejectedValue(new Error("offline"));
    renderDashboard();

    expect(await screen.findByText("Could not load your dashboard")).toBeTruthy();
    expect(screen.getByText("Please try again.")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
    await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
  });

  it("keeps the dashboard usable when a secondary request fails", async () => {
    mocks.getPets.mockResolvedValue({ data: [mockPets[0]] });
    mocks.getPetRecords.mockRejectedValueOnce(new Error("records down"));
    renderDashboard();

    // Pets still render even though the orders request failed.
    expect(await screen.findAllByText("Milo")).toBeTruthy();
    expect(screen.queryByText("Could not load your dashboard")).toBeNull();
  });
});

describe("DashboardClient with pets", () => {
  beforeEach(() => {
    // API-mode pets carry the server-computed contact-readiness flag; without
    // it a locally resolved owner contact (empty in tests) would apply.
    mocks.getPets.mockResolvedValue({
      data: [{ ...mockPets[0], hasUsableSafetyContact: true }],
    });
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    mocks.planSummaryProps.mockReset();
    mocks.writeText.mockReset();
    mocks.writeText.mockResolvedValue(undefined);
    mocks.share.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("has no Add Pet button in the welcome area or quick actions", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    // The only global create entry point lives in the app shell, not the page.
    expect(screen.queryByRole("button", { name: /add pet/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^add pet$/i })).toBeNull();
    expect(screen.queryByText("Add your first pet")).toBeNull();
  });

  it("shows quick actions without duplicate pet management", async () => {
    renderDashboard();

    await screen.findByText("Quick actions");
    const quickLabels = ["Care Records", "Moments", "Owner Contact"];
    for (const label of quickLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Manage Pets")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Manage pets" }).getAttribute("href")
    ).toBe("/pets");
  });

  it("points Owner Contact at the correct route", async () => {
    renderDashboard();

    await screen.findByText("Quick actions");
    expect(
      screen
        .getByRole("link", { name: "Update owner contact details" })
        .getAttribute("href")
    ).toBe("/settings#owner-contact");
  });

  it("shows the contact setup reminder only when no usable contact exists", async () => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "", whatsappNumber: "" })
    );
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.getByText("Add your contact details")).toBeTruthy();
    expect(
      screen.getByText("Help finders contact you if your pet is lost.")
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /add contact details/i })
        .getAttribute("href")
    ).toBe("/settings#owner-contact");
  });

  it("hides the contact setup reminder once contact details exist", async () => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "+60123456789", whatsappNumber: "" })
    );
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.queryByText("Add your contact details")).toBeNull();
  });

  it("shows only launched-product statistics", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.getByText("Pets")).toBeTruthy();
    expect(screen.getAllByText("Public profiles").length).toBeGreaterThan(0);
    expect(screen.getByText("Memories")).toBeTruthy();
    expect(screen.queryByText(/safety profile/i)).toBeNull();
    expect(screen.queryByText(/smart tags/i)).toBeNull();
    expect(screen.queryByText(/pending orders/i)).toBeNull();
  });

  it("renders one consolidated pet section immediately below Welcome", async () => {
    renderDashboard();

    await screen.findByRole("heading", { name: "Your pets" });
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Welcome back")).toBeLessThan(body.indexOf("Your pets"));
    expect(body.indexOf("Your pets")).toBeLessThan(body.indexOf("Upcoming care"));
    expect(screen.getByText("Manage and share your pet profiles.")).toBeTruthy();
    expect(screen.queryByText("Share your pets")).toBeNull();
    expect(document.querySelectorAll("[data-dashboard-pet-card]")).toHaveLength(1);
    expect(screen.getAllByText("Milo")).toHaveLength(1);

    expect(
      screen.getByRole("button", { name: "Share Milo's public profile" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Show QR code for Milo's public profile",
      })
    ).toBeTruthy();
    const viewProfile = screen.getByRole("link", {
      name: "View Milo's public profile",
    });
    expect(viewProfile.getAttribute("href")).toBe(mockPets[0].publicProfilePath);
    expect(viewProfile.getAttribute("target")).toBe("_blank");
    expect(viewProfile.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen.getByRole("link", { name: "Manage Milo" }).getAttribute("href")
    ).toBe(`/pets/${mockPets[0].id}`);
  });

  it("keeps the Public Profile QR available and pointed at the canonical profile", async () => {
    renderDashboard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Show QR code for Milo's public profile",
      })
    );

    const qrLink = screen.getByLabelText("Milo's profile QR link");
    expect(qrLink.textContent).toMatch(/\/p\/[^?]+$/);
    expect(qrLink.textContent).not.toContain("/q/");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  });

  it("does not fetch or render hidden tag and order dashboard data", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(screen.queryByText(/smart tag/i)).toBeNull();
    expect(screen.queryByText(/order/i)).toBeNull();
  });

  it("uses the native share sheet with the canonical Public Profile URL", async () => {
    mocks.share.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: mocks.share,
    });
    renderDashboard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Share Milo's public profile",
      })
    );

    await waitFor(() => expect(mocks.share).toHaveBeenCalledOnce());
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Milo on MyPetLink",
        url: expect.stringMatching(/\/p\/[^?]+$/),
      })
    );
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it("copies the Public Profile URL when native sharing is unavailable", async () => {
    renderDashboard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Share Milo's public profile",
      })
    );

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledOnce());
    expect(mocks.writeText.mock.calls[0]?.[0]).toMatch(/\/p\/[^?]+$/);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Milo's profile link copied."
    );
  });

  it("does not report an error when the native share sheet is cancelled", async () => {
    mocks.share.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: mocks.share,
    });
    renderDashboard();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Share Milo's public profile",
      })
    );

    await waitFor(() => expect(mocks.share).toHaveBeenCalledOnce());
    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not expose share, QR, or preview actions for a private profile", async () => {
    mocks.getPets.mockResolvedValue({
      data: [{ ...mockPets[0], publicProfileEnabled: false }],
    });
    renderDashboard();

    expect((await screen.findAllByText("Private")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Enable Milo's public profile" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /share .* profile/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /show qr code/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /view .*public profile/i })).toBeNull();
  });

  it("keeps pet-header navigation separate from profile action controls", async () => {
    renderDashboard();

    await screen.findByRole("link", { name: "Manage Milo" });
    const card = document.querySelector<HTMLElement>("[data-dashboard-pet-card]");

    expect(card).toBeTruthy();
    expect(card?.querySelector("a button")).toBeNull();
    expect(card?.querySelector("button a")).toBeNull();
    expect(card?.querySelector("a a")).toBeNull();
    expect(
      card?.querySelector("[data-dashboard-pet-actions]")?.classList.contains(
        "min-w-0"
      )
    ).toBe(true);
  });

  it("keeps long pet names constrained without hiding the visibility badge", async () => {
    const longName = "Princess Fluffington the Third of Kuala Lumpur";
    mocks.getPets.mockResolvedValue({
      data: [{ ...mockPets[0], name: longName }],
    });
    renderDashboard();

    const petName = await screen.findByText(longName);
    expect(petName.classList.contains("truncate")).toBe(true);
    expect(screen.getByText("Public")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: `Manage ${longName}` })
    ).toBeTruthy();
  });

  it("shows a one-pet Lost Mode alert linking directly to that pet", async () => {
    mocks.getPets.mockResolvedValue({
      data: [{ ...mockPets[0], lostModeEnabled: true }],
    });
    renderDashboard();

    await screen.findByText("1 pet is in Lost Mode");
    expect(
      screen.getByRole("link", { name: /1 pet is in Lost Mode/ }).getAttribute("href")
    ).toBe(`/pets/${mockPets[0].id}`);
  });

  it("links a multi-pet Lost Mode alert to the pet list", async () => {
    mocks.getPets.mockResolvedValue({
      data: mockPets.map((pet) => ({ ...pet, lostModeEnabled: true })),
    });
    renderDashboard();

    await screen.findByText("2 pets are in Lost Mode");
    expect(
      screen.getByRole("link", { name: /2 pets are in Lost Mode/ }).getAttribute("href")
    ).toBe("/pets");
  });

  it("renders Your Pets above Plan usage", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Your pets")).toBeGreaterThan(-1);
    expect(body.indexOf("Your pets")).toBeLessThan(body.indexOf("Plan usage"));
  });

  it("passes dashboard-loaded data into the plan card without re-fetching", async () => {
    renderDashboard();

    await screen.findAllByText("Milo");
    expect(mocks.planSummaryProps).toHaveBeenCalledWith(
      expect.objectContaining({ refreshOnMount: false })
    );
  });
});
