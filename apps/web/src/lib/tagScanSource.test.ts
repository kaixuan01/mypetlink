import { describe, expect, it } from "vitest";
import {
  normalizeTagScanSource,
  tagScanSourceLabel,
} from "@/lib/tagScanSource";

describe("tag scan source labels", () => {
  it("maps stable API codes to owner/admin-facing labels", () => {
    expect(tagScanSourceLabel("Qr")).toBe("QR scan");
    expect(tagScanSourceLabel("Nfc")).toBe("NFC tap");
    expect(tagScanSourceLabel("Legacy")).toBe("Legacy link");
    expect(tagScanSourceLabel("Unknown")).toBe("Unknown source");
  });

  it("maps missing, older, and invalid source values safely", () => {
    expect(normalizeTagScanSource(null)).toBe("Unknown");
    expect(normalizeTagScanSource("nFc")).toBe("Nfc");
    expect(normalizeTagScanSource("spoofed")).toBe("Unknown");
  });
});
