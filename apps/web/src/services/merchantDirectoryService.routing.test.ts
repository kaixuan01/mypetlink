// @vitest-environment jsdom
// Invoked by MerchantDirectoryHttpTests against a loopback Kestrel host with
// disposable in-memory records and real controllers/capability authorization.
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { writeStoredAuthSession } from "./authStorage";
import { getMerchantListing, updateMerchantListing, saveMerchantBranch, listPartnerStores, type BranchInput, type MerchantListing } from "./merchantDirectoryService";
const origin = process.env.MYPETLINK_DIRECTORY_SMOKE_URL;
const merchant = process.env.MYPETLINK_DIRECTORY_SMOKE_MERCHANT!;
const admin = process.env.MYPETLINK_DIRECTORY_SMOKE_ADMIN!;
// Real HTTP round trips to a freshly started Kestrel host (first requests JIT
// their routes) exceed Vitest's 5s unit-test default on a loaded CI runner.
const smoke = (name: string, fn: () => Promise<void>) => it.skipIf(!origin)(name, fn, 30_000);
let listing: MerchantListing;
beforeAll(() => {
  if (!origin) return;
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", origin);
  writeStoredAuthSession({ accessToken: admin, refreshToken: "test-only", expiresAt: Date.now() + 60000,
    user: { id: admin, email: "test@example.test", displayName: "Admin", roles: [], status: "Active" } });
});
afterAll(() => { window.localStorage.clear(); vi.unstubAllEnvs(); });
smoke("reads and edits Admin listing/branches through actual routes", async () => {
  listing = await getMerchantListing(merchant);
  expect(listing.showOnWebsite).toBe(false);
  const branch: BranchInput = { name: "Smoke branch", address: { addressLine1: "1 Test Street", addressLine2: null, postcode: "50000", city: "KL", state: "KL", country: "Malaysia" },
    googleMapsUrl: null, wazeUrl: null, latitude: null, longitude: null, contactPhone: null, whatsApp: null, businessHours: null, isActive: true, showOnWebsite: true, displayOrder: 0, merchantConcurrencyToken: listing.concurrencyToken };
  listing = await saveMerchantBranch(merchant, null, branch);
  listing = await saveMerchantBranch(merchant, listing.branches[0].id, { ...branch, name: "Edited smoke branch", concurrencyToken: listing.branches[0].concurrencyToken, merchantConcurrencyToken: listing.concurrencyToken });
  expect(listing.branches[0].name).toBe("Edited smoke branch");
  const unauthorized = await fetch(`${origin}/api/v1/admin/merchant-sales/merchants/${merchant}/listing`);
  expect(unauthorized.status).toBe(401);
  expect((await fetch(`${origin}/public/partner-stores`)).status).toBe(404);
});
smoke("publishes with evidence and serves public list/search/direct responses", async () => {
  expect((await listPartnerStores(1, "", null)).total).toBe(0);
  listing = await updateMerchantListing(merchant, { showOnWebsite: true, businessDescription: "Public test description", concurrencyToken: listing.concurrencyToken,
    permission: { source: "Email", reference: "PRIVATE SMOKE PERMISSION", branchIds: listing.branches.map(branch => branch.id) } });
  const publicList = await listPartnerStores(1, "Edited smoke", null);
  expect(publicList.total).toBe(1);
  expect((await listPartnerStores(1, "", listing.publicCode)).items[0].branches[0].name).toBe("Edited smoke branch");
  expect(JSON.stringify(publicList)).not.toContain("PRIVATE SMOKE PERMISSION");
});
smoke("withdraws immediately and real public routing rejects the old code", async () => {
  const code = listing.publicCode;
  await updateMerchantListing(merchant, { showOnWebsite: false, businessDescription: null, concurrencyToken: listing.concurrencyToken, withdrawalReason: "Private test withdrawal" });
  expect((await listPartnerStores(1, "", null)).items).toEqual([]);
  await expect(listPartnerStores(1, "", code)).rejects.toMatchObject({ status: 404 });
});
