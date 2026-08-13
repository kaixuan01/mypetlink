// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { QrSafetyPageView } from "@/components/marketing/QrSafetyPageView";

vi.mock("@/components/ui/PetPhotoViewer", () => ({
  PetPhotoViewer: () => <span>Pet portrait</span>,
}));

afterEach(cleanup);

function withFinderContact({
  phone = "",
  whatsapp = "",
  showPhone = true,
  showWhatsapp = true,
}: {
  phone?: string;
  whatsapp?: string;
  showPhone?: boolean;
  showWhatsapp?: boolean;
}) {
  return {
    ...mockPets[0],
    owner: {
      ...mockPets[0].owner,
      phone,
      whatsapp,
    },
    contactOverride: {
      useOwnerDefaults: false,
      phoneNumber: phone,
      whatsappNumber: whatsapp,
    },
    visibility: {
      ...mockPets[0].visibility,
      showPhone,
      showWhatsapp,
    },
  };
}

it("applies the same saved theme to the QR safety profile", async () => {
  const pet = { ...mockPets[0], profileTheme: "peach" as const };
  const { container } = render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink Safety Profile");
  const themedProfile = container.querySelector("[data-profile-theme]");
  expect(themedProfile?.getAttribute("data-profile-theme")).toBe("peach");
  expect(screen.getByText("Safety note").parentElement?.getAttribute("style"))
    .toContain("background");
});

it("shows known allergies prominently without exposing raw JSON", async () => {
  const pet = { ...mockPets[0], allergies: ["Chicken", "Penicillin"] };
  render(<QrSafetyPageView pet={pet} />);

  expect(await screen.findByText("Known allergies")).toBeTruthy();
  expect(screen.getByText("Chicken")).toBeTruthy();
  expect(screen.getByText("Penicillin")).toBeTruthy();
  expect(document.body.textContent).not.toContain('["Chicken"');
});

it("never shows the Not set placeholder in the finder pet summary", async () => {
  const pet = {
    ...mockPets[0],
    breed: "Not set",
    color: "Not set",
  };
  render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink Safety Profile");
  expect(document.body.textContent).not.toContain("Not set");
});

it("falls back to the pet colour in the summary when the breed is unknown", async () => {
  const pet = {
    ...mockPets[0],
    breed: "Not set",
    color: "Golden brown",
  };
  render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink Safety Profile");
  expect(document.body.textContent).toContain("Golden brown");
});

it("hides the allergy safety section when none are saved", async () => {
  render(<QrSafetyPageView pet={{ ...mockPets[0], allergies: [] }} />);

  await screen.findByText("MyPetLink Safety Profile");
  expect(screen.queryByText("Known allergies")).toBeNull();
});

it("shows the normal instruction and WhatsApp action when only public WhatsApp is available", async () => {
  const pet = withFinderContact({ whatsapp: "+60123456789" });

  render(<QrSafetyPageView pet={pet} />);

  expect(
    await screen.findByText(
      "Please contact the owner directly using one of the options below."
    )
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "WhatsApp Owner" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Call Owner" })).toBeNull();
  expect(screen.queryByText("Contact unavailable")).toBeNull();
});

it("shows the normal instruction and phone action when only public phone is available", async () => {
  const pet = withFinderContact({ phone: "+60123456789" });

  render(<QrSafetyPageView pet={pet} />);

  expect(
    await screen.findByText(
      "Please contact the owner directly using one of the options below."
    )
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Call Owner" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "WhatsApp Owner" })).toBeNull();
  expect(screen.queryByText("Contact unavailable")).toBeNull();
});

it("shows every valid public contact action when phone and WhatsApp are available", async () => {
  const pet = withFinderContact({
    phone: "+60111222333",
    whatsapp: "+60123456789",
  });

  render(<QrSafetyPageView pet={pet} />);

  expect(
    await screen.findByText(
      "Please contact the owner directly using one of the options below."
    )
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Call Owner" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "WhatsApp Owner" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send Found Location" })).toBeTruthy();
});

