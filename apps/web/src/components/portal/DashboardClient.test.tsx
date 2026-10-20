// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { OWNER_SETTINGS_STORAGE_KEY } from "@/lib/ownerSettings";
import { selectDashboardCareRecords } from "@/lib/careRecordStatus";
import type {
  PetListItem,
  PetMoment,
  UpcomingCareItem,
  UpcomingCareSummary,
} from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetMoments: vi.fn(),
  getUpcomingCareSummary: vi.fn(),
  getUpcomingCarePage: vi.fn(),
  getPetRecords: vi.fn(),
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
  getUpcomingCareSummary: (...args: unknown[]) => mocks.getUpcomingCareSummary(...args),
  getUpcomingCarePage: (...args: unknown[]) => mocks.getUpcomingCarePage(...args),
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

const { DashboardClient } = await import("./DashboardClient");

const milo = mockPets[0];
const luna = mockPets[1];

function renderDashboard() {
  render(<DashboardClient initialPets={[milo]} />);
}

function pet(overrides: Partial<PetListItem> = {}): PetListItem {
  return { ...milo, hasUsableSafetyContact: true, ...overrides };
}

function careItem(
  title: string,
  dueDate: string,
  status: UpcomingCareItem["status"],
  overrides: Partial<UpcomingCareItem> = {}
): UpcomingCareItem {
  return {
    id: `care-${title.replace(/\W+/g, "-").toLowerCase()}`,
    petId: milo.id,
    petName: milo.name,
    type: "Vaccine",
    title,
    dueDate,
    dueDateIso: "2026-10-20",
    status,
    ...overrides,
  };
}

/**
 * A consistent care summary built the way the service builds one: exact
 * counts and the selected items for all pets and for each pet.
 */
function snapshot(
  items: UpcomingCareItem[] = [],
  options: {
    petIdsWithCareRecords?: string[];
    complete?: boolean;
    /** Overrides the all-pets pending count (an incomplete summary's exact total). */
    total?: number;
    pets?: string[];
  } = {}
): UpcomingCareSummary {
  const withRecords = new Set(
    options.petIdsWithCareRecords ?? items.map((item) => item.petId)
  );
  const pets = options.pets ?? [milo.id, luna.id];
  const scope = (petId: string | null) => {
    const scoped = items.filter((item) => petId === null || item.petId === petId);
    return {
      petId,
      hasCareRecords:
        petId === null ? pets.some((id) => withRecords.has(id)) : withRecords.has(petId),
      pendingCount:
        petId === null && options.total !== undefined ? options.total : scoped.length,
      dueWithinHorizonCount: scoped.filter((item) => item.status !== "upcoming").length,
      overdueCount: scoped.filter((item) => item.status === "overdue").length,
      items: selectDashboardCareRecords(scoped, 3),
    };
  };

  return {
    asOfDate: "2026-10-20",
    horizonDate: "2026-11-19",
    complete: options.complete ?? true,
    scopes: [scope(null), ...pets.map(scope)],
  };
}

function moment(
  title: string,
  date: string,
  overrides: Partial<PetMoment> = {}
): PetMoment {
  return {
    id: `moment-${title.replace(/\W+/g, "-").toLowerCase()}`,
    petId: milo.id,
    title,
    date,
    type: "Funny Moment",
    caption: "",
    media: [],
    visibility: "Private",
    showOnPublicProfile: false,
    showInLifeTimeline: false,
    ...overrides,
  };
}

function photo(file: string) {
  const url = `https://media.example.test/${file}`;
  return [{ id: `media-${file}`, type: "image" as const, url, sortOrder: 0 }];
}

function momentsResponse(moments: PetMoment[]) {
  return { data: moments, meta: { total: moments.length } };
}

function findCareSection() {
  return screen.findByRole("region", { name: "Care coming up" });
}

function findMomentsSection() {
  return screen.findByRole("region", { name: "Recent Moments" });
}

