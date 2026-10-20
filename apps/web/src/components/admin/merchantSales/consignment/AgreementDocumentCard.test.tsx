// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/services/adminConsignmentService";
import { AgreementDocumentCard } from "./AgreementDocumentCard";
import type { ConsignmentContext, ConsignmentPermissions } from "./context";
import { useConsignmentActions } from "./useConsignmentActions";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(), preview: vi.fn(), issue: vi.fn(), fetchIssued: vi.fn(), upload: vi.fn(), fetchSigned: vi.fn(), save: vi.fn(),
}));
vi.mock("@/services/adminConsignmentService", () => ({
  MAX_SIGNED_COPY_BYTES: 8 * 1024 * 1024,
  getAgreementDocument: mocks.summary,
  previewAgreementDocument: mocks.preview,
  issueAgreementDocument: mocks.issue,
  fetchIssuedAgreement: mocks.fetchIssued,
  uploadSignedAgreement: mocks.upload,
  fetchSignedAgreement: mocks.fetchSigned,
  saveAgreementFile: mocks.save,
}));

// Synthetic records only.
const agreement: api.Agreement = {
  id: "agreement", merchantId: "merchant", merchantName: "Synthetic Paws", reference: "SYN-CONS-1", version: 1, status: "Draft",
  partnerCommissionPercentage: 30, effectiveFrom: "2026-10-01T00:00:00Z", effectiveTo: null, durationTerms: "Synthetic term",
  settlementFrequency: "Synthetic monthly", paymentDeadlineDays: 21, discountTerms: "Synthetic discounts", returnTerms: "Synthetic returns",
  lossTerms: "Synthetic loss", signedAgreementReference: null, externalTrackerReference: "SYN-TRACKER",
  pendingTerms: ["Signed agreement reference"], concurrencyToken: "token-1",
};
const fingerprint = "6B07D843DA58" + "0".repeat(52);
const issueOne: api.IssuedAgreementDocument = {
  id: "issue-1", issueNumber: 1, agreementVersion: 1, termsFingerprint: fingerprint, contentSha256: "A".repeat(64),
  fileName: "MyPetLink_Consignment_SYN-CONS-1_v1.pdf", issuedAt: "2026-10-18T02:00:00Z", issuedByName: "Synthetic Admin", isCurrent: true,
};
const base: api.AgreementDocumentSummary = {
  agreementId: "agreement", reference: "SYN-CONS-1", version: 1, status: "ready", statusLabel: "Ready for Signature",
  missingForDocument: [], currentTermsFingerprint: fingerprint, currentIssuedDocumentId: null, issuedPartyDetailsChanged: false,
  signedCopyMatchesCurrentTerms: false, canIssue: true, concurrencyToken: "token-1", issuedDocuments: [], signedCopies: [],
};
const issued: api.AgreementDocumentSummary = {
  ...base, status: "issued", statusLabel: "Issued for Signature", currentIssuedDocumentId: "issue-1", canIssue: false, issuedDocuments: [issueOne],
};
const pdf = { blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }), fileName: issueOne.fileName };

const allowAll: ConsignmentPermissions = {
  manage: true, approve: true, allocate: true, dispatch: true, reconcile: true, returns: true, release: true, writeOff: true,
  exportRecords: true, managePolicy: true, managePrices: true, recordSales: true, verifySales: true, recordStocktake: true,
  closePeriods: true, resolveDiscrepancies: true,
};
const viewOnly: ConsignmentPermissions = Object.fromEntries(Object.keys(allowAll).map((k) => [k, false])) as ConsignmentPermissions;