it("shows a clear fallback instead of contact instructions when no public contact is available", async () => {
  const pet = withFinderContact({});

  render(<QrSafetyPageView pet={pet} />);

  await screen.findByText("MyPetLink Safety Profile");
  expect(
    screen.getByText("The owner has not added a public contact method yet.")
  ).toBeTruthy();
  expect(screen.getByText("Contact unavailable")).toBeTruthy();
  expect(
    screen.getByText(
      `Please keep ${pet.name} safe and check this Safety Profile again later.`
    )
  ).toBeTruthy();
  expect(document.body.textContent).not.toContain("options below");
  expect(screen.queryByRole("link", { name: "Call Owner" })).toBeNull();
  expect(screen.queryByRole("link", { name: "WhatsApp Owner" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Send Found Location" })).toBeNull();
});

it("does not expose private account contact when finder contact visibility is off", async () => {
  const privatePhone = "+60112223344";
  const privateWhatsapp = "+60198887766";
  const pet = withFinderContact({
    phone: privatePhone,
    whatsapp: privateWhatsapp,
    showPhone: false,
    showWhatsapp: false,
  });

  const { container } = render(<QrSafetyPageView pet={pet} />);

  expect(await screen.findByText("Contact unavailable")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Call Owner" })).toBeNull();
  expect(screen.queryByRole("link", { name: "WhatsApp Owner" })).toBeNull();
  expect(container.innerHTML).not.toContain(privatePhone);
  expect(container.innerHTML).not.toContain(privateWhatsapp);
});

it("shows the no-contact fallback in Lost Mode without implying an action exists", async () => {
  const pet = {
    ...withFinderContact({}),
    lostModeEnabled: true,
    lostMode: {
      ...mockPets[0].lostMode,
      lostMessage: "Please help Milo get home safely.",
    },
  };

  render(<QrSafetyPageView pet={pet} />);

  expect(
    await screen.findByText("The owner has not added a public contact method yet.")
  ).toBeTruthy();
  expect(screen.getByText("Lost Mode Active")).toBeTruthy();
  expect(screen.getByText("Contact unavailable")).toBeTruthy();
  expect(document.body.textContent).not.toContain("options below");
  expect(document.body.textContent).not.toContain(
    "If you have found this pet, please contact the owner immediately."
  );
  expect(screen.queryByRole("link", { name: "Call Owner" })).toBeNull();
  expect(screen.queryByRole("link", { name: "WhatsApp Owner" })).toBeNull();
});

it("keeps the memorial state separate from the no-contact fallback", async () => {
  const pet = {
    ...withFinderContact({}),
    lifecycleStatus: "Memorial" as const,
  };

  render(<QrSafetyPageView pet={pet} />);

  expect(
    await screen.findByText(`${pet.name}'s Safety Profile is no longer active`)
  ).toBeTruthy();
  expect(screen.queryByText("Contact unavailable")).toBeNull();
  expect(
    screen.queryByText("The owner has not added a public contact method yet.")
  ).toBeNull();
});

it("adds labeled finder details and removes the urgent state when found", async () => {
  const rawTimestamp = "2026-07-16T07:42:00+00:00";
  const lostPet = {
    ...mockPets[0],
    lostModeEnabled: true,
    lostMode: {
      ...mockPets[0].lostMode,
      lastSeenArea: "Ampang, Kuala Lumpur",
      lastSeenDateTime: rawTimestamp,
      lostMessage: "Please help Milo get home safely.",
      rewardNote: "RM50 reward offered",
      extraContactInstruction: "Please call me directly",
    },
  };
  const { unmount } = render(<QrSafetyPageView pet={lostPet} />);

  expect(await screen.findByText(`${lostPet.name} is currently missing`)).toBeTruthy();
  expect(screen.getByText("Lost Mode Active")).toBeTruthy();
  expect(screen.getByText("Please help Milo get home safely.")).toBeTruthy();
  expect(screen.getByText("Last seen area")).toBeTruthy();
  expect(screen.getByText("Last seen")).toBeTruthy();
  expect(screen.getByText("16 Jul 2026, 3:42 PM")).toBeTruthy();
  expect(screen.getByText("Reward")).toBeTruthy();
  expect(screen.getByText("RM50 reward offered")).toBeTruthy();
  expect(screen.getByText("Contact instructions")).toBeTruthy();
  expect(screen.getByText("Please call me directly")).toBeTruthy();
  expect(document.body.textContent).not.toContain(rawTimestamp);
  unmount();

  render(<QrSafetyPageView pet={{ ...lostPet, lostModeEnabled: false }} />);
  expect(await screen.findByText(`Found ${lostPet.name}?`)).toBeTruthy();
  expect(screen.queryByText("Lost Mode Active")).toBeNull();
});