beforeEach(() => {
  mocks.getPets.mockReset();
  mocks.getPetMoments.mockReset();
  mocks.getUpcomingCareSummary.mockReset();
  mocks.getUpcomingCarePage.mockReset();
  mocks.getUpcomingCarePage.mockRejectedValue(new Error("The Dashboard must not stitch pages."));
  mocks.getPetRecords.mockReset();
  mocks.getPets.mockResolvedValue({ data: [pet()] });
  mocks.getPetMoments.mockResolvedValue(momentsResponse([]));
  mocks.getUpcomingCareSummary.mockResolvedValue(snapshot());
  mocks.writeText.mockReset();
  mocks.writeText.mockResolvedValue(undefined);
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

describe("Dashboard loading and failures", () => {
  it("shows a placeholder without rendering server-provided pets and fetches pets once", async () => {
    let resolvePets: ((value: { data: never[] }) => void) | undefined;
    mocks.getPets.mockReturnValue(
      new Promise((resolve) => {
        resolvePets = resolve;
      })
    );

    renderDashboard();

    expect(screen.getByRole("status").textContent).toBe("Loading your dashboard");
    expect(screen.queryByText("Milo")).toBeNull();
    expect(mocks.getPets).toHaveBeenCalledOnce();

    resolvePets?.({ data: [] });
    await screen.findByText("Welcome to MyPetLink");
  });

  it("shows the zero-pet onboarding without empty content sections", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    renderDashboard();

    expect(await screen.findByText("Welcome to MyPetLink")).toBeTruthy();
    expect(screen.getByText("Add your first pet")).toBeTruthy();
    expect(screen.queryByText("Care coming up")).toBeNull();
    expect(screen.queryByText("Recent Moments")).toBeNull();
    expect(mocks.getUpcomingCareSummary).not.toHaveBeenCalled();
    expect(mocks.getPetMoments).not.toHaveBeenCalled();
  });

  it("renders a retryable error without falling back to local pets", async () => {
    mocks.getPets.mockRejectedValue(new Error("offline"));
    renderDashboard();

    expect(await screen.findByText("Could not load your dashboard")).toBeTruthy();
    expect(screen.getByText("Please try again.")).toBeTruthy();
    expect(screen.queryByText("Milo")).toBeNull();
  });

  it("renders the pets while care and Moments are still loading", async () => {
    mocks.getUpcomingCareSummary.mockReturnValue(new Promise(() => {}));
    mocks.getPetMoments.mockReturnValue(new Promise(() => {}));
    renderDashboard();

    expect(await screen.findByRole("link", { name: "Manage Milo" })).toBeTruthy();
    expect((await findCareSection()).getAttribute("aria-busy")).toBe("true");
    expect((await findMomentsSection()).getAttribute("aria-busy")).toBe("true");
    expect(within((await findCareSection())).queryByText(/nothing due|no care/i)).toBeNull();
  });

  it("never turns a failed care read into an empty answer, and retries in place", async () => {
    mocks.getUpcomingCareSummary.mockRejectedValueOnce(new Error("care down"));
    mocks.getPetMoments.mockResolvedValue(
      momentsResponse([moment("Sunny nap", "18 Oct 2026", { media: photo("nap.jpg") })])
    );
    renderDashboard();

    expect(await screen.findByText("We couldn't load care dates right now.")).toBeTruthy();
    expect(screen.queryByText(/nothing due/i)).toBeNull();
    expect(screen.queryByText("No care records yet.")).toBeNull();
    expect(screen.queryByText("No pending care dates.")).toBeNull();
    // The rest of the page is still there.
    expect(screen.getByRole("link", { name: "Manage Milo" })).toBeTruthy();
    expect(await within((await findMomentsSection())).findByText("Sunny nap")).toBeTruthy();

    mocks.getUpcomingCareSummary.mockResolvedValueOnce(
      snapshot([careItem("Rabies booster", "12 Oct 2026", "overdue")])
    );
    fireEvent.click(within((await findCareSection())).getByRole("button", { name: "Try again" }));

    expect(await within((await findCareSection())).findByText("Rabies booster")).toBeTruthy();
    expect(mocks.getUpcomingCareSummary).toHaveBeenCalledTimes(2);
  });

  it("shows an incomplete summary as partial, never as everything due", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([careItem("Rabies booster", "12 Oct 2026", "overdue")], {
        total: 1400,
        complete: false,
      })
    );
    renderDashboard();

    expect(await within((await findCareSection())).findByText("Rabies booster")).toBeTruthy();
    expect(
      within((await findCareSection())).getByText(/more care dates than we can show here/)
    ).toBeTruthy();
    expect(within((await findCareSection())).queryByText(/nothing due/i)).toBeNull();
    // The count is exact even though not every item could be checked.
    expect(document.querySelector("[data-dashboard-care-more] .sm\\:inline")?.textContent).toBe(
      "1399 more care dates"
    );
  });

  it("reports an incomplete summary with no rows for this scope as partial, not empty", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([], { total: 3, complete: false, petIdsWithCareRecords: [milo.id] })
    );
    renderDashboard();

    expect(
      await within((await findCareSection())).findByText(/more care dates than we can show here/)
    ).toBeTruthy();
    expect(within((await findCareSection())).queryByText("No pending care dates.")).toBeNull();
  });

  it("keeps Moments that loaded when another pet's Moments failed", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet(), pet({ ...luna })] });
    mocks.getPetMoments.mockImplementation(async (petId: string) => {
      if (petId === luna.id) throw new Error("down");
      return momentsResponse([moment("Park walk", "17 Oct 2026", { media: photo("walk.jpg") })]);
    });
    renderDashboard();

    expect(await within((await findMomentsSection())).findByText("Park walk")).toBeTruthy();
    expect(within((await findMomentsSection())).getByText(/Some Moments couldn.t be loaded/)).toBeTruthy();
  });

  it("shows a retryable failure when no Moments could be read", async () => {
    mocks.getPetMoments.mockRejectedValueOnce(new Error("down"));
    renderDashboard();

    expect(await screen.findByText("We couldn't load Moments right now.")).toBeTruthy();
    expect(within((await findMomentsSection())).queryByText("A small moment is worth keeping.")).toBeNull();

    mocks.getPetMoments.mockResolvedValueOnce(momentsResponse([moment("Back again", "19 Oct 2026")]));
    fireEvent.click(within((await findMomentsSection())).getByRole("button", { name: "Try again" }));
    expect(await within((await findMomentsSection())).findByText("Back again")).toBeTruthy();
  });
});

