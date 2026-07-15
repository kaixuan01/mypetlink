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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { OwnerHeaderPageContext } from "@/lib/ownerHeaderActions";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
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

const {
  OwnerHeaderActionsProvider,
  OwnerPortalHeader,
  useOwnerHeaderPageContext,
} = await import("./OwnerHeaderActions");

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
          itemCount: 2,
          canCreate: true,
        }}
      />
    );

    const action = await screen.findByRole("link", {
      name: /add moment for the current pet/i,
    });
    expect(action.getAttribute("href")).toBe("/pets/pet_0/moments/new");
    expect(screen.queryByRole("link", { name: "Add Pet" })).toBeNull();
  });

  it("shows one compact mobile action after the original passes above the viewport", async () => {
    mocks.pathname = "/pets/pet_0/moments";
    const currentPets = makePets(1);
    currentPets[0].name = "A very long pet name that must stay on one line";
    mocks.getPets.mockResolvedValue({ data: currentPets });
    render(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "ready",
          itemCount: 2,
          canCreate: true,
        }}
      />
    );

    const originalAction = await screen.findByRole("link", {
      name: /add moment for the current pet/i,
    });
    expect(observedOrigin).toBeTruthy();
    expect(document.querySelector("[data-owner-compact-action-bar]")).toBeNull();

    notifyIntersection({ isIntersecting: false, bottom: -1 });

    const compactBar = await waitFor(() => {
      const bar = document.querySelector<HTMLElement>(
        "[data-owner-compact-action-bar]"
      );
      expect(bar).toBeTruthy();
      return bar as HTMLElement;
    });
    const compactAction = within(compactBar).getByRole("link", {
      name: /add moment for the current pet/i,
    });
    expect(compactAction.getAttribute("href")).toBe(
      originalAction.getAttribute("href")
    );
    expect(
      within(compactBar).getByText(currentPets[0].name + "'s memories")
        .classList
    ).toContain("truncate");
    expect(originalAction.parentElement?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(
      screen.getAllByRole("link", {
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
      screen.getByRole("link", { name: /add moment for the current pet/i })
    ).toBe(originalAction);
  });

  it("does not show the compact action while the original is below the viewport", async () => {
    mocks.pathname = "/pets";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    render(<HeaderHarness />);

    await screen.findByRole("link", { name: "Add Pet" });
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
    expect(observedOrigin).toBeTruthy();

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
          itemCount: 1,
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

  it("hides the section action during loading and for its true empty state", async () => {
    mocks.pathname = "/moments";
    mocks.getPets.mockResolvedValue({ data: makePets(1) });
    const view = render(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "loading",
          itemCount: 1,
          canCreate: true,
        }}
      />
    );

    await waitFor(() => expect(mocks.getPets).toHaveBeenCalledOnce());
    expect(screen.queryByRole("link", { name: /add moment/i })).toBeNull();

    view.rerender(
      <HeaderHarness
        pageContext={{
          section: "moments",
          petId: "pet_0",
          status: "ready",
          itemCount: 0,
          canCreate: true,
        }}
      />
    );
    expect(screen.queryByRole("link", { name: /add moment/i })).toBeNull();
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
