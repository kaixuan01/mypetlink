// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPhysicalQaPanel } from "./AdminPhysicalQaPanel";
import type { QaItem, QaPreview } from "@/services/physicalQaService";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), capture: vi.fn(), save: vi.fn(), list: vi.fn(), summary: vi.fn(), history: vi.fn(), preview: vi.fn(), enroll: vi.fn() }));
vi.mock("@/services/adminService", () => ({ canUseAdminApi: () => true }));
vi.mock("@/services/physicalQaService", () => ({ physicalQaService: mocks }));
const A = "MPL-ABCD-2345";
const B = "MPL-EFGH-6789";
const qrUrl = (code: string) => `https://mypetlink.example/q/${code}`;
const itemFor = (code: string): QaItem => ({
  id: `tag-${code}`, tagCode: code, sku: "STANDARD", batch: "B1", shipment: "S1", qaStatus: "Pending", version: 1,
  expectedQrUrl: qrUrl(code), expectedNfcUrl: `https://mypetlink.example/n/${code}`,
  qrUrl: null, nfcUrl: null, qrVerifiedAt: null, nfcVerifiedAt: null, nfcSource: null, nfcSerialNumber: null,
  physicalCondition: "Unchecked", remarks: null, inspectedAt: null, inspectedBy: null, canInspect: true,
});
class Reader {
  static instance: Reader;
  onreading: ((event: unknown) => void) | null = null; onreadingerror = null;
  constructor() { Reader.instance = this; }
  async scan() {}
}
let frame = "";
function installReaders() {
  Object.defineProperty(window, "NDEFReader", { configurable: true, value: Reader });
  Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: class { async detect() { return frame ? [{ rawValue: frame }] : []; } } });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
}
const nfcRead = (records: unknown[], serialNumber = "04:AA:BB") => act(async () => { Reader.instance.onreading!({ message: { records }, serialNumber }); });
const urlRecord = (url: string) => ({ recordType: "url", data: new DataView(new TextEncoder().encode(url).buffer) });