describe("Dashboard layout", () => {
  it("puts Lost Mode first, then the greeting, pets, care and Moments", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet({ lostModeEnabled: true })] });
    renderDashboard();

    await screen.findByRole("heading", { name: "Your pets" });
    const body = document.body.textContent ?? "";
    const order = [
      "1 pet is in Lost Mode",
      "Welcome back",
      "Your pets",
      "Care coming up",
      "Recent Moments",
    ].map((text) => body.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("removes statistics tiles, navigation tiles and the plan usage card", async () => {
    renderDashboard();

    await screen.findByRole("heading", { name: "Your pets" });
    expect(screen.queryByText("Quick actions")).toBeNull();
    expect(screen.queryByText("Plan usage")).toBeNull();
    expect(screen.queryByText("Share Profiles")).toBeNull();
    expect(screen.queryByRole("link", { name: "Update owner contact details" })).toBeNull();
    // The only global create entry point lives in the app shell.
    expect(screen.queryByRole("button", { name: /add pet/i })).toBeNull();
    expect(screen.queryByText(/smart tag/i)).toBeNull();
    expect(screen.queryByText(/order/i)).toBeNull();
  });

  it("greets a one-pet household by its pet and shows no filter", async () => {
    renderDashboard();

    expect(await screen.findByText("Here's what's coming up for Milo.")).toBeTruthy();
    expect(document.querySelector("[data-dashboard-pet-filter]")).toBeNull();
  });

  it("shows each pet with a recognisable photo-sized avatar and its existing actions", async () => {
    renderDashboard();

    const manage = await screen.findByRole("link", { name: "Manage Milo" });
    expect(manage.getAttribute("href")).toBe(`/pets/${milo.id}`);
    expect(manage.querySelector(".h-16.w-16")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share Milo" })).toBeTruthy();
    const view = screen.getByRole("link", { name: "View Milo's Share Profile" });
    expect(view.getAttribute("href")).toBe(milo.publicProfilePath);
    expect(view.getAttribute("target")).toBe("_blank");
    expect(view.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.querySelectorAll("[data-dashboard-pet-card]")).toHaveLength(1);
  });

  it("keeps pet-card navigation separate from its action controls", async () => {
    renderDashboard();

    await screen.findByRole("link", { name: "Manage Milo" });
    const card = document.querySelector<HTMLElement>("[data-dashboard-pet-card]");
    expect(card?.querySelector("a button")).toBeNull();
    expect(card?.querySelector("button a")).toBeNull();
    expect(card?.querySelector("a a")).toBeNull();
  });

  it("keeps long pet names constrained without hiding the visibility badge", async () => {
    const longName = "Princess Fluffington the Third of Kuala Lumpur";
    mocks.getPets.mockResolvedValue({ data: [pet({ name: longName })] });
    renderDashboard();

    const petName = await screen.findByText(longName);
    expect(petName.classList.contains("truncate")).toBe(true);
    expect(petName.getAttribute("title")).toBe(longName);
    expect(screen.getByText("Public")).toBeTruthy();
  });

  it("allows realistic pet metadata to use two lines", async () => {
    mocks.getPets.mockResolvedValue({
      data: [
        pet({
          species: "Dog",
          breed: "Labrador Retriever and Golden Retriever Mix",
          birthday: "Not set",
          estimatedBirthYear: 2021,
        }),
      ],
    });
    renderDashboard();

    const metadata = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-dashboard-pet-metadata]");
      expect(element).toBeTruthy();
      return element!;
    });
    expect(metadata.textContent).toContain("Labrador Retriever and Golden Retriever Mix");
    expect(metadata.classList.contains("line-clamp-2")).toBe(true);
  });

  it("links a one-pet Lost Mode alert to that pet and a multi-pet one to the list", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet({ lostModeEnabled: true })] });
    renderDashboard();
    expect(
      (await screen.findByRole("link", { name: /1 pet is in Lost Mode/ })).getAttribute("href")
    ).toBe(`/pets/${milo.id}`);

    cleanup();
    mocks.getPets.mockResolvedValue({
      data: mockPets.map((item) => ({ ...item, lostModeEnabled: true })),
    });
    renderDashboard();
    expect(
      (await screen.findByRole("link", { name: /2 pets are in Lost Mode/ })).getAttribute("href")
    ).toBe("/pets");
  });

  it("shows four pet cards and a link to the rest for a large household", async () => {
    mocks.getPets.mockResolvedValue({
      data: ["A", "B", "C", "D", "E"].map((suffix) =>
        pet({ id: `pet_${suffix}`, name: `Pet ${suffix}` })
      ),
    });
    renderDashboard();

    expect(await screen.findByRole("link", { name: "View all 5 pets" })).toBeTruthy();
    expect(document.querySelectorAll("[data-dashboard-pet-card]")).toHaveLength(4);
  });

  it("shows a gentle memorial view for a memorial-only household", async () => {
    mocks.getPets.mockResolvedValue({
      data: [pet({ lifecycleStatus: "Memorial" })],
    });
    renderDashboard();

    expect(await screen.findByText("In loving memory")).toBeTruthy();
    expect(screen.queryByText("Care coming up")).toBeNull();
    expect(screen.queryByText("Recent Moments")).toBeNull();
    expect(screen.queryByText("Add your first pet")).toBeNull();
    expect(screen.queryByText("Celebrate today")).toBeNull();
    expect(mocks.getUpcomingCareSummary).not.toHaveBeenCalled();
  });
});

