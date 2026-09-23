// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  createPetMoment: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/services/petService", async () => {
  const actual = await vi.importActual<typeof import("@/services/petService")>(
    "@/services/petService"
  );
  return { ...actual, getPets: (...a: unknown[]) => mocks.getPets(...a) };
});

vi.mock("@/services/momentService", async () => {
  const actual = await vi.importActual<typeof import("@/services/momentService")>(
    "@/services/momentService"
  );
  return {
    ...actual,
    createPetMoment: (...a: unknown[]) => mocks.createPetMoment(...a),
  };
});

const { CommunityMomentComposer } = await import(
  "@/components/social/CommunityMomentComposer"
);

/**
 * Writing a Moment from inside Community.
 *
 * Share used to be a navigation into the Owner Portal, which meant leaving
 * Community to make something for Community. It is a dialog now — and the
 * dialog is the Owner Portal's own editor, so none of the rules about what a
 * Moment is are decided twice.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

function pet(id: string, name: string) {
  return { id, name, species: "Cat", breed: "British Shorthair" };
}

/**
 * Fills the fields the shared editor requires.
 *
 * Title, date and category are all mandatory — which is the Owner Portal's
 * existing rule, inherited rather than chosen here. Community Share is the
 * lighter of the two contexts, so this is worth knowing: "share a Moment" asks
 * for three things before it will accept one.
 */
function fillRequiredFields(title = "Beach day") {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2026-09-17" },
  });
  fireEvent.change(screen.getByLabelText("Moment category"), {
    target: { value: "Funny Moment" },
  });
}

