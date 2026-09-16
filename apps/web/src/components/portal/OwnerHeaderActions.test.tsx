// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import type { OwnerHeaderPageContext } from "@/lib/ownerHeaderActions";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  pathname: "/dashboard",
  push: vi.fn(),
}));

let intersectionCallback: IntersectionObserverCallback | null = null;
let observedOrigin: Element | null = null;
const disconnectObserver = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => true,
}));

vi.mock("@/services/momentService", () => ({
  createPetMoment: vi.fn(),
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  deletePetMoment: vi.fn(),
  updatePetMoment: vi.fn(),
  getFriendlyMomentErrorMessage: () => "We couldn't load this right now.",
}));

vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  updateRecord: vi.fn(),
  getFriendlyRecordErrorMessage: () => "We couldn't load this right now.",
}));

const {
  OwnerHeaderActionsProvider,
  OwnerPortalHeader,
  useOwnerHeaderPageContext,
} = await import("./OwnerHeaderActions");
const { PetMomentsManager } = await import("./PetMomentsManager");
const { RecordsManager } = await import("./RecordsManager");

function makePets(count: number): Pet[] {
  return Array.from({ length: count }, (_, index) => ({
    ...mockPets[0],
    id: `pet_${index}`,
    name: `Pet ${index + 1}`,
    lifecycleStatus: "Active",
  }));
}

function HeaderHarness({
  pageContext,
}: {
  pageContext?: Omit<OwnerHeaderPageContext, "pathname">;
}) {
  return (
    <OwnerHeaderActionsProvider>
      <OwnerPortalHeader />
      {pageContext ? <PageContextPublisher context={pageContext} /> : null}
    </OwnerHeaderActionsProvider>
  );
}

function PageContextPublisher({
  context,
}: {
  context: Omit<OwnerHeaderPageContext, "pathname">;
}) {
  useOwnerHeaderPageContext(context);
  return null;
}

