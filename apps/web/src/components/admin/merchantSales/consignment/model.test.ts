import { describe, expect, it } from "vitest";
import type { Agreement, ConsignmentDispatch, SalesReport, SalesReportInput } from "@/services/adminConsignmentService";
import {
  agreementNextStep,
  agreementStages,
  dateInputValue,
  dayAfterIso,
  dispatchNextStep,
  emptyAgreement,
  endOfDayIso,
  pendingTermsFor,
  startOfDayIso,
  summarise,
  validateAgreement,
  clampedSalesPeriod,
  refundOriginOptions,
  salesReportMatches,
  reportingWindow,
} from "./model";

const agreement: Agreement = {
  ...emptyAgreement,
  id: "a",
  merchantId: "m",
  merchantName: "Shop",
  reference: "R",
  version: 1,
  status: "Draft",
  partnerCommissionPercentage: 35,
  pendingTerms: ["Duration"],
  concurrencyToken: "t",
};
const dispatch = {
  id: "d",
  status: "Dispatched",
  hasOpenDiscrepancy: false,
  partnerHeld: 3,
  returnedQuarantine: 0,
  activatedWithoutExternalReference: 0,
  units: [],
} as unknown as ConsignmentDispatch;

describe("consignment next steps", () => {
  it("only calls a draft ready when the server lists nothing pending", () => {
    expect(agreementNextStep(agreement).label).toBe("Complete terms");
    expect(agreementNextStep({ ...agreement, pendingTerms: [] }).label).toBe("Ready for approval");
    expect(agreementNextStep({ ...agreement, status: "Active" }).label).toBe("Reserve stock");
    expect(agreementNextStep({ ...agreement, status: "Closed" }).label).toBe("No action needed");
  });

  it("puts an open discrepancy ahead of receipt and reconciliation", () => {
    expect(dispatchNextStep({ ...dispatch, status: "Reserved" }).label).toBe("Confirm dispatch");
    expect(dispatchNextStep(dispatch).label).toBe("Record partner receipt");
    expect(dispatchNextStep({ ...dispatch, hasOpenDiscrepancy: true }).label).toBe("Resolve discrepancy");
    expect(dispatchNextStep({ ...dispatch, status: "Received", activatedWithoutExternalReference: 2 }).label).toBe("Record customer handovers");
    expect(dispatchNextStep({ ...dispatch, status: "Received", partnerHeld: 0 }).label).toBe("Fully reconciled");
  });

  it("does not treat an internal approval as signed evidence", () => {
    const stages = agreementStages({ ...agreement, status: "Draft", pendingTerms: ["Signed agreement reference"] }, null);
    expect(stages.find((s) => s.id === "draft")?.state).toBe("done");
    expect(stages.find((s) => s.id === "signed")?.state).toBe("current");
    expect(stages.find((s) => s.id === "approval")?.state).toBe("upcoming");
  });
});

describe("consignment summary", () => {
  it("withholds totals when the loaded page does not cover every record", () => {
    const partial = summarise({ items: [agreement], total: 1 }, { items: [dispatch], total: 120 });
    expect(partial.draftsIncomplete).toBe(1);
    expect(partial.tagsWithPartners).toBeNull();
    expect(partial.awaitingReceipt).toBeNull();
    const complete = summarise({ items: [agreement], total: 1 }, { items: [dispatch, { ...dispatch, hasOpenDiscrepancy: true }], total: 2 });
    expect(complete.tagsWithPartners).toBe(6);
    expect(complete.awaitingReceipt).toBe(1);
    expect(complete.openDiscrepancies).toBe(1);
  });
});

describe("agreement form rules", () => {
  it("never assumes the proposed rate and mirrors the server's limits", () => {
    expect(emptyAgreement.partnerCommissionPercentage).toBeNull();
    const errors = validateAgreement({ ...emptyAgreement, reference: "x".repeat(101), partnerCommissionPercentage: 35.555, paymentDeadlineDays: 1.5 });
    expect(errors.merchantId).toBeTruthy();
    expect(errors.reference).toMatch(/100 characters/);
    expect(errors.partnerCommissionPercentage).toMatch(/two decimal/);
    expect(errors.paymentDeadlineDays).toMatch(/whole number/);
    expect(validateAgreement({ ...emptyAgreement, merchantId: "m", reference: "R", partnerCommissionPercentage: 35 })).toEqual({});
  });

  it("lists exactly the terms the server will still mark pending", () => {
    expect(pendingTermsFor(emptyAgreement)).toEqual([
      "Effective start",
      "Duration",
      "Settlement frequency",
      "Discount permissions",
      "Return terms",
      "Loss terms",
      "Signed agreement reference",
      "External tracker",
      "Payment deadline",
    ]);
  });

  it("covers whole local days for agreement and export dates", () => {
    const start = startOfDayIso("2026-10-18")!;
    const end = endOfDayIso("2026-10-18")!;
    expect(dateInputValue(start)).toBe("2026-10-18");
    expect(dateInputValue(end)).toBe("2026-10-18");
    expect(Date.parse(end)).toBeGreaterThan(Date.parse(start));
    expect(dateInputValue(dayAfterIso("2026-10-31"))).toBe("2026-11-01");
    expect(startOfDayIso("18/10/2026")).toBeNull();
  });
});

