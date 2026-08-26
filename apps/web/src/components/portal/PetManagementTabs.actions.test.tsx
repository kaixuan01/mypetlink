// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockMoments } from "@/data/mockMoments";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
  getPetRecords: vi.fn(),
  updatePetLostMode: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  isApiConfigured: () => false,
}));

vi.mock("@/services/petService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/petService")>();
  return {
    ...actual,
    getPetById: (...args: unknown[]) => mocks.getPetById(...args),
    updatePetLostMode: (...args: unknown[]) =>
      mocks.updatePetLostMode(...args),
  };
});

vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
}));

vi.mock("@/services/recordService", () => ({
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
}));

vi.mock("@/components/qr/QrCodeButton", () => ({
  QrCodeButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

const { PetManagementTabs } = await import("./PetManagementTabs");

beforeEach(() => {
  const pet = structuredClone(mockPets[0]);
  mocks.getPetById.mockResolvedValue({ data: pet });
  mocks.getPetMoments.mockResolvedValue({ data: [] });
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.updatePetLostMode.mockImplementation(
    async (_id: string, enabled: boolean, lostMode: typeof pet.lostMode) => ({
      data: { ...pet, lostModeEnabled: enabled, lostMode },
    })
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps one Public Profile source of truth and hides unreleased owner tools", async () => {
  const pet = structuredClone(mockPets[0]);
  render(
    <PetManagementTabs
      moments={[]}
      pet={pet}
      records={[]}
      tags={[]}
    />
  );

  await screen.findByText("Sharing & Safety");

  expect(screen.queryByRole("tab", { name: "Privacy" })).toBeNull();
  expect(screen.queryByText("Public profile visibility")).toBeNull();
  expect(screen.queryByText("Safety Profile visibility")).toBeNull();
  const publicProfile = screen.getByRole("group", {
    name: "Public Profile overview",
  });
  expect(screen.getAllByRole("heading", { name: "Public Profile" })).toHaveLength(1);
  expect(within(publicProfile).getByText("Shared")).toBeTruthy();
  expect(
    within(publicProfile).getByText("Anyone with the link can view this page.")
  ).toBeTruthy();
  expect(
    within(publicProfile).queryByText(/^(On|Off|Public|Private)$/)
  ).toBeNull();
  expect(screen.queryByText(/Public profile is (on|off)/i)).toBeNull();
  expect(
    screen.getByRole("link", { name: "Manage sharing" }).getAttribute("href")
  ).toBe(`/pets/${pet.id}/edit?tab=public`);

  expect(within(publicProfile).getAllByRole("link")).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: /View profile/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
  expect(screen.queryByRole("link", { name: "View Safety Profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show Profile QR" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Smart Tag" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Smart Tags" })).toBeNull();
  expect(screen.queryByText("Edit Public Profile Settings")).toBeNull();
  expect(screen.queryByText("Edit Safety Settings")).toBeNull();

  const publicView = screen.getByRole("link", { name: /View profile/ });
  expect(publicView.getAttribute("target")).toBe("_blank");
  expect(publicView.getAttribute("rel")).toBe("noopener noreferrer");

  const profilesGrid = screen.getByRole("group", {
    name: "Sharing and safety profiles",
  });
  expect(profilesGrid.className).not.toContain("lg:grid-cols-2");
});

it("does not expose public actions when the pet profile is private", async () => {
  const pet = { ...structuredClone(mockPets[0]), publicProfileEnabled: false };
  mocks.getPetById.mockResolvedValue({ data: pet });
  render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );

  const publicProfile = await screen.findByRole("group", {
    name: "Public Profile overview",
  });
  expect(within(publicProfile).getByText("Not shared")).toBeTruthy();
  expect(within(publicProfile).getByText(/This profile is not shared/)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Manage sharing" }).getAttribute("href")
  ).toBe(`/pets/${pet.id}/edit?tab=public`);
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
  expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show Profile QR" })).toBeNull();
  expect(screen.queryByRole("link", { name: /View profile/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Share Card" })).toBeNull();
});

it("leaves Share Center ownership outside the Overview subcard", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  const publicProfile = await screen.findByRole("group", {
    name: "Public Profile overview",
  });
  expect(within(publicProfile).getByRole("link", { name: "View profile" })).toBeTruthy();
  expect(within(publicProfile).queryByRole("link", { name: "Manage sharing" })).toBeNull();
  expect(screen.getByRole("link", { name: "Manage sharing" })).toBeTruthy();
  expect(within(publicProfile).queryByRole("button")).toBeNull();
  expect(screen.queryByRole("button", { name: `Share ${pet.name}` })).toBeNull();
});

it("opens the care-record create flow while View all keeps the list state", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  const add = await screen.findByRole("link", { name: "Add Care Record" });
  const viewAll = screen
    .getAllByRole("link", { name: /View all/ })
    .find((link) => link.getAttribute("href")?.includes("/records"));

  expect(add.getAttribute("href")).toBe(`/pets/${pet.id}/records?create=1`);
  expect(viewAll?.getAttribute("href")).toBe(`/pets/${pet.id}/records`);
});

it("keeps the compact Moment actions on their existing destinations", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  expect(
    (await screen.findByRole("link", { name: "Add Moment" })).getAttribute("href")
  ).toBe(`/pets/${pet.id}/moments/new`);
  expect(
    screen
      .getByRole("link", { name: "View all pet memories" })
      .getAttribute("href")
  ).toBe(`/pets/${pet.id}/moments`);
});

it("preserves the pet tabs and their active-state navigation", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  const tablist = await screen.findByRole("tablist", {
    name: "Manage pet sections",
  });
  const [overview, records, moments] = within(tablist).getAllByRole("tab");

  expect(overview.textContent).toContain("Overview");
  expect(records.textContent).toContain("Care Records");
  expect(moments.textContent).toContain("Moments");

  expect(overview.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(records);
  expect(records.getAttribute("aria-selected")).toBe("true");
  expect(overview.getAttribute("aria-selected")).toBe("false");
  fireEvent.click(moments);
  expect(moments.getAttribute("aria-selected")).toBe("true");
  expect(records.getAttribute("aria-selected")).toBe("false");
});

it("keeps long Care titles shrinkable and gives the status its own mobile row", async () => {
  const pet = structuredClone(mockPets[0]);
  const longTitle =
    "FVRCP Vaccine — Dose 2 Settled with an unusually long follow-up description";
  const record = {
    ...structuredClone(mockRecords[0]),
    id: "long-care-summary",
    title: longTitle,
    type: "Vet Visit" as const,
  };
  mocks.getPetRecords.mockResolvedValue({ data: [record] });

  const { container } = render(
    <PetManagementTabs moments={[]} pet={pet} records={[record]} tags={[]} />
  );

  const title = await screen.findByText(longTitle);
  const row = container.querySelector("[data-care-record-summary-row]");
  const content = container.querySelector("[data-care-record-summary-content]");
  const status = screen.getByText("Vet Visit");

  expect(row).toBeTruthy();
  expect(row?.className).toContain("grid-cols-[minmax(0,1fr)]");
  expect(row?.className).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
  expect(content?.className).toContain("min-w-0");
  expect(title.className).toContain("[overflow-wrap:anywhere]");
  expect(title.className).not.toContain("truncate");
  expect(status.className).toContain("shrink-0");
  expect(status.className).toContain("sm:justify-self-end");
});

it("keeps the same three recent Care records and Moments in their existing order", async () => {
  const pet = structuredClone(mockPets[0]);
  const records = [0, 1, 2, 3].map((index) => ({
    ...structuredClone(mockRecords[0]),
    id: `recent-${index}`,
    title: `Care record ${index + 1}`,
  }));
  const moments = [0, 1, 2, 3].map((index) => ({
    ...structuredClone(mockMoments[0]),
    id: `recent-moment-${index}`,
    title: `Pet memory ${index + 1}`,
  }));
  mocks.getPetRecords.mockResolvedValue({ data: records });
  mocks.getPetMoments.mockResolvedValue({ data: moments });

  const { container } = render(
    <PetManagementTabs moments={moments} pet={pet} records={records} tags={[]} />
  );

  await screen.findByText("Care record 1");
  const rows = Array.from(
    container.querySelectorAll("[data-care-record-summary-row]")
  );
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("Care record 1"),
    expect.stringContaining("Care record 2"),
    expect.stringContaining("Care record 3"),
  ]);
  expect(screen.queryByText("Care record 4")).toBeNull();

  const momentRows = Array.from(
    container.querySelectorAll("[data-moment-summary-row]")
  );
  expect(momentRows).toHaveLength(3);
  expect(momentRows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("Pet memory 1"),
    expect.stringContaining("Pet memory 2"),
    expect.stringContaining("Pet memory 3"),
  ]);
  expect(screen.queryByText("Pet memory 4")).toBeNull();
});