describe("Dashboard sharing", () => {
  it("opens the Share Center from the pet card with its four first choices", async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Share Milo" }));
    expect(screen.getByRole("heading", { name: "Share Milo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy Profile Link/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show Profile QR/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /More sharing options/ })).toBeTruthy();
  });

  it("keeps the Share Profile QR inside the Share Center", async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Share Milo" }));
    fireEvent.click(screen.getByRole("button", { name: /Show Profile QR/ }));
    const qrLink = screen.getByLabelText("Milo's Share Profile link");
    expect(qrLink.textContent).toMatch(/\/p\/[^?]+$/);
    expect(qrLink.textContent).not.toContain("/q/");
  });

  it("copies the canonical Share Profile URL", async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Share Milo" }));
    fireEvent.click(screen.getByRole("button", { name: /Copy Profile Link/ }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledOnce());
    expect(mocks.writeText.mock.calls[0]?.[0]).toMatch(/\/p\/[^?]+\?share=[a-z0-9]+$/);
    expect(mocks.writeText.mock.calls[0]?.[0]).not.toContain("/q/");
  });

  it("offers no share actions for a private profile", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet({ publicProfileEnabled: false })] });
    renderDashboard();

    expect((await screen.findAllByText("Private")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Enable Milo's Share Profile" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share Milo" })).toBeNull();
  });
});