describe("half-month sales periods", () => {
  it("labels and keys periods in Malaysia time", async () => {
    const { salesPeriodLabel, salesPeriodKeyOf, salesPeriodStartIso, nextSalesPeriod, ringgit } = await import("./model");
    expect(salesPeriodLabel("2026-10-01T00:00:00+08:00", "2026-10-16T00:00:00+08:00")).toBe("1–15 Oct 2026");
    expect(salesPeriodLabel("2026-10-16T00:00:00+08:00", "2026-11-01T00:00:00+08:00")).toBe("16–31 Oct 2026");
    expect(salesPeriodLabel("2027-02-16T00:00:00+08:00", "2027-03-01T00:00:00+08:00")).toBe("16–28 Feb 2027");
    // Midnight in Malaysia is still the previous day in UTC.
    expect(salesPeriodKeyOf("2026-10-15T16:00:00Z")).toEqual({ month: "2026-10", half: 2 });
    expect(salesPeriodStartIso({ month: "2026-10", half: 2 })).toBe("2026-10-16T00:00:00+08:00");
    expect(nextSalesPeriod("2026-11-01T00:00:00+08:00")).toEqual({ month: "2026-11", half: 1 });
    expect(nextSalesPeriod(null, new Date("2026-10-20T02:00:00Z"))).toEqual({ month: "2026-10", half: 1 });
    expect(nextSalesPeriod(null, new Date("2026-10-05T02:00:00Z"))).toEqual({ month: "2026-09", half: 2 });
    expect(ringgit(269.5)).toBe("RM269.50");
  });
});