const openWizard = vi.fn();
function Harness({ a = agreement, can = allowAll }: { a?: api.Agreement; can?: ConsignmentPermissions }) {
  const { actions, dialog } = useConsignmentActions(() => undefined);
  const context = { can, actions, reloadKey: 0, openWizard } as unknown as ConsignmentContext;
  return (
    <>
      <AgreementDocumentCard agreement={a} context={context} />
      {dialog}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.summary.mockResolvedValue(base);
  mocks.preview.mockResolvedValue(pdf);
  mocks.fetchIssued.mockResolvedValue(pdf);
  mocks.issue.mockResolvedValue(issued);
  URL.createObjectURL = vi.fn(() => "blob:agreement");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("Agreement document", () => {
  it("issues the saved terms the operator is looking at, after confirmation", async () => {
    render(<Harness />);
    expect(await screen.findByText("Ready for Signature")).toBeTruthy();
    expect(screen.getByText("6B07-D843-DA58")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Issue for signature" }));
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(screen.getByText(/doesn’t approve the agreement or record a signature/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Issue agreement" }));
    await waitFor(() => expect(mocks.issue).toHaveBeenCalledWith(agreement));
    expect(await screen.findByText("Issued for Signature")).toBeTruthy();
    for (const name of ["Download PDF", "Print", "Share", "Upload signed copy"]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("refuses to act on terms that changed after the page loaded", async () => {
    mocks.summary.mockResolvedValue({ ...base, concurrencyToken: "token-2" });
    render(<Harness />);
    expect(await screen.findByText("These terms changed after this page loaded")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Issue for signature" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview PDF" })).toBeNull();
  });

  it("explains what is missing instead of offering a document", async () => {
    mocks.summary.mockResolvedValue({ ...base, status: "incomplete", statusLabel: "Draft — Incomplete", canIssue: false,
      currentTermsFingerprint: null, missingForDocument: ["Duration", "Partner business registration number"] });
    render(<Harness />);
    expect(await screen.findByText(/Still needed: Duration, Partner business registration number\. To finish, update the partner in Merchants\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Issue for signature" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview PDF" })).toBeNull();
  });

  it("previews with the agreement's own token in a new tab", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview PDF" }));
    await waitFor(() => expect(tab.location.href).toBe("blob:agreement"));
    expect(mocks.preview).toHaveBeenCalledWith(agreement);
    open.mockRestore();
  });

  it("downloads the issued copy and falls back to attach-it-yourself sharing", async () => {
    mocks.summary.mockResolvedValue(issued);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(pdf));
    expect(mocks.fetchIssued).toHaveBeenCalledWith("agreement", issueOne);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Send to the partner" });
    expect(within(dialog).getByText(/nothing here is marked as sent or signed/)).toBeTruthy();
    expect((within(dialog).getByLabelText("Suggested message") as HTMLTextAreaElement).value).toContain("6B07-D843-DA58");
  });

  it("prints the PDF itself rather than the page", async () => {
    mocks.summary.mockResolvedValue(issued);
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Print" }));
    await waitFor(() => expect(document.querySelector(`iframe[title="${issueOne.fileName}"]`)?.getAttribute("src")).toBe("blob:agreement"));
  });

  it("validates a signed copy and records it against the current issue without approving", async () => {
    mocks.summary.mockResolvedValue(issued);
    mocks.upload.mockResolvedValue({ ...issued, status: "signed-copy-received", statusLabel: "Signed Copy Received", signedCopyMatchesCurrentTerms: true,
      signedCopies: [{ id: "copy", issuedDocumentId: "issue-1", issueNumber: 1, agreementVersion: 1, originalFileName: "signed.pdf",
        contentType: "application/pdf", fileSize: 2048, sha256: "B".repeat(64), partnerSignatoryName: "Synthetic Signatory",
        partnerSignatoryDesignation: "Director", partnerSignedOn: "2026-10-18", companySignatoryName: null, companySignatoryDesignation: null,
        companySignedOn: null, notes: null, uploadedAt: "2026-10-18T03:00:00Z", uploadedByName: "Synthetic Admin", matchesCurrentTerms: true }] });
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Upload signed copy" }));
    const dialog = await screen.findByRole("dialog", { name: "Upload signed copy" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record signed copy" }));
    expect(within(dialog).getByText("Choose the signed agreement file.")).toBeTruthy();
    expect(within(dialog).getByText("Enter who signed for the partner.")).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();

    const file = new File(["%PDF-1.4 synthetic"], "signed.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText(/Signed agreement file/), { target: { files: [file] } });
    fireEvent.change(within(dialog).getByLabelText(/Signed for the partner by/), { target: { value: "Synthetic Signatory" } });
    fireEvent.change(within(dialog).getByLabelText(/Date the partner signed/), { target: { value: "2026-10-18" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record signed copy" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [id, input] = mocks.upload.mock.calls[0];
    expect(id).toBe("agreement");
    expect(input).toMatchObject({ issuedDocumentId: "issue-1", fileName: "signed.pdf", contentType: "application/pdf",
      partnerSignatoryName: "Synthetic Signatory", partnerSignedOn: "2026-10-18", companySignatoryName: null });
    expect(atob(input.contentBase64)).toBe("%PDF-1.4 synthetic");
    expect(await screen.findByText("Signed Copy Received")).toBeTruthy();
    expect(screen.getByText(/recording the copy does not approve the agreement/)).toBeTruthy();
    expect(screen.getByText(/Signed by Synthetic Signatory \(Director\)/)).toBeTruthy();
  });

  it("shows status to viewers but keeps files and actions to agreement staff", async () => {
    mocks.summary.mockResolvedValue(issued);
    render(<Harness can={viewOnly} />);
    expect(await screen.findByText("Issued for Signature")).toBeTruthy();
    for (const name of ["Download PDF", "Print", "Share", "Preview PDF", "Upload signed copy", "Issue for signature"])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.getByText(/needs permission to manage or approve agreements/)).toBeTruthy();
  });

  it("sends signed terms to a new version instead of editing them", async () => {
    mocks.summary.mockResolvedValue({ ...issued, status: "signed-copy-received", statusLabel: "Signed Copy Received", signedCopyMatchesCurrentTerms: true,
      signedCopies: [{ id: "copy", issuedDocumentId: "issue-1", issueNumber: 1, agreementVersion: 1, originalFileName: "signed.pdf",
        contentType: "application/pdf", fileSize: 2048, sha256: "B".repeat(64), partnerSignatoryName: "Synthetic Signatory",
        partnerSignatoryDesignation: null, partnerSignedOn: "2026-10-18", companySignatoryName: null, companySignatoryDesignation: null,
        companySignedOn: null, notes: null, uploadedAt: "2026-10-18T03:00:00Z", uploadedByName: null, matchesCurrentTerms: true }] });
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Create new version" }));
    expect(openWizard).toHaveBeenCalledWith({ mode: "revision", agreement });
    expect(screen.getByText(/Record the signed agreement reference in the draft/)).toBeTruthy();
  });
});