describe("Care coming up", () => {
  it("reads care from the owner-wide pending read, never per-pet history", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet(), pet({ ...luna })] });
    renderDashboard();

    await screen.findByRole("heading", { name: "Care coming up" });
    await waitFor(() => expect(mocks.getUpcomingCareSummary).toHaveBeenCalledOnce());
    expect(mocks.getPetRecords).not.toHaveBeenCalled();
  });

  it("shows the title, pet, status and exact date with a Log as done link", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet(), pet({ ...luna })] });
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([
        careItem("Rabies booster", "12 Oct 2026", "overdue", {
          id: "4f0c2c4e-1111-4b1b-9aa5-000000000001",
          careName: "Nobivac Rabies",
        }),
      ])
    );
    renderDashboard();

    const row = (await screen.findByText("Rabies booster · Nobivac Rabies")).closest<HTMLElement>(
      "[data-dashboard-care-item]"
    )!;
    expect(row.textContent).toContain("Milo");
    expect(row.textContent).toContain("Vaccine");
    expect(row.textContent).toContain("Overdue");
    expect(within(row).getByText("Due 12 Oct 2026")).toBeTruthy();

    const log = within(row).getByRole("link", { name: "Log Rabies booster for Milo as done" });
    expect(log.textContent).toBe("Log as done");
    // Only the opaque record id travels in the address — no title or notes.
    expect(log.getAttribute("href")).toBe(
      `/pets/${milo.id}/records?complete=4f0c2c4e-1111-4b1b-9aa5-000000000001`
    );
    expect(log.getAttribute("href")).not.toMatch(/rabies|nobivac/i);
  });

  it("keeps the most recently missed item and the nearest coming items", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([
        careItem("Old booster", "01 Jan 2024", "overdue"),
        careItem("Grooming", "12 Oct 2026", "overdue"),
        careItem("Vet check", "22 Oct 2026", "due-soon"),
        careItem("Medication review", "30 Oct 2026", "due-soon"),
        careItem("Dental", "01 Jan 2027", "upcoming"),
      ])
    );
    renderDashboard();

    await within((await findCareSection())).findByText("Grooming");
    const titles = [...(await findCareSection()).querySelectorAll("[data-dashboard-care-item]")].map(
      (row) => row.querySelector("p")?.textContent
    );
    expect(titles).toEqual(["Grooming", "Vet check", "Medication review"]);
    expect(within((await findCareSection())).getByText("2 more care dates")).toBeTruthy();
  });

  it("shows two rows on phones and three where there is room", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([
        careItem("First", "21 Oct 2026", "due-soon"),
        careItem("Second", "22 Oct 2026", "due-soon"),
        careItem("Third", "23 Oct 2026", "due-soon"),
        careItem("Fourth", "24 Oct 2026", "due-soon"),
      ])
    );
    renderDashboard();

    await within((await findCareSection())).findByText("Third");
    const rows = (await findCareSection()).querySelectorAll<HTMLElement>("[data-dashboard-care-item]");
    expect(rows).toHaveLength(3);
    expect(rows[0].classList.contains("hidden")).toBe(false);
    expect(rows[1].classList.contains("hidden")).toBe(false);
    expect(rows[2].classList.contains("hidden")).toBe(true);
    expect(rows[2].classList.contains("sm:grid")).toBe(true);
    // The honest remainder differs by layout: 2 more on phones, 1 more on wide.
    const more = (await findCareSection()).querySelector("[data-dashboard-care-more]")!;
    expect(more.querySelector(".sm\\:hidden")?.textContent).toBe("2 more care dates");
    expect(more.querySelector(".sm\\:inline")?.textContent).toBe("1 more care date");
  });

  it("explains a household with no care records", async () => {
    renderDashboard();

    expect(await within((await findCareSection())).findByText("No care records yet.")).toBeTruthy();
    expect(
      within((await findCareSection())).getByRole("link", { name: /Log care/ }).getAttribute("href")
    ).toBe(`/pets/${milo.id}/records?create=1`);
    expect(within((await findCareSection())).queryByText(/remind|notif/i)).toBeNull();
    expect(within((await findCareSection())).queryByRole("link", { name: "View all" })).toBeNull();
  });

  it("explains care logged without any next date", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(snapshot([], { petIdsWithCareRecords: [milo.id] }));
    renderDashboard();

    expect(await within((await findCareSection())).findByText("No pending care dates.")).toBeTruthy();
    expect(within((await findCareSection())).queryByText(/nothing due/i)).toBeNull();
  });

  it("states the horizon when every pending date is further away", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([careItem("Annual check-up", "14 Jan 2027", "upcoming")])
    );
    renderDashboard();

    expect(await within((await findCareSection())).findByText("Nothing due through 19 Nov.")).toBeTruthy();
    expect(within((await findCareSection())).getByText("Annual check-up")).toBeTruthy();
  });

  it("keeps Due today while showing the full date", async () => {
    const today = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
    mocks.getUpcomingCareSummary.mockResolvedValue(snapshot([careItem("Booster", today, "due-soon")]));
    renderDashboard();

    const row = (await screen.findByText(`Due ${today}`)).closest("[data-dashboard-care-item]");
    expect(row?.textContent).toContain("Due today");
  });

  it("keeps a long pet name from displacing the date or status", async () => {
    const longName = "Sir Theodore Marmalade Fluffington of Taman Tun Dr Ismail";
    mocks.getPets.mockResolvedValue({
      data: [pet({ name: longName }), pet({ ...luna })],
    });
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([careItem("Medication", "15 Feb 2027", "upcoming", { petName: longName })])
    );
    renderDashboard();

    const date = await screen.findByText("Due 15 Feb 2027");
    const row = date.closest<HTMLElement>("[data-dashboard-care-item]")!;
    const petName = row.querySelector<HTMLElement>("[data-dashboard-care-pet-name]")!;
    expect(petName.textContent).toBe(longName);
    expect(petName.getAttribute("title")).toBe(longName);
    expect(petName.classList.contains("truncate")).toBe(true);
    expect(date.className).not.toMatch(/truncate|line-clamp/);
  });
});