it("keeps Memorial editing while Archived restore guidance points to the header menu", async () => {
  const memorial = {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: "Memorial" as const,
  };
  mocks.getPetById.mockResolvedValue({ data: memorial });
  const { unmount } = render(
    <PetManagementTabs moments={[]} pet={memorial} records={[]} tags={[]} />
  );

  expect(
    (await screen.findByRole("link", { name: "Edit Memorial" })).getAttribute(
      "href"
    )
  ).toBe(`/pets/${memorial.id}/edit?tab=public`);

  unmount();

  const archived = {
    ...structuredClone(mockPets[0]),
    lifecycleStatus: "Archived" as const,
  };
  mocks.getPetById.mockResolvedValue({ data: archived });
  render(
    <PetManagementTabs moments={[]} pet={archived} records={[]} tags={[]} />
  );

  expect(
    await screen.findByText("Restore this profile from the menu at the top of this page.")
  ).toBeTruthy();
  expect(screen.getByText("Memories and records stay saved.")).toBeTruthy();
  expect(
    screen.queryByText(/Archived profiles stay saved/i)
  ).toBeNull();
  expect(screen.queryByText(/Restore this profile from the pet edit page/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Open Profile Status" })).toBeNull();
  expect(
    screen.queryByRole("link", { name: /Restore/i })
  ).toBeNull();
});

it("uses current Moment semantics and recent-history Care copy", async () => {
  const pet = structuredClone(mockPets[0]);
  render(<PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />);

  expect(
    await screen.findByText("Photo and video moments you choose to keep private or share.")
  ).toBeTruthy();
  expect(screen.queryByText(/family-only/i)).toBeNull();
  expect(screen.getByRole("heading", { name: "Recent care records" })).toBeTruthy();
  expect(
    screen.getByText("The latest vaccines, deworming, grooming, and vet visits you've added.")
  ).toBeTruthy();
});

it("uses Shared and Only me for Overview Moment badges", async () => {
  const pet = structuredClone(mockPets[0]);
  const moments = [
    {
      ...structuredClone(mockMoments[0]),
      id: "public",
      visibility: "Public" as const,
    },
    {
      ...structuredClone(mockMoments[0]),
      id: "private",
      visibility: "Private" as const,
    },
    {
      ...structuredClone(mockMoments[0]),
      id: "legacy-family",
      visibility: "Family Only" as const,
    },
  ];
  mocks.getPetMoments.mockResolvedValue({ data: moments });

  render(
    <PetManagementTabs moments={moments} pet={pet} records={[]} tags={[]} />
  );

  const memories = (
    await screen.findByRole("heading", { name: "Pet Memories" })
  ).closest("section")!;
  expect(within(memories).getAllByText("Shared")).toHaveLength(1);
  expect(within(memories).getAllByText("Only me")).toHaveLength(2);
  expect(within(memories).queryByText("Public")).toBeNull();
  expect(within(memories).queryByText("Private")).toBeNull();
  expect(within(memories).queryByText("Family Only")).toBeNull();
});

it("allows long Moment titles two lines without disturbing overview status or actions", async () => {
  const pet = structuredClone(mockPets[0]);
  const longTitle = "A-very-long-moment-title-that-must-not-expand-the-mobile-grid";
  const moments = [
    {
      ...structuredClone(mockMoments[0]),
      id: "long-title",
      title: longTitle,
    },
  ];
  mocks.getPetMoments.mockResolvedValue({ data: moments });

  render(<PetManagementTabs moments={moments} pet={pet} records={[]} tags={[]} />);

  const title = await screen.findByText(longTitle);
  const row = title.parentElement?.parentElement;
  const list = row?.parentElement;
  const overviewGrid = title.closest("section")?.parentElement;

  expect(title.className).toContain("line-clamp-2");
  expect(title.className).toContain("[overflow-wrap:anywhere]");
  expect(title.parentElement?.className).toContain("min-w-0");
  expect(row?.className).toContain("min-w-0");
  expect(list?.className).toContain("grid-cols-[minmax(0,1fr)]");
  expect(overviewGrid?.className).toContain("grid-cols-[minmax(0,1fr)]");
  expect(within(row as HTMLElement).getByText("Shared")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View all pet memories" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Add Moment" })).toBeTruthy();
});