beforeEach(() => {
  vi.clearAllMocks(); frame = "";
  mocks.lookup.mockImplementation(async (code: string) => itemFor(code));
  mocks.save.mockImplementation(async (item: QaItem) => item);
  mocks.list.mockResolvedValue({ items: [], total: 0 });
  mocks.history.mockResolvedValue([{ id: "h1", action: "tag-inventory.qa-inspected", createdAt: "2026-10-08T00:00:00Z", adminName: "QA Operator", result: JSON.stringify({ status: "Failed", condition: "Damaged", qaRemarks: "Cracked" }) }]);
  mocks.summary.mockResolvedValue({ totalExpected: 900, passed: 0, failed: 0, needsReview: 0, pending: 900, inspected: 0 });
  mocks.capture.mockImplementation(async (_item: QaItem, source: string, _url: string, serial?: string) => ({ evidence: source + "-receipt", observedCode: null, matches: true, problem: null, chipId: source === "WebNfc" && serial ? serial.replace(/:/g, "").toUpperCase() : null }));
  Object.defineProperty(window, "NDEFReader", { configurable: true, value: undefined });
  Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: undefined });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("mobile physical QA", () => {
  it("manual lookup never verifies QR or NFC, and there is no external reader workflow", async () => {
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    fireEvent.change(screen.getByLabelText("Printed tag code"), { target: { value: A } });
    fireEvent.click(screen.getByText("Find tag"));
    await screen.findByText("NFC: Awaiting chip read");
    fireEvent.change(screen.getByLabelText("Physical condition"), { target: { value: "Good" } });
    expect((screen.getByText("Good condition: pass and next") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(screen.queryByText(/external NFC reader/i)).toBeNull();
    expect(screen.queryByText(/sign-in code/i)).toBeNull();
    expect((screen.getByText("Enable NFC reader") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/can't read NFC chips/)).toBeTruthy();
  });

  it("passes a package from real reader events, then ignores its QR until a different package is shown", async () => {
    installReaders();
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    frame = qrUrl(A);
    fireEvent.click(screen.getByText("Start QR camera")); await screen.findByText("QR: Verified");
    await waitFor(() => expect((screen.getByText("Enable NFC reader") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Enable NFC reader")); await screen.findByText("Stop NFC reader");
    await nfcRead([urlRecord(`https://mypetlink.example/n/${A}`)]);
    await screen.findByText("NFC: Verified · chip 04AABB");
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ tagCode: A }), "WebNfc", `https://mypetlink.example/n/${A}`, "04:AA:BB");
    fireEvent.click(screen.getByText("Good condition: pass and next"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ tagCode: A }), expect.objectContaining({ qrEvidence: "Camera-receipt", nfcEvidence: "WebNfc-receipt", decision: "Passed", physicalCondition: "Good" })));
    await screen.findByText("Ready for the next package. Scan its QR or find its printed code.");

    // The saved package drifts out of view and back: it must not reopen itself.
    frame = ""; await new Promise(resolve => setTimeout(resolve, 1300));
    frame = qrUrl(A);
    await screen.findByText(new RegExp(`${A} was just finished`), undefined, { timeout: 3000 });
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ready for the next package. Scan its QR or find its printed code.")).toBeTruthy();

    // The next package is picked up straight away.
    frame = qrUrl(B);
    await screen.findByText(`${B} · STANDARD`, undefined, { timeout: 3000 });
    expect(mocks.lookup).toHaveBeenLastCalledWith(B);
  });

  it("never offers a pass when the phone reports no chip ID", async () => {
    installReaders();
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    frame = qrUrl(A);
    fireEvent.click(screen.getByText("Start QR camera")); await screen.findByText("QR: Verified");
    await waitFor(() => expect((screen.getByText("Enable NFC reader") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Enable NFC reader")); await screen.findByText("Stop NFC reader");
    await act(async () => { Reader.instance.onreading!({ message: { records: [urlRecord(`https://mypetlink.example/n/${A}`)] } }); });
    await screen.findByText(/the phone reported no chip ID. This package can't pass/);
    fireEvent.change(screen.getByLabelText("Physical condition"), { target: { value: "Good" } });
    expect((screen.getByText("Good condition: pass and next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Decision"), { target: { value: "NeedsReview" } });
    fireEvent.change(screen.getByLabelText("Remarks"), { target: { value: "No chip ID reported" } });
    expect((screen.getByText("Save and scan next tag") as HTMLButtonElement).disabled).toBe(false);
  });

  it("asks before switching when another package's QR appears and records nothing meanwhile", async () => {
    installReaders();
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    fireEvent.change(screen.getByLabelText("Printed tag code"), { target: { value: A } });
    fireEvent.click(screen.getByText("Find tag"));
    await screen.findByText(`${A} · STANDARD`);
    frame = qrUrl(B);
    fireEvent.click(screen.getByText("Start QR camera"));
    await screen.findByText(`This QR belongs to ${B}, but ${A} is open. Nothing has been recorded.`, undefined, { timeout: 3000 });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect((screen.getByText("Good condition: pass and next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText(`Open ${B}`));
    await screen.findByText(`${B} · STANDARD`);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ tagCode: B }), "Camera", qrUrl(B)));
    expect(mocks.capture).not.toHaveBeenCalledWith(expect.objectContaining({ tagCode: A }), expect.anything(), expect.anything());
  });

  it("can deliberately record a mismatched QR against the open package", async () => {
    installReaders();
    mocks.capture.mockResolvedValue({ evidence: "receipt", observedCode: B, matches: false, problem: `The QR code belongs to ${B}, but this package is ${A}.` });
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    fireEvent.change(screen.getByLabelText("Printed tag code"), { target: { value: A } });
    fireEvent.click(screen.getByText("Find tag"));
    await screen.findByText(`${A} · STANDARD`);
    frame = qrUrl(B);
    fireEvent.click(screen.getByText("Start QR camera"));
    fireEvent.click(await screen.findByText(`Record as ${A}'s QR`, undefined, { timeout: 3000 }));
    await screen.findByText(`QR: The QR code belongs to ${B}, but this package is ${A}.`);
    expect((screen.getByText("Good condition: pass and next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains NFC reads without an open package and names unsupported chip encodings", async () => {
    installReaders();
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    await waitFor(() => expect((screen.getByText("Enable NFC reader") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Enable NFC reader")); await screen.findByText("Stop NFC reader");
    await nfcRead([urlRecord(`https://mypetlink.example/n/${A}`)]);
    expect(screen.getByText("Scan the package's QR code first, then hold the same package to the phone.")).toBeTruthy();
    expect(mocks.capture).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Printed tag code"), { target: { value: A } });
    fireEvent.click(screen.getByText("Find tag"));
    await screen.findByText(`${A} · STANDARD`);
    await nfcRead([{ recordType: "absolute-url", data: new DataView(new ArrayBuffer(1)) }]);
    await screen.findByText(/stores an absolute address \(URI\) record instead of a standard web link/);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("shows the full manifest reconciliation and requires acknowledging existing orders", async () => {
    const preview: QaPreview = {
      expectedCount: 3, manifestEntries: 3, uniqueCodes: 3, found: 3, eligible: 3, alreadyEnrolled: 0, outstandingRetailReservations: 2,
      duplicateCodes: [], invalidCodes: [], missingCodes: [],
      batches: [{ batchNo: "B-2610", inManifest: 3, batchTotal: 5, notInManifest: 2, notInManifestCodes: ["MPL-AAAA-AAAD", "MPL-AAAA-AAAE"] }],
      skus: [{ sku: "SMART-STD", productName: "Smart Tag", variantName: "Standard", tagVariant: "Standard", count: 3 }],
      commitments: [{ tagCode: A, kind: "RetailOrder", reference: "MPL-ORD-1", status: "PreparingTag" }],
      problems: [], requiresAcknowledgement: true, listsTruncated: false,
    };
    mocks.preview.mockResolvedValue(preview);
    mocks.enroll.mockResolvedValue({ ...preview, alreadyEnrolled: 3 });
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    fireEvent.change(screen.getByLabelText("Shipment reference"), { target: { value: "SHIP-900" } });
    fireEvent.change(screen.getByLabelText("Expected packages"), { target: { value: "3" } });
    const file = new File([`Tag Code,QR\n${A},x\n${B},y\nMPL-AAAA-AAAC,z`], "manifest.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/Manufacturer manifest/), { target: { files: [file] } });
    fireEvent.click(await screen.findByText("Review 3 manifest codes"));
    await screen.findByText(/SMART-STD · Smart Tag · Standard \(Standard\): 3/);
    expect(screen.getByText(/B-2610: 3 in this manifest of 5 in the batch/)).toBeTruthy();
    expect(screen.getByText(`${A} · Customer order MPL-ORD-1 · PreparingTag`)).toBeTruthy();
    expect(screen.getByText(/does not prove that every package is unique/)).toBeTruthy();
    const enroll = screen.getByText("Enroll existing tags for QA") as HTMLButtonElement;
    expect(enroll.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(enroll.disabled).toBe(false);
    fireEvent.click(enroll);
    await waitFor(() => expect(mocks.enroll).toHaveBeenCalledWith(expect.objectContaining({ shipmentReference: "SHIP-900", expectedCount: 3, acknowledgeCommitments: true, tagCodes: [A, B, "MPL-AAAA-AAAC"] })));
    await screen.findByText(/Shipment enrolled: 3 tags are held for inspection/);
  });

  it("explains how to use the Excel workbook instead of guessing at it", async () => {
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    const file = new File(["PK"], "Tag Production.xlsx");
    fireEvent.change(screen.getByLabelText(/Manufacturer manifest/), { target: { files: [file] } });
    await screen.findByText(/Excel workbooks can't be read here/);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("shows an inspection history once", async () => {
    render(<AdminPhysicalQaPanel canManage canExport={false} />);
    fireEvent.change(screen.getByLabelText("Printed tag code"), { target: { value: A } });
    fireEvent.click(screen.getByText("Find tag"));
    await screen.findByText(`${A} · STANDARD`);
    fireEvent.click(screen.getByText("View history"));
    await screen.findByText("Failed · Condition: Damaged · Cracked");
    expect(screen.getAllByText("Failed · Condition: Damaged · Cracked")).toHaveLength(1);
  });
});