describe("Pet filter", () => {
  beforeEach(() => {
    mocks.getPets.mockResolvedValue({ data: [pet(), pet({ ...luna })] });
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([
        careItem("Milo booster", "21 Oct 2026", "due-soon"),
        careItem("Luna grooming", "22 Oct 2026", "due-soon", {
          petId: luna.id,
          petName: luna.name,
          type: "Grooming",
        }),
      ])
    );
    mocks.getPetMoments.mockImplementation(async (petId: string) =>
      momentsResponse(
        petId === luna.id
          ? [moment("Luna nap", "18 Oct 2026", { petId: luna.id })]
          : [moment("Milo fetch", "17 Oct 2026")]
      )
    );
  });

  it("starts on All pets and filters care and Moments to the chosen pet", async () => {
    renderDashboard();

    await within((await findCareSection())).findByText("Luna grooming");
    const allPets = screen.getByRole("button", { name: "All pets" });
    expect(allPets.getAttribute("aria-pressed")).toBe("true");
    expect(within((await findCareSection())).getByText("Milo booster")).toBeTruthy();
    expect(await within((await findMomentsSection())).findByText("Luna nap")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Luna" }));

    expect(screen.getByRole("button", { name: "Luna" }).getAttribute("aria-pressed")).toBe("true");
    expect(allPets.getAttribute("aria-pressed")).toBe("false");
    expect(within((await findCareSection())).queryByText("Milo booster")).toBeNull();
    expect(within((await findCareSection())).getByText("Luna grooming")).toBeTruthy();
    expect(within((await findMomentsSection())).queryByText("Milo fetch")).toBeNull();
    expect(
      within((await findMomentsSection())).getByRole("link", { name: "Add a Moment for Luna" }).getAttribute("href")
    ).toBe(`/pets/${luna.id}/moments?edit=new`);
    // Filtering never hides the pets themselves.
    expect(screen.getByRole("link", { name: "Manage Milo" })).toBeTruthy();
  });

  it("keeps the Lost Mode notice whatever is filtered", async () => {
    mocks.getPets.mockResolvedValue({
      data: [pet({ lostModeEnabled: true }), pet({ ...luna })],
    });
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Luna" }));
    expect(screen.getByText("1 pet is in Lost Mode")).toBeTruthy();
  });

  it("sends a multi-pet Add Moment to the pet chooser", async () => {
    renderDashboard();

    expect(
      (await within((await findMomentsSection())).findByRole("link", { name: "Add a Moment" })).getAttribute("href")
    ).toBe("/moments");
  });
});

describe("Recent Moments", () => {
  it("shows the newest Moments with the owner's own photos", async () => {
    mocks.getPetMoments.mockResolvedValue(
      momentsResponse([
        moment("Older", "01 Sep 2026", { media: photo("older.jpg") }),
        moment("Newest", "19 Oct 2026", { media: photo("newest.jpg") }),
        moment("Middle", "10 Oct 2026", { media: photo("middle.jpg") }),
      ])
    );
    renderDashboard();

    await within((await findMomentsSection())).findByText("Newest");
    const titles = [...(await findMomentsSection()).querySelectorAll("[data-dashboard-moment]")].map(
      (tile) => tile.querySelector("a")?.getAttribute("aria-label")
    );
    expect(titles).toEqual([
      "Newest, 19 Oct 2026",
      "Middle, 10 Oct 2026",
      "Older, 01 Sep 2026",
    ]);
    const images = (await findMomentsSection()).querySelectorAll<HTMLImageElement>("[data-dashboard-moment-photo]");
    expect([...images].map((image) => image.getAttribute("src"))).toEqual([
      "https://media.example.test/newest.jpg",
      "https://media.example.test/middle.jpg",
      "https://media.example.test/older.jpg",
    ]);
    expect(images[0].getAttribute("loading")).toBe("lazy");
    expect(screen.queryByText(/this week/i)).toBeNull();
  });

  it("shows a text-only Moment as words, never a stand-in photo", async () => {
    mocks.getPetMoments.mockResolvedValue(
      momentsResponse([moment("First bath", "19 Oct 2026", { type: "Grooming Day" })])
    );
    renderDashboard();

    const tile = (await within((await findMomentsSection())).findByText("First bath")).closest("[data-dashboard-moment]")!;
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.querySelector("[data-dashboard-moment-text]")?.textContent).toContain("Grooming Day");
  });

  it("shows three on phones and four where there is room", async () => {
    mocks.getPetMoments.mockResolvedValue(
      momentsResponse(
        ["A", "B", "C", "D", "E"].map((suffix, index) =>
          moment(`Moment ${suffix}`, `${String(19 - index).padStart(2, "0")} Oct 2026`)
        )
      )
    );
    renderDashboard();

    await within((await findMomentsSection())).findByText("Moment D");
    const tiles = (await findMomentsSection()).querySelectorAll<HTMLElement>("[data-dashboard-moment]");
    expect(tiles).toHaveLength(4);
    expect(tiles[2].classList.contains("hidden")).toBe(false);
    expect(tiles[3].classList.contains("hidden")).toBe(true);
    expect(within((await findMomentsSection())).queryByText("Moment E")).toBeNull();
  });

  it("invites a first Moment when there are none", async () => {
    renderDashboard();

    expect(await within((await findMomentsSection())).findByText("A small moment is worth keeping.")).toBeTruthy();
    expect((await findMomentsSection()).querySelectorAll("img")).toHaveLength(0);
    const add = within((await findMomentsSection())).getAllByRole("link", { name: /Add/ });
    // One action in an empty section, not a header link repeating it.
    expect(add).toHaveLength(1);
    expect(add[0].getAttribute("href")).toBe(`/pets/${milo.id}/moments?edit=new`);
  });

  it("links tiles to the owner's own Moments, not a public page", async () => {
    mocks.getPetMoments.mockResolvedValue(
      momentsResponse([moment("Public walk", "19 Oct 2026", { visibility: "Public" })])
    );
    renderDashboard();

    const link = (await within((await findMomentsSection())).findByText("Public walk")).closest("a")!;
    expect(link.getAttribute("href")).toBe(`/pets/${milo.id}/moments`);
  });
});

