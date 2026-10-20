import { describe, expect, it } from "vitest";
import type * as api from "@/services/adminConsignmentService";
import {
  documentGuidance,
  documentTone,
  emptySignedCopyForm,
  fileSizeLabel,
  fileToBase64,
  malaysiaDay,
  shareMessage,
  shortFingerprint,
  validateSignedCopy,
} from "./agreementDocument";

const agreement = {
  id: "a", merchantName: "Synthetic Paws", reference: "SYN-1", version: 2, concurrencyToken: "t", signedAgreementReference: null,
} as api.Agreement;
const issue = { id: "i", issueNumber: 3, termsFingerprint: "abcdef0123456789" } as api.IssuedAgreementDocument;
const summary = (overrides: Partial<api.AgreementDocumentSummary>) =>
  ({ status: "ready", missingForDocument: [], issuedDocuments: [], concurrencyToken: "t", issuedPartyDetailsChanged: false, ...overrides }) as api.AgreementDocumentSummary;

describe("agreement document rules", () => {
  it("formats the fingerprint the way the PDF prints it", () => {
    expect(shortFingerprint("abcdef0123456789")).toBe("ABCD-EF01-2345");
    expect(fileSizeLabel(900)).toBe("900 B");
    expect(fileSizeLabel(2048)).toBe("2 KB");
    expect(fileSizeLabel(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("never colours an incomplete draft as fine or a signed copy as an approval", () => {
    expect(documentTone("incomplete")).toBe("critical");
    expect(documentTone("ready")).toBe("warning");
    expect(documentTone("issued")).toBe("info");
    expect(documentTone("signed-copy-received")).toBe("positive");
  });

  it("guides the operator from the server's status", () => {
    expect(documentGuidance(summary({ concurrencyToken: "other" }), agreement)?.title).toMatch(/changed after this page loaded/);
    const incomplete = documentGuidance(summary({ status: "incomplete", missingForDocument: ["Duration", "MyPetLink legal business name"] }), agreement);
    expect(incomplete?.message).toBe("Still needed: Duration, MyPetLink legal business name. To finish, complete Business Identity under Configuration.");
    expect(documentGuidance(summary({ issuedDocuments: [issue] }), agreement)?.title).toBe("The terms changed after issue 3 was sent");
    expect(documentGuidance(summary({ status: "issued", issuedPartyDetailsChanged: true }), agreement)?.tone).toBe("warning");
    expect(documentGuidance(summary({ status: "signed-copy-received" }), agreement)?.message).toMatch(/does not approve/);
    expect(documentGuidance(summary({ status: "signed-copy-received" }), { ...agreement, signedAgreementReference: "SIGNED-1" })).toBeNull();
    expect(documentGuidance(summary({ status: "approved" }), agreement)).toBeNull();
  });

  it("writes a share message that asks for a check and claims nothing was sent", () => {
    const text = shareMessage(agreement, issue);
    expect(text).toContain("SYN-1 (version 2, issue 3)");
    expect(text).toContain("ABCD-EF01-2345");
    expect(text.toLowerCase()).not.toContain("sent you");
  });

  it("checks a signed copy before it is uploaded", () => {
    const pdf = new File(["%PDF"], "signed.pdf", { type: "application/pdf" });
    const ok = { ...emptySignedCopyForm, file: pdf, partnerSignatoryName: "Synthetic Signatory", partnerSignedOn: "2026-10-18" };
    expect(validateSignedCopy(ok, "2026-10-17", "2026-10-19")).toEqual({});
    expect(validateSignedCopy({ ...ok, file: new File(["x"], "signed.pdf", { type: "image/png" }) }, "2026-10-17", "2026-10-19").file).toMatch(/PDF, JPEG or PNG/);
    expect(validateSignedCopy({ ...ok, file: new File(["x"], "signed.exe", { type: "application/pdf" }) }, "2026-10-17", "2026-10-19").file).toBeTruthy();
    expect(validateSignedCopy({ ...ok, partnerSignedOn: "2026-10-16" }, "2026-10-17", "2026-10-19").partnerSignedOn).toMatch(/before the agreement was issued/);
    expect(validateSignedCopy({ ...ok, partnerSignedOn: "2026-10-20" }, "2026-10-17", "2026-10-19").partnerSignedOn).toMatch(/future/);
    expect(validateSignedCopy({ ...ok, companySignedOn: "2026-10-18" }, "2026-10-17", "2026-10-19").companySignatoryName).toBeTruthy();
    expect(validateSignedCopy({ ...ok, notes: "x".repeat(1001) }, "2026-10-17", "2026-10-19").notes).toBeTruthy();
  });

  it("uses Malaysia dates and encodes files exactly", async () => {
    expect(malaysiaDay("2026-10-18T17:00:00Z")).toBe("2026-10-19");
    expect(atob(await fileToBase64(new Blob(["%PDF-1.4 synthetic"])))).toBe("%PDF-1.4 synthetic");
  });
});
