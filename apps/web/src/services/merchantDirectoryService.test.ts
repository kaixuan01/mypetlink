// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeStoredAuthSession } from "./authStorage";
import { getMerchantListing, updateMerchantListing, saveMerchantBranch, listPartnerStores, type BranchInput } from "./merchantDirectoryService";

const fetchRequest = vi.fn();
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.mypetlink.test/");
  vi.stubGlobal("fetch", fetchRequest.mockReset().mockImplementation(async () => new Response(JSON.stringify({ data: {}, meta: { total: 0 } }), { status: 200 })));
  writeStoredAuthSession({ accessToken: "test-admin", refreshToken: "test-refresh", expiresAt: Date.now() + 60000,
    user: { id: "admin", email: "admin@example.test", displayName: "Admin", roles: [], status: "Active" } });
});
afterEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const branch = { name: "Main", address: { addressLine1: "1 Street", city: "KL", state: "KL", postcode: "50000", country: "Malaysia" } } as BranchInput;
it("generates all six versioned requests through the real API client", async () => {
  await getMerchantListing("merchant/id");
  await updateMerchantListing("merchant/id", { showOnWebsite: false, businessDescription: null, concurrencyToken: "AQ==" });
  await saveMerchantBranch("merchant/id", null, branch);
  await saveMerchantBranch("merchant/id", "branch/id", branch);
  await listPartnerStores(2, "Pet & Shop", null);
  await listPartnerStores(1, "", "public/code");
  expect(fetchRequest.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
    ["https://api.mypetlink.test/api/v1/admin/merchant-sales/merchants/merchant%2Fid/listing", "GET"],
    ["https://api.mypetlink.test/api/v1/admin/merchant-sales/merchants/merchant%2Fid/listing", "PUT"],
    ["https://api.mypetlink.test/api/v1/admin/merchant-sales/merchants/merchant%2Fid/branches", "POST"],
    ["https://api.mypetlink.test/api/v1/admin/merchant-sales/merchants/merchant%2Fid/branches/branch%2Fid", "PUT"],
    ["https://api.mypetlink.test/api/v1/public/partner-stores?page=2&pageSize=20&search=Pet+%26+Shop", "GET"],
    ["https://api.mypetlink.test/api/v1/public/partner-stores/public%2Fcode", "GET"],
  ]);
  for (const [, options] of fetchRequest.mock.calls.slice(0, 4)) expect(options.headers.get("Authorization")).toBe("Bearer test-admin");
  for (const [, options] of fetchRequest.mock.calls.slice(4)) { expect(options.headers.has("Authorization")).toBe(false); expect(options.cache).toBe("no-store"); }
});