describe("Next step", () => {
  // Finder contact outranks every other next step, so the remaining cases
  // start from an owner whose contact details are already in place.
  beforeEach(() => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "+60123456789", whatsappNumber: "" })
    );
  });

  it("shows the contact reminder as the one next step when contact is missing", async () => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "", whatsappNumber: "" })
    );
    mocks.getPets.mockResolvedValue({
      data: [{ ...milo, breed: "Not set", bio: "", personalityTags: [] }],
    });
    renderDashboard();

    expect(await screen.findByText("Add your contact details")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /add contact details/i }).getAttribute("href")
    ).toBe("/settings#owner-contact");
    const moments = await findMomentsSection();
    await waitFor(() => expect(moments.getAttribute("aria-busy")).toBeNull());
    expect(document.querySelector('[data-profile-completion="compact"]')).toBeNull();
  });

  it("hides the contact reminder once contact details exist", async () => {
    window.localStorage.setItem(
      OWNER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ phoneNumber: "+60123456789", whatsappNumber: "" })
    );
    renderDashboard();

    await screen.findByRole("link", { name: "Manage Milo" });
    expect(screen.queryByText("Add your contact details")).toBeNull();
  });

  it("celebrates today's birthday with its existing Share Card", async () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())
        .map(({ type, value }) => [type, value])
    );
    mocks.getPets.mockResolvedValue({
      data: [pet({ birthday: `2022-${parts.month}-${parts.day}`, adoptionDay: "Not set" })],
    });
    renderDashboard();

    expect(await screen.findByText("Celebrate today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share Card" }));
    expect(
      screen.getByRole("img", { name: /Milo's MyPetLink Birthday Share Card/i }).getAttribute("src")
    ).toContain("variant=birthday");
  });

  it("does not celebrate a pet that is in Lost Mode", async () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())
        .map(({ type, value }) => [type, value])
    );
    mocks.getPets.mockResolvedValue({
      data: [pet({ birthday: `2022-${parts.month}-${parts.day}`, lostModeEnabled: true })],
    });
    renderDashboard();

    await screen.findByText("1 pet is in Lost Mode");
    expect(screen.queryByText("Celebrate today")).toBeNull();
  });

  it("does not turn a historical Adoption Day into an occasion", async () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())
        .map(({ type, value }) => [type, value])
    );
    mocks.getPets.mockResolvedValue({
      data: [pet({ birthday: "Not set", adoptionDay: `2022-${parts.month}-${parts.day}` })],
    });
    renderDashboard();

    await screen.findByRole("heading", { name: "Care coming up" });
    expect(screen.queryByText("Celebrate today")).toBeNull();
  });

  it("shows one compact prompt for the lowest-completion pet once sections settle", async () => {
    mocks.getPets.mockResolvedValue({
      data: [
        pet({
          breed: "Not set",
          gender: "Not set",
          personalityTags: [],
          estimatedBirthYear: undefined,
          birthday: "Not set",
          bio: "",
        }),
        pet({ ...luna, hasUsableSafetyContact: true, photoUrl: "luna.jpg" }),
      ],
    });
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Add more about Milo" })).toBeTruthy();
    expect(document.querySelectorAll('[data-profile-completion="compact"]')).toHaveLength(1);
  });

  it("breaks equal-percentage ties with the most recently created pet", async () => {
    mocks.getPets.mockResolvedValue({
      data: mockPets.map((item) => ({ ...item, hasUsableSafetyContact: true })),
    });
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Add more about Luna" })).toBeTruthy();
  });

  it("hides the prompt when the pet has a photo, a Moment and a care record", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet({ photoUrl: "milo.jpg" })] });
    mocks.getPetMoments.mockResolvedValue(momentsResponse([moment("Hello", "19 Oct 2026")]));
    mocks.getUpcomingCareSummary.mockResolvedValue(snapshot([], { petIdsWithCareRecords: [milo.id] }));
    renderDashboard();

    await within((await findMomentsSection())).findByText("Hello");
    await within((await findCareSection())).findByText("No pending care dates.");
    expect(document.querySelector('[data-profile-completion="compact"]')).toBeNull();
  });
});