describe("report periods, refund origins and retries", () => {
  it("cuts a period where an agreement version starts or ends inside it", () => {
    const instants = (p: { start: string; end: string }) => [Date.parse(p.start), Date.parse(p.end)];
    const august = { month: "2026-08", half: 1 as const };
    expect(instants(clampedSalesPeriod(august))).toEqual([Date.parse("2026-08-01T00:00:00+08:00"), Date.parse("2026-08-16T00:00:00+08:00")]);
    expect(instants(clampedSalesPeriod(august, { effectiveFrom: "2026-08-10T00:00:00+08:00", effectiveTo: null })))
      .toEqual([Date.parse("2026-08-10T00:00:00+08:00"), Date.parse("2026-08-16T00:00:00+08:00")]);
    expect(instants(clampedSalesPeriod(august, { effectiveFrom: "2026-07-01T00:00:00+08:00", effectiveTo: "2026-08-10T00:00:00+08:00" })))
      .toEqual([Date.parse("2026-08-01T00:00:00+08:00"), Date.parse("2026-08-10T00:00:00+08:00")]);
    // Leap-year February: the second half ends on 1 March.
    expect(Date.parse(clampedSalesPeriod({ month: "2028-02", half: 2 }).end)).toBe(Date.parse("2028-03-01T00:00:00+08:00"));
    expect(Date.parse(clampedSalesPeriod({ month: "2028-02", half: 2 }).start)).toBe(Date.parse("2028-02-16T00:00:00+08:00"));
  });

  it("offers this period and earlier real report periods at the branch, newest first", () => {
    const base = { merchantBranchId: "b", status: "Verified", partnerReference: "R" } as SalesReport;
    const reports = [
      { ...base, periodStart: "2026-08-01T00:00:00+08:00", periodEndExclusive: "2026-08-10T00:00:00+08:00", partnerReference: "A" },
      { ...base, periodStart: "2026-08-10T00:00:00+08:00", periodEndExclusive: "2026-08-16T00:00:00+08:00", partnerReference: "B" },
      { ...base, periodStart: "2026-09-01T00:00:00+08:00", periodEndExclusive: "2026-09-16T00:00:00+08:00", partnerReference: "LATER" },
      { ...base, periodStart: "2026-07-16T00:00:00+08:00", periodEndExclusive: "2026-08-01T00:00:00+08:00", status: "Voided" as const },
      { ...base, periodStart: "2026-07-01T00:00:00+08:00", periodEndExclusive: "2026-07-16T00:00:00+08:00", merchantBranchId: "other" },
    ];
    const options = refundOriginOptions(reports, "b", { start: "2026-08-16T00:00:00+08:00", end: "2026-09-01T00:00:00+08:00" });
    expect(options.map((o) => o.label)).toEqual(["This report’s period (16–31 Aug 2026)", "10–15 Aug 2026 · B", "1–9 Aug 2026 · A"]);
    expect(options[1].end).toBe("2026-08-16T00:00:00+08:00");
  });

  it("matches a saved report only when every value is the same", () => {
    const input: SalesReportInput = { agreementId: "a", merchantBranchId: "b", periodMonth: "2026-08", half: 1, partnerReference: "ref-1",
      reportReceivedAt: "2026-08-17T01:00:00.000Z", evidenceLevel: "Summary", evidenceKind: "WhatsApp summary", evidenceReference: "WA 17 Aug",
      notes: null, lines: [
        { productVariantId: "v", lineType: "Sale", priceTermId: "t", unitNetPrice: 39.9, quantity: 3, notes: null },
        { productVariantId: "v", lineType: "Refund", priceTermId: "t", unitNetPrice: 39.9, quantity: 1, refundOfPeriodStart: "2026-08-01T00:00:00+08:00",
          restockableQuantity: 1, unsellableReturnedQuantity: 0, sealedReturnConfirmed: true, sealedReturnEvidence: "Seal photo" },
      ] };
    const line = { id: "l", sku: "S", productName: "P", priceTermName: "Standard price", priceTermKind: "Standard" as const, unitListPrice: 39.9,
      netValue: 0, promotionalDiscount: 0, refundOfPeriodStart: null, restockableQuantity: 0, unsellableReturnedQuantity: 0, notes: null,
      sealedReturnConfirmed: false, sealedReturnEvidence: null };
    const saved = { agreementId: "a", merchantBranchId: "b", periodStart: "2026-08-01T00:00:00+08:00", partnerReference: "REF-1",
      reportReceivedAt: "2026-08-17T09:00:00+08:00", evidenceLevel: "Summary", evidenceKind: "WhatsApp summary", evidenceReference: "WA 17 Aug", notes: null,
      lines: [
        { ...line, id: "r", productVariantId: "v", lineType: "Refund", priceTermId: "t", unitNetPrice: 39.9, quantity: 1,
          refundOfPeriodStart: "2026-07-31T16:00:00Z", restockableQuantity: 1, sealedReturnConfirmed: true, sealedReturnEvidence: "Seal photo" },
        { ...line, productVariantId: "v", lineType: "Sale", priceTermId: "t", unitNetPrice: 39.9, quantity: 3 },
      ] } as SalesReport;
    expect(salesReportMatches(saved, input)).toBe(true);
    expect(salesReportMatches(saved, { ...input, lines: [{ ...input.lines[0], quantity: 7 }, input.lines[1]] })).toBe(false);
    expect(salesReportMatches(saved, { ...input, lines: [input.lines[0]] })).toBe(false);
    expect(salesReportMatches(saved, { ...input, evidenceReference: "Other" })).toBe(false);
    expect(salesReportMatches(saved, { ...input, half: 2 })).toBe(false);
  });
});

describe("reporting windows across agreement versions", () => {
  const v1 = { id: "v1", merchantId: "m", reference: "R", version: 1, status: "Closed", effectiveFrom: "2026-08-01T00:00:00+08:00", effectiveTo: null };
  const v2 = { ...v1, id: "v2", version: 2, status: "Active", effectiveFrom: "2026-08-10T00:00:00+08:00" };
  it("ends an open-ended version where its approved successor starts", () => {
    expect(Date.parse(reportingWindow(v1, [v1, v2])!.effectiveTo!)).toBe(Date.parse("2026-08-10T00:00:00+08:00"));
  });
  it("keeps an earlier signed end, and ignores draft successors and other agreements", () => {
    const fixed = { ...v1, effectiveTo: "2026-08-05T00:00:00+08:00" };
    expect(Date.parse(reportingWindow(fixed, [fixed, v2])!.effectiveTo!)).toBe(Date.parse("2026-08-05T00:00:00+08:00"));
    expect(reportingWindow(v1, [v1, { ...v2, status: "Draft" }, { ...v2, reference: "OTHER" }])!.effectiveTo).toBeNull();
    expect(reportingWindow(v2, [v1, v2])!.effectiveTo).toBeNull();
  });
});

