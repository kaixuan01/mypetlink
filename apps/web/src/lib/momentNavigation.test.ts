import { describe, expect, it } from "vitest";
import { momentNavigationPath, sanitizeMomentReturnTo } from "@/lib/momentNavigation";
import { momentPath } from "@/lib/routes";

describe("Moment navigation context", () => {
  it.each(["/explore", "/feed", "/notifications", "/community/profile", "/u/tanfamily", "/p/mochi-pubmochi"])("round trips the allowed surface %s", (path) => {
    const link = new URL(momentNavigationPath("moment-1", path), "https://mypetlink.test");
    expect(sanitizeMomentReturnTo(link.searchParams.get("returnTo"))).toBe(path);
  });

  it("preserves a Search query but strips unrecognized destination parameters", () => {
    expect(sanitizeMomentReturnTo("/search?q=Mochi%20%26%20Coco&redirect=https://evil.test&label=Bank"))
      .toBe("/search?q=Mochi%20%26%20Coco");
  });

  it.each([
    "https://evil.test/explore", "//evil.test", "javascript:alert(1)",
    "/\\evil.test", "/feed/../admin", "/explore#//evil.test", "/explore/",
    "/%65xplore", "/u/%2f%2fevil.test", "/u/../admin", "/p/a%5cb",
    "/login?returnTo=//evil.test", "/admin", "/moments/another", "/feed\n",
  ])("rejects %s", (value) => {
    expect(sanitizeMomentReturnTo(value)).toBeNull();
    expect(momentNavigationPath("moment-1", value)).toBe(momentPath("moment-1"));
  });

  it("keeps a direct/share URL canonical", () => {
    expect(momentNavigationPath("moment-1")).toBe(momentPath("moment-1"));
    expect(momentPath("moment-1")).toBe("/moments/moment-1");
  });
});
