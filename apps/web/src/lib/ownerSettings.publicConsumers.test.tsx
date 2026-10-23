// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { OWNER_SETTINGS_STORAGE_KEY } from "@/lib/ownerSettings";
import { getAuthSessionKey } from "@/services/authStorage";
import { SESSION_STORAGE_KEY, storedSession } from "@/services/sessionTestFetch";

// C1 in the public pages that read the owner-details cache directly, with no
// portal guard: the real Safety Profile and Share Profile views and the real
// cache reader, in API mode. The pet uses its owner's account details, so a
// cache that is wrongly accepted shows up on the page as the owner's name and
// numbers. Only the Share Profile's own data loaders are stand-ins.

vi.mock("@/components/ui/PetPhotoViewer", () => ({
  PetPhotoViewer: () => <span>Pet portrait</span>,
}));
vi.mock("@/components/brand/BrandLogo", () => ({
  BrandLogo: () => <span>MyPetLink</span>,
}));
vi.mock("@/components/marketing/PublicProfileOwnerControls", () => ({
  PublicProfileOwnerControls: () => null,
  PrivateMemorialOwnerAction: () => null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/p/milo-k7q2",
}));

const share = vi.hoisted(() => ({ profile: null as unknown }));
vi.mock("@/services/petService", () => ({
  getPublicPetProfileByPublicCode: async () => ({ data: share.profile }),
  getOwnedPetByPublicCode: async () => ({ data: null }),
}));
vi.mock("@/services/momentService", () => ({
  getPublicPetMoments: async () => ({ data: [] }),
}));
vi.mock("@/services/publicSocialService", async () => {
  const actual = await vi.importActual<typeof import("@/services/publicSocialService")>(
    "@/services/publicSocialService"
  );
  return { ...actual, getPublicPetMoments: async () => ({ items: [], nextCursor: null }) };
});
vi.mock("@/services/recordService", () => ({
  getPublicPetRecords: async () => ({ data: [] }),
}));

const { QrSafetyPageView } = await import("@/components/marketing/QrSafetyPageView");
const { PublicSharePetProfile } = await import("@/components/marketing/PublicSharePetProfile");

const A_NAME = "Legacy owner A";
const A_PHONE = "+60111111111";
const A_WHATSAPP = "+60111111112";

/** A pet that shows its owner's account details to finders. */
const pet = {
  ...mockPets[0],
  contactOverride: { useOwnerDefaults: true },
  visibility: { ...mockPets[0].visibility, showOwnerName: true, showPhone: true, showWhatsapp: true },
};

function seedOwnerCache(stamp?: unknown) {
  const details = {
    ownerDisplayName: A_NAME,
    email: "a@example.test",
    phoneNumber: A_PHONE,
    whatsappNumber: A_WHATSAPP,
  };
  window.localStorage.setItem(
    OWNER_SETTINGS_STORAGE_KEY,
    JSON.stringify(stamp === undefined ? details : { ...details, sessionKey: stamp })
  );
}

/** Whether any of A's cached identity or numbers reached the page. */
function aOnPage() {
  const html = document.body.innerHTML;
  return [A_NAME, A_PHONE.slice(1), A_WHATSAPP.slice(1)].some((value) => html.includes(value));
}

async function settled() {
  await screen.findByRole("heading", { level: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test");
  window.localStorage.clear();
  share.profile = pet;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

const views = [
  ["Safety Profile", () => render(<QrSafetyPageView pet={pet} />)],
  [
    "Share Profile",
    () => render(<PublicSharePetProfile initialProfile={pet} initialMoments={[]} initialRecords={[]} />),
  ],
] as const;

describe.each(views)("L: the %s, signed out", (_name, open) => {
  it.each([
    ["a legacy cache with no stamp", undefined],
    ["a stamp of null", null],
  ])("never shows a cached owner's identity or numbers from %s", async (_label, stamp) => {
    seedOwnerCache(stamp);
    open();
    await settled();

    expect(aOnPage()).toBe(false);
  });
});

describe.each(views)("L: the %s, signed in (control)", (_name, open) => {
  it("still uses the signed-in owner's own details", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, storedSession("owner-a", { sessionId: "a" }));
    seedOwnerCache(getAuthSessionKey());
    open();
    await settled();

    expect(document.body.innerHTML).toContain(A_NAME);
  });
});