describe("stocktake count dates", () => {
  it("offers the 15th and month ends on or before today in Malaysia time, newest first", async () => {
    const { stocktakeCountDates } = await import("./model");
    expect(stocktakeCountDates(4, new Date("2026-10-19T03:00:00Z")).map((d) => d.value)).toEqual(["2026-10-15", "2026-09-30", "2026-09-15", "2026-08-31"]);
    // 31 Oct after 8 am in Malaysia is still 31 Oct; 29 Feb in a leap year is a month end.
    expect(stocktakeCountDates(1, new Date("2026-10-31T01:00:00Z"))[0].value).toBe("2026-10-31");
    expect(stocktakeCountDates(2, new Date("2028-03-02T00:00:00Z")).map((d) => d.value)).toEqual(["2028-02-29", "2028-02-15"]);
  });
});

describe("count preview", () => {
  it("matches the server's closing rule", async () => {
    const { previewCount } = await import("./model");
    const line = { bookSellable: 23, bookUnsellable: 0, openSurplusBefore: 0 } as Parameters<typeof previewCount>[0];
    expect(previewCount(line, 22, 1)).toBe("1 damaged");
    expect(previewCount(line, 21, 0)).toBe("2 missing");
    expect(previewCount(line, 25, 0)).toBe("2 extra");
    expect(previewCount({ ...line, openSurplusBefore: 2 }, 24, 0)).toBe("1 earlier extra not found");
    expect(previewCount({ ...line, bookUnsellable: 1 }, 23, 0)).toBe("1 unsellable missing");
    expect(previewCount(line, 23, 0)).toBe("Matches");
  });
});

describe("Count time and late-report links", () => {
  it("records the count time in Malaysia time and spots a count after the count date ended", async () => {
    const { countedAfterCutoff, malaysiaDateTime, malaysiaTimeLabel, malaysiaTimestamp } = await import("./model");
    expect(malaysiaTimestamp("2026-08-31", "21:40")).toBe("2026-08-31T21:40:00+08:00");
    expect(malaysiaTimestamp("2026-08-31", "")).toBe("");
    expect(malaysiaDateTime("2026-08-31T16:30:00Z")).toEqual({ date: "2026-09-01", time: "00:30" });
    expect(malaysiaTimeLabel("2026-09-01T01:05:00Z")).toBe("1 Sep 2026, 9:05 am");
    expect(malaysiaTimeLabel("2026-08-31T04:00:00Z")).toBe("31 Aug 2026, 12:00 pm");
    expect(countedAfterCutoff("2026-08-31", "2026-08-31")).toBe(false);
    expect(countedAfterCutoff("2026-08-31", "2026-09-01")).toBe(true);
    expect(countedAfterCutoff("2026-02-28", "2026-03-01")).toBe(true);
  });

  it("checks a reviewer's links the way the server will", async () => {
    const { lateLinkProblem } = await import("./model");
    const late = { closedByStocktakeId: "s", closedCountDate: "2026-08-31", closedCutoffAt: "2026-08-31T16:00:00Z",
      skus: [{ productVariantId: "v", sku: "SKU", lateShelfChange: -2, explainsKind: "Shortage" as const, capacity: 2, withdrawn: [],
        candidates: [
          { discrepancyId: "a", kind: "Shortage" as const, originStocktakeId: "s", originCountDate: "2026-08-31", originCutoffAt: "", quantity: 2, openQuantity: 2 },
          { discrepancyId: "b", kind: "Shortage" as const, originStocktakeId: "s", originCountDate: "2026-08-31", originCutoffAt: "", quantity: 1, openQuantity: 1 }] }] };
    const ok = { quantity: "1", evidence: "POS receipt", explanation: "Sold before the count" };
    expect(lateLinkProblem(late, {})).toBe("");
    expect(lateLinkProblem(late, { a: { ...ok, quantity: "0" } })).toBe("");
    expect(lateLinkProblem(late, { a: ok, b: ok })).toBe("");
    expect(lateLinkProblem(late, { a: { ...ok, quantity: "2" }, b: ok })).toBe("SKU: this report can explain at most 2.");
    expect(lateLinkProblem(late, { b: { ...ok, quantity: "2" } })).toBe("SKU: only 1 of that finding is open.");
    expect(lateLinkProblem(late, { a: { ...ok, evidence: "x" } })).toMatch(/record the evidence/);
    expect(lateLinkProblem(late, { a: { ...ok, explanation: "sold" } })).toMatch(/explain why/);
    expect(lateLinkProblem(late, { a: { ...ok, quantity: "1.5" } })).toMatch(/whole number/);
  });
});