describe("OwnerHeaderActions", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/dashboard");
    mocks.pathname = "/dashboard";
    mocks.getPets.mockReset();
    mocks.push.mockReset();
    intersectionCallback = null;
    observedOrigin = null;
    disconnectObserver.mockReset();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: "(max-width: 1023px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    vi.stubGlobal(
      "IntersectionObserver",
      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }

        disconnect() {
          disconnectObserver();
        }

        observe(target: Element) {
          observedOrigin = target;
        }

        takeRecords() {
          return [];
        }

        unobserve() {}

        readonly root = null;
        readonly rootMargin = "0px";
        readonly thresholds = [0];
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /**
   * The mobile header row: brand, Community, and one action.
   *
   * It used to render "My…". The brand was the only flexible item in the row,
   * so once the Community switch and a solid coral Add button had taken their
   * width, the wordmark was the thing that gave way — leaving the one element on
   * the page that must not look broken looking broken.
   */
  it("never truncates the brand to make room for anything else", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    await screen.findByRole("button", {
      name: /add a pet, care record, or moment/i,
    });

    const brandLink = screen.getByRole("link", {
      name: /mypetlink owner portal home/i,
    });
    const wordmark = [...brandLink.querySelectorAll("span")].find(
      (span) => span.textContent === "MyPetLink"
    );

    // It fits whole or it steps back to the mark alone. It never shrinks into
    // an ellipsis, which is what `truncate` on a flex child produces.
    expect(brandLink.className).toContain("shrink-0");
    expect(brandLink.className).not.toContain("min-w-0");
    expect(wordmark?.className).toContain("whitespace-nowrap");
    expect(wordmark?.className).not.toContain("truncate");
  });

  it("keeps the Community switch named rather than reduced to an icon", () => {
    // The switch only renders when Social is on, and these tests run with the
    // flag off, so this reads the component rather than the tree. What matters
    // is that the row does not solve its width problem by taking the word
    // "Community" away — an unlabelled icon is not an obvious mode switch.
    const source = readFileSync(
      join(__dirname, "OwnerHeaderActions.tsx"),
      "utf8"
    );
    const control = source.slice(source.indexOf("function SocialModeSwitch"));

    expect(control).toContain("shrink-0");
    expect(control).toContain('inSocial ? "My pets" : "Community"');
    expect(control).not.toContain("sr-only");
  });

  it("keeps Add reachable and fully named when its word is dropped", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    const add = await screen.findByRole("button", {
      name: /add a pet, care record, or moment/i,
    });
    const word = [...add.querySelectorAll("span")].find(
      (span) => span.textContent === "Add"
    );

    // Quieter, not smaller to hit: the target stays 44px square at every width,
    // and the spoken name never depends on the printed one.
    expect(add.className).toContain("min-h-11");
    expect(add.className).toContain("min-w-11");
    expect(word?.className).toContain("hidden");
    expect(word?.className).toContain("min-[420px]:inline");
  });

  it("gives Add less visual weight than the brand beside it", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    const add = await screen.findByRole("button", {
      name: /add a pet, care record, or moment/i,
    });

    // An outline, not a filled pill. Add is a utility action, not the page's
    // identity, and a solid block of brand colour read as the latter.
    expect(add.className).toContain("bg-white");
    expect(add.className).not.toContain("bg-pet-coral");
    expect(add.className).toContain("border-pet-coral");
  });

  it("renders one Home Add menu trigger after pet state is ready", async () => {
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    expect(
      await screen.findByRole("button", {
        name: /add a pet, care record, or moment/i,
      })
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /add a pet/i })).toHaveLength(1);
  });

  it("keeps the zero-pet Home state free of a duplicate header CTA", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    render(<HeaderHarness />);

    await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("button", {
        name: /add a pet, care record, or moment/i,
      })
    ).toBeNull();
  });

  it("renders a direct, non-wrapping Add Pet link on the populated Pets route", async () => {
    mocks.pathname = "/pets";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    const action = await screen.findByRole("link", { name: "Add Pet" });
    expect(action.getAttribute("href")).toBe("/pets/new");
    expect(action.classList.contains("whitespace-nowrap")).toBe(true);
    expect(screen.queryByText("Add", { selector: "button" })).toBeNull();
  });

  it("uses the current populated Moments pet and never shows Add Pet", async () => {
    mocks.pathname = "/pets/pet_0/moments";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "ready",
          canCreate: true,
          onCreate: vi.fn(),
        }}
      />
    );

    const action = await screen.findByRole("button", {
      name: /add moment for the current pet/i,
    });
    expect(action.getAttribute("href")).toBeNull();
    expect(screen.queryByRole("link", { name: "Add Pet" })).toBeNull();
  });

  it("shows one compact mobile action after the original passes above the viewport", async () => {
    mocks.pathname = "/pets/pet_0/moments";
    const onCreate = vi.fn();
    const currentPets = makePets(1);
    currentPets[0].name = "A very long pet name that must stay on one line";
    mocks.getPets.mockResolvedValue({ data: currentPets });
    render(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "ready",
          canCreate: true,
          onCreate,
        }}
      />
    );

    const originalAction = await screen.findByRole("button", {
      name: /add moment for the current pet/i,
    });
    await waitFor(() => expect(observedOrigin).toBeTruthy());
    expect(document.querySelector("[data-owner-compact-action-bar]")).toBeNull();

    notifyIntersection({ isIntersecting: false, bottom: -1 });

    const compactBar = await waitFor(() => {
      const bar = document.querySelector<HTMLElement>(
        "[data-owner-compact-action-bar]"
      );
      expect(bar).toBeTruthy();
      return bar as HTMLElement;
    });
    const compactAction = within(compactBar).getByRole("button", {
      name: /add moment for the current pet/i,
    });
    fireEvent.click(compactAction);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(
      within(compactBar).getByText(currentPets[0].name + "'s memories")
        .classList
    ).toContain("truncate");
    expect(originalAction.parentElement?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(
      screen.getAllByRole("button", {
        name: /add moment for the current pet/i,
      })
    ).toHaveLength(1);

    notifyIntersection({ isIntersecting: true, bottom: 44 });

    await waitFor(() =>
      expect(
        document.querySelector("[data-owner-compact-action-bar]")
      ).toBeNull()
    );
    expect(
      screen.getByRole("button", { name: /add moment for the current pet/i })
    ).toBe(originalAction);
  });

  it("does not show the compact action while the original is below the viewport", async () => {
    mocks.pathname = "/pets";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    await screen.findByRole("link", { name: "Add Pet" });
    await waitFor(() => expect(observedOrigin).toBeTruthy());
    notifyIntersection({ isIntersecting: false, bottom: 720 });

    expect(document.querySelector("[data-owner-compact-action-bar]")).toBeNull();
  });

  it("does not observe or render a compact action in the desktop layout", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: "(max-width: 1023px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    mocks.pathname = "/pets";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    await screen.findByRole("link", { name: "Add Pet" });

    expect(observedOrigin).toBeNull();
    expect(document.querySelector("[data-owner-compact-action-bar]")).toBeNull();
  });

  it("disconnects the visibility observer when route navigation removes the action", async () => {
    mocks.pathname = "/pets";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    const view = render(<HeaderHarness />);

    await screen.findByRole("link", { name: "Add Pet" });
    await waitFor(() => expect(observedOrigin).toBeTruthy());

    mocks.pathname = "/settings";
    view.rerender(<HeaderHarness />);

    await waitFor(() => expect(disconnectObserver).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Add Pet" })).toBeNull();
    expect(document.querySelector("[data-owner-compact-action-bar]")).toBeNull();
  });

  it("invokes the current Records manager create flow", async () => {
    const onCreate = vi.fn();
    mocks.pathname = "/records";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(
      <HeaderHarness
        pageContext={{
          section: "records",
          petId: "pet_0",
          status: "ready",
          onCreate,
        }}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /add care record for the current pet/i,
      })
    );
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Add Pet" })).toBeNull();
  });

  it("hides the section action only while loading, then shows it once ready", async () => {
    mocks.pathname = "/moments";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    const view = render(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "loading",
          canCreate: true,
          onCreate: vi.fn(),
        }}
      />
    );

    await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: /add moment/i })).toBeNull();

    view.rerender(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "ready",
          canCreate: true,
          onCreate: vi.fn(),
        }}
      />
    );
    expect(
      await screen.findByRole("button", { name: /add moment/i })
    ).toBeTruthy();
  });

  it("shows Add Moment for a pet whose memories are empty", async () => {
    mocks.pathname = "/pets/pet_0/moments";
    const currentPets = makePets(2);
    mocks.getPets.mockResolvedValue({ data: currentPets });
    mocks.getPetMoments.mockResolvedValue({ data: [] });
    render(
      <OwnerHeaderActionsProvider>
        <OwnerPortalHeader />
        <PetMomentsManager initialMoments={[]} pet={currentPets[0]} />
      </OwnerHeaderActionsProvider>
    );

    const action = await screen.findByRole("button", {
      name: /add moment for the current pet/i,
    });
    fireEvent.click(action);
    expect(screen.getByRole("dialog", { name: /add a moment/i })).toBeTruthy();
    expect(screen.getByText("No pet moments yet")).toBeTruthy();
  });

  it("keeps the correct Add Moment target when switching between a populated and an empty pet", async () => {
    const currentPets = makePets(2);
    mocks.getPets.mockResolvedValue({ data: currentPets });
    mocks.getPetMoments.mockImplementation((petId: unknown) =>
      Promise.resolve({
        data:
          petId === "pet_0"
            ? [{ ...mockMoments[0], id: "moment_a", petId: "pet_0" }]
            : [],
      })
    );

    mocks.pathname = "/pets/pet_0/moments";
    const view = render(
      <OwnerHeaderActionsProvider>
        <OwnerPortalHeader />
        <PetMomentsManager initialMoments={[]} pet={currentPets[0]} />
      </OwnerHeaderActionsProvider>
    );
    const populatedAction = await screen.findByRole("button", {
      name: /add moment for the current pet/i,
    });
    expect(populatedAction.getAttribute("href")).toBeNull();

    mocks.pathname = "/pets/pet_1/moments";
    view.rerender(
      <OwnerHeaderActionsProvider>
        <OwnerPortalHeader />
        <PetMomentsManager initialMoments={[]} pet={currentPets[1]} />
      </OwnerHeaderActionsProvider>
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /add moment for the current pet/i })
          .getAttribute("href")
      ).toBeNull()
    );

    mocks.pathname = "/pets/pet_0/moments";
    view.rerender(
      <OwnerHeaderActionsProvider>
        <OwnerPortalHeader />
        <PetMomentsManager initialMoments={[]} pet={currentPets[0]} />
      </OwnerHeaderActionsProvider>
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /add moment for the current pet/i })
          .getAttribute("href")
      ).toBeNull()
    );
  });

  it("shows Add Record for a pet with zero care records", async () => {
    mocks.pathname = "/pets/pet_0/records";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    mocks.getPetRecords.mockResolvedValue({ data: [] });
    render(
      <OwnerHeaderActionsProvider>
        <OwnerPortalHeader />
        <RecordsManager initialRecords={[]} petId="pet_0" />
      </OwnerHeaderActionsProvider>
    );

    expect(
      await screen.findByRole("button", {
        name: /add care record for the current pet/i,
      })
    ).toBeTruthy();
    expect(screen.getByText("No care records yet")).toBeTruthy();
  });

  it("shows Add Record for a pet with existing care records", async () => {
    mocks.pathname = "/pets/pet_0/records";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    mocks.getPetRecords.mockResolvedValue({
      data: [{ ...mockRecords[0], id: "rec_a", petId: "pet_0" }],
    });
    render(
      <OwnerHeaderActionsProvider>
        <OwnerPortalHeader />
        <RecordsManager initialRecords={[]} petId="pet_0" />
      </OwnerHeaderActionsProvider>
    );

    expect(
      await screen.findByRole("button", {
        name: /add care record for the current pet/i,
      })
    ).toBeTruthy();
    expect(screen.queryByText("No care records yet")).toBeNull();
  });

  it.each(["/tags", "/orders", "/settings", "/pets/pet_0/edit"])(
    "shows no Add Pet action on %s",
    async (pathname) => {
      mocks.pathname = pathname;
      mocks.getPets.mockResolvedValue({ data: makePets(1) });
      render(<HeaderHarness />);

      await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
      expect(screen.queryByRole("link", { name: "Add Pet" })).toBeNull();
      expect(
        screen.queryByRole("button", {
          name: /add a pet, care record, or moment/i,
        })
      ).toBeNull();
    }
  );
});

function notifyIntersection({
  bottom,
  isIntersecting,
}: {
  bottom: number;
  isIntersecting: boolean;
}) {
  if (!intersectionCallback || !observedOrigin) {
    throw new Error("The primary action is not being observed.");
  }

  const entry = {
    boundingClientRect: { bottom },
    intersectionRatio: isIntersecting ? 1 : 0,
    isIntersecting,
    target: observedOrigin,
  } as IntersectionObserverEntry;

  act(() => {
    intersectionCallback?.([entry], {} as IntersectionObserver);
  });
}
