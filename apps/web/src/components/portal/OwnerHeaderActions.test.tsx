// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { OwnerHeaderPageContext } from "@/lib/ownerHeaderActions";
import type { Pet } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  pathname: "/dashboard",
  push: vi.fn(),
}));

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
  });

  afterEach(() => {
    cleanup();
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