beforeEach(() => {
  mocks.getPets.mockResolvedValue({ data: [pet("pet-1", "Mochi")] });
  mocks.createPetMoment.mockResolvedValue({ data: { id: "moment-1" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("choosing the pet", () => {
  it("picks the only pet without asking", async () => {
    render(<CommunityMomentComposer onClose={vi.fn()} />);

    await screen.findByRole("dialog");

    // One pet is not a choice, and a question with one answer is just a step.
    expect(screen.queryByTestId("moment-primary-pet")).toBeNull();
    expect(screen.getByRole("dialog").textContent).toContain("Mochi");
  });

  it("offers a selector once there is more than one", async () => {
    mocks.getPets.mockResolvedValue({
      data: [pet("pet-1", "Mochi"), pet("pet-2", "Biscuit")],
    });

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const select = (await screen.findByTestId(
      "moment-primary-pet"
    )) as HTMLSelectElement;

    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Mochi",
      "Biscuit",
    ]);
    expect(select.value).toBe("pet-1");
  });

  it("keeps the primary pet out of the additional subjects", async () => {
    mocks.getPets.mockResolvedValue({
      data: [pet("pet-1", "Mochi"), pet("pet-2", "Biscuit")],
    });

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const select = (await screen.findByTestId(
      "moment-primary-pet"
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pet-2" } });

    // Switching the primary swaps which pet is "the one this is about" and
    // which is merely "also there" — the multi-pet rule the editor already has.
    await waitFor(() => expect(select.value).toBe("pet-2"));
  });

  it("asks for a pet first when there are none", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const prerequisite = await screen.findByTestId("composer-needs-pet");

    // Not a broken editor with an empty picker: the prerequisite genuinely
    // does not exist, so crossing into My Pets is the honest answer.
    expect(prerequisite.textContent).toContain("Add a pet before sharing");
    expect(
      within(prerequisite).getByRole("link", { name: /add a pet/i }).getAttribute("href")
    ).toBe("/pets/new");
  });

  it("does not offer Add a pet when it simply could not check", async () => {
    mocks.getPets.mockRejectedValue(new Error("network"));

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const prerequisite = await screen.findByTestId("composer-needs-pet");

    // "You have no pets" and "we could not ask" are different things, and
    // telling somebody with three pets to add one would be a lie.
    expect(prerequisite.textContent).toContain("couldn't check your pets");
    expect(prerequisite.querySelector('a[href="/pets/new"]')).toBeNull();
  });
});

describe("creating the Moment", () => {
  it("uses the existing create contract, against the primary pet", async () => {
    const onClose = vi.fn();
    render(<CommunityMomentComposer onClose={onClose} />);

    await screen.findByRole("dialog");
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Share Moment" }));

    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledTimes(1));

    const [petId, payload] = mocks.createPetMoment.mock.calls[0];
    expect(petId).toBe("pet-1");
    expect(payload.title).toBe("Beach day");
    // The editor's own payload shape — visibility included, not invented here.
    expect(payload).toHaveProperty("visibility");
    expect(payload).toHaveProperty("media");
  });

  it("closes and stays put on success", async () => {
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(<CommunityMomentComposer onClose={onClose} onCreated={onCreated} />);

    await screen.findByRole("dialog");
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Share Moment" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    // The reader entered creation from a Community screen, so they are still
    // on it. Nothing pushes them into the Owner Portal afterwards.
    expect(onCreated).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("will not submit the same Moment twice", async () => {
    let settle: (value: unknown) => void = () => {};
    mocks.createPetMoment.mockImplementation(
      () => new Promise((resolve) => (settle = resolve))
    );

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    await screen.findByRole("dialog");
    fillRequiredFields();

    const share = screen.getByRole("button", { name: "Share Moment" });
    fireEvent.click(share);
    fireEvent.click(share);
    fireEvent.click(share);

    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledTimes(1));
    settle({ data: { id: "moment-1" } });
  });

  it("keeps the draft when sharing fails", async () => {
    mocks.createPetMoment.mockRejectedValue(new Error("nope"));
    const onClose = vi.fn();

    render(<CommunityMomentComposer onClose={onClose} />);

    await screen.findByRole("dialog");
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Share Moment" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    // Retyping what you already typed is the worst possible answer to a
    // network blip, so the draft survives and the dialog stays open.
    expect(title.value).toBe("Beach day");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("closing the composer", () => {
  it("just closes when nothing has been written", async () => {
    const onClose = vi.fn();
    render(<CommunityMomentComposer onClose={onClose} />);

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByLabelText("Close moment editor"));

    // No confirmation for a draft that does not exist.
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/discard this moment/i)).toBeNull();
  });

  it("asks before throwing away a started draft", async () => {
    const onClose = vi.fn();
    render(<CommunityMomentComposer onClose={onClose} />);

    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Beach day" },
    });
    fireEvent.click(screen.getByLabelText("Close moment editor"));

    expect(await screen.findByText(/discard this moment/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("one Moment lifecycle, not two", () => {
  it("renders the Owner Portal's editor rather than a second form", () => {
    const composer = read("components/social/CommunityMomentComposer.tsx");

    expect(composer).toContain("MomentEditorDialog");
    expect(composer).toContain("createPetMoment");

    // No second set of domain rules: no validation, no uploader, no payload
    // assembly and no visibility model of its own.
    expect(composer).not.toContain("MediaUploader");
    expect(composer).not.toContain("visibility:");
    expect(composer).not.toContain("PublishedAt");
    expect(composer).not.toMatch(/maxLength|required/);
  });

  it("leaves the Owner Portal's own Moments screen in place", () => {
    // Community Share is a quick way to write one. My Pets → Moments is still
    // where an archive is managed, edited and deleted.
    const manager = read("components/portal/PetMomentsManager.tsx");

    expect(manager).toContain("createPetMoment");
    expect(manager).toContain("updatePetMoment");
    expect(manager).toContain("MomentEditorDialog");
  });

  it("adds the pet chooser without disturbing the portal's editor", () => {
    const editor = read("components/portal/MomentEditorDialog.tsx");

    // Optional, and supplied only by Community: the portal opens from a pet's
    // own page, where the subject is already decided by the route.
    expect(editor).toContain("primaryPetOptions");
    expect(editor).toContain("onPrimaryPetChange");
    expect(editor).toContain("primaryPetOptions && onPrimaryPetChange");
  });
});

describe("the same pet rules as the Owner Portal", () => {
  function lifecyclePet(
    id: string,
    name: string,
    lifecycleStatus: "Active" | "Memorial" | "Archived"
  ) {
    return { ...pet(id, name), lifecycleStatus };
  }

  it("never offers an archived pet, and keeps a memorial one", async () => {
    mocks.getPets.mockResolvedValue({
      data: [
        lifecyclePet("pet-old", "Pebble", "Archived"),
        lifecyclePet("pet-1", "Topu", "Active"),
        lifecyclePet("pet-2", "Biscuit", "Memorial"),
      ],
    });

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const select = (await screen.findByTestId(
      "moment-primary-pet"
    )) as HTMLSelectElement;

    // The server will not start a Moment for an archived pet, so choosing one
    // could only end in a refusal. The default is the first pet it will accept.
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Topu",
      "Biscuit",
    ]);
    expect(select.value).toBe("pet-1");

    const who = screen.getByRole("group", { name: /Who.s in this Moment/ });
    expect(within(who).queryByText("Pebble")).toBeNull();
    expect(within(who).getByRole("checkbox", { name: /Biscuit/ })).toBeTruthy();
  });

  it("says restore rather than add when every pet is archived", async () => {
    mocks.getPets.mockResolvedValue({
      data: [lifecyclePet("pet-old", "Pebble", "Archived")],
    });

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const needsPet = await screen.findByTestId("composer-needs-pet");

    expect(needsPet.textContent).toContain("Restore a pet before sharing a Moment.");
    expect(
      within(needsPet).getByRole("link", { name: "Go to My Pets" }).getAttribute("href")
    ).toBe("/pets");
  });

  it("never sends the primary pet as one of its own extras", async () => {
    mocks.getPets.mockResolvedValue({
      data: [pet("pet-1", "Topu"), pet("pet-2", "Biscuit")],
    });

    render(<CommunityMomentComposer onClose={vi.fn()} />);

    const select = (await screen.findByTestId(
      "moment-primary-pet"
    )) as HTMLSelectElement;

    // Tick Biscuit as an extra, then make Biscuit the Moment's pet.
    fireEvent.click(screen.getByRole("checkbox", { name: /Biscuit/ }));
    fireEvent.change(select, { target: { value: "pet-2" } });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Share Moment" }));

    await waitFor(() => expect(mocks.createPetMoment).toHaveBeenCalledOnce());
    expect(mocks.createPetMoment.mock.calls[0][0]).toBe("pet-2");
    expect(mocks.createPetMoment.mock.calls[0][1].additionalPetIds).toEqual([]);
  });

  it("offers only the owner's own pets, from the owner's own pet list", () => {
    const composer = read("components/social/CommunityMomentComposer.tsx");

    // A followed household's pets are not a source here. Following grants no
    // right to put somebody else's pet in your Moment.
    expect(composer).toContain('import { getPets } from "@/services/petService";');
    expect(composer).not.toMatch(/socialGraphService|getSocialFeed|following/i);
    expect(composer).toContain("momentPrimaryPetOptions");
    expect(composer).toContain("momentAdditionalPetOptions");
    expect(read("components/portal/PetMomentsManager.tsx")).toContain(
      "momentAdditionalPetOptions"
    );
  });
});
