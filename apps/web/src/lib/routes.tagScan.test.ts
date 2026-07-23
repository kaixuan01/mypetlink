import { describe, expect, it } from "vitest";
import {
  getTagScanPath,
  tagEntryPath,
  tagNfcPath,
  tagPath,
  tagQrPath,
} from "@/lib/routes";

describe("physical tag entry routes", () => {
  it("uses distinct new QR/NFC paths and keeps the legacy path", () => {
    expect(tagQrPath("MPL-TEST-01")).toBe("/q/MPL-TEST-01");
    expect(tagNfcPath("MPL-TEST-01")).toBe("/n/MPL-TEST-01");
    expect(tagPath("MPL-TEST-01")).toBe("/t/MPL-TEST-01");
    expect(getTagScanPath({ tagCode: "MPL-TEST-01" })).toBe(
      "/q/MPL-TEST-01"
    );
  });

  it("preserves the trusted route source in activation return paths", () => {
    expect(tagEntryPath("MPL-TEST-01", "qr")).toBe("/q/MPL-TEST-01");
    expect(tagEntryPath("MPL-TEST-01", "nfc")).toBe("/n/MPL-TEST-01");
    expect(tagEntryPath("MPL-TEST-01", "legacy")).toBe("/t/MPL-TEST-01");
  });
});