describe("Private Moment allowance note", () => {
  it("notes a pet at 8 of 10 private Moments, from a complete count", async () => {
    mocks.getPetMoments.mockResolvedValue(
      momentsResponse(
        Array.from({ length: 9 }, (_, index) =>
          moment(`M${index}`, "10 Oct 2026", {
            id: `m-${index}`,
            visibility: index < 8 ? "Private" : "Public",
          })
        )
      )
    );
    renderDashboard();

    expect(await screen.findByText(/Milo has 8 of 10 private/)).toBeTruthy();
    expect(screen.queryByText(/upgrade|premium/i)).toBeNull();
    expect(screen.queryByText(/share.*publicly/i)).toBeNull();
  });

  it("stays silent when the count is not known to be whole", async () => {
    mocks.getPetMoments.mockResolvedValue({
      data: Array.from({ length: 9 }, (_, index) =>
        moment(`M${index}`, "10 Oct 2026", { id: `m-${index}` })
      ),
      meta: { total: 140 },
    });
    renderDashboard();

    await within((await findMomentsSection())).findByText("M0");
    expect(screen.queryByText(/private Moments\./)).toBeNull();
  });
});

describe("Care consistency and wording", () => {
  it("reads one consistent summary and never stitches separately requested pages", async () => {
    renderDashboard();

    await within(await findCareSection()).findByText("No care records yet.");
    expect(mocks.getUpcomingCareSummary).toHaveBeenCalledOnce();
    expect(mocks.getUpcomingCarePage).not.toHaveBeenCalled();
  });

  it("shows the overdue item that a change between two page reads could have hidden", async () => {
    // Stitched pages could combine "A future" from before the change with
    // "B future" from after it, report the same total, and say nothing was
    // due. One consistent read returns what is actually pending.
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([
        careItem("C overdue booster", "12 Oct 2026", "overdue"),
        careItem("B future check-up", "14 Jan 2027", "upcoming"),
      ])
    );
    renderDashboard();

    const care = await findCareSection();
    expect(await within(care).findByText("C overdue booster")).toBeTruthy();
    expect(within(care).getByText("Overdue")).toBeTruthy();
    expect(within(care).queryByText(/nothing due/i)).toBeNull();
  });

  it("says no care dates are pending — not that none were saved — after everything is logged", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue(snapshot([], { petIdsWithCareRecords: [milo.id] }));
    renderDashboard();

    const care = await findCareSection();
    expect(await within(care).findByText("No pending care dates.")).toBeTruthy();
    expect(within(care).queryByText(/saved yet|never|no next care dates saved/i)).toBeNull();
    expect(within(care).queryByText(/nothing due/i)).toBeNull();
  });

  it("never builds the all-clear sentence around a missing date", async () => {
    mocks.getUpcomingCareSummary.mockResolvedValue({
      ...snapshot([careItem("Annual check-up", "14 Jan 2027", "upcoming")]),
      horizonDate: "",
    });
    renderDashboard();

    const care = await findCareSection();
    expect(await within(care).findByText("Annual check-up")).toBeTruthy();
    expect(within(care).queryByText(/nothing due through/i)).toBeNull();
  });

  it("says a filtered pet's care is unavailable when the summary does not cover it", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet(), pet({ ...luna })] });
    mocks.getUpcomingCareSummary.mockResolvedValue(
      snapshot([careItem("Milo booster", "21 Oct 2026", "due-soon")], { pets: [milo.id] })
    );
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Luna" }));

    const care = await findCareSection();
    expect(within(care).getByText("We couldn't show care dates for this pet right now.")).toBeTruthy();
    expect(within(care).queryByText(/No care records|No pending/)).toBeNull();
  });

  it("treats a summary that does not hold together as a failed read", async () => {
    const { CareDataContractError } = await import("@/lib/careContracts");
    mocks.getUpcomingCareSummary.mockRejectedValue(
      new CareDataContractError("The care summary's pet counts do not add up.")
    );
    renderDashboard();

    const care = await findCareSection();
    expect(await within(care).findByText("We couldn't load care dates right now.")).toBeTruthy();
    expect(within(care).queryByText(/nothing due|No pending|No care records/i)).toBeNull();
  });
});
