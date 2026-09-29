import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { supportMailtoHref } from "@/lib/support";

describe("supportMailtoHref", () => {
  it("uses the site's one support address", () => {
    expect(supportMailtoHref()).toBe(`mailto:${siteConfig.supportEmail}`);
  });

  it("encodes a pre-filled subject and body", () => {
    const href = supportMailtoHref({
      subject: "Already paid for order MPL-ORD-1",
      body: "Line one\n\nLine & two",
    });

    expect(href).toBe(
      `mailto:${siteConfig.supportEmail}?subject=Already%20paid%20for%20order%20MPL-ORD-1&body=Line%20one%0A%0ALine%20%26%20two`
    );
  });
});