it.each([
  ["Memorial", "Memorial Mode"],
  ["Archived", "Saved profile history"],
] as const)(
  "gives a lone %s lifecycle card the full trailing row",
  async (lifecycleStatus, heading) => {
    const pet = {
      ...structuredClone(mockPets[0]),
      lifecycleStatus,
    };
    mocks.getPetById.mockResolvedValue({ data: pet });

    render(
      <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
    );

    const lifecycleCard = (
      await screen.findByRole("heading", { name: heading })
    ).closest("section")!;
    const trailingGrid = lifecycleCard.parentElement!;
    expect(trailingGrid.children).toHaveLength(1);
    expect(trailingGrid.className).not.toContain("lg:grid-cols-2");
  }
);

it("round-trips the shared Lost Mode control from the pet Overview", async () => {
  const pet = structuredClone(mockPets[0]);
  render(
    <PetManagementTabs moments={[]} pet={pet} records={[]} tags={[]} />
  );

  await screen.findByText("Lost Mode");
  fireEvent.click(
    screen.getByRole("button", { name: "Turn on Lost Mode" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Activate Lost Mode" }));

  expect(await screen.findByText("On")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: `Mark ${pet.name} as Found` })
  ).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(
    "Lost Mode is now on"
  );

  fireEvent.click(
    screen.getByRole("button", { name: `Mark ${pet.name} as Found` })
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark as Found" }));

  await waitFor(() =>
    expect(mocks.updatePetLostMode).toHaveBeenLastCalledWith(
      pet.id,
      false,
      expect.objectContaining(pet.lostMode)
    )
  );
  expect(await screen.findByText("Off")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Lost Mode is off");
});
