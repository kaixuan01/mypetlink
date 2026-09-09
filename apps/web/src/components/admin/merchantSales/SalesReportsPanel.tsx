"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes } from "@/lib/routes";
import { isAbortError } from "@/services/apiClient";
import { getMerchantSalesError, listSalespersons, type AdminSalesperson } from "@/services/adminMerchantSalesService";
import {
  downloadCommissionLedger,
  downloadResellerPortfolio,
  getCommissionFinancialReport,
  getSalesPerformanceReport,
  getSalespersonFinancialReport,
  getSalespersonPerformanceReport,
  listResellerPortfolio,
  listResellerPortfolioFinancial,
  type CommissionFinancialReport,
  type ResellerPortfolioFinancialItem,
  type ResellerPortfolioItem,
  type SalesPerformanceReport,
  type SalespersonFinancialReport,
  type SalespersonPerformanceReport,
} from "@/services/adminSalesReportingService";
import { dateTime, fieldClass, InlineError, money, secondaryButton } from "./shared";

const pageSize = 25;

export function SalesReportsPanel({ canViewFinancial }: { canViewFinancial: boolean }) {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getUTCFullYear()}-01-01`);
  const [through, setThrough] = useState(now.toISOString().slice(0, 10));
  const [channel, setChannel] = useState<"all" | "retail" | "merchant">("all");
  const [commissionType, setCommissionType] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [salespersons, setSalespersons] = useState<AdminSalesperson[]>([]);
  const [performance, setPerformance] = useState<SalesPerformanceReport | null>(null);
  const [financial, setFinancial] = useState<CommissionFinancialReport | null>(null);
  const [sellerPerformance, setSellerPerformance] = useState<SalespersonPerformanceReport | null>(null);
  const [sellerFinancial, setSellerFinancial] = useState<SalespersonFinancialReport | null>(null);
  const [portfolio, setPortfolio] = useState<ResellerPortfolioItem[]>([]);
  const [portfolioFinancial, setPortfolioFinancial] = useState<Record<string, ResellerPortfolioFinancialItem>>({});
  const [portfolioTotal, setPortfolioTotal] = useState(0);
  const [portfolioOwnerId, setPortfolioOwnerId] = useState("");
  const [portfolioPage, setPortfolioPage] = useState(1);
  const [relationshipState, setRelationshipState] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const reportParams = useMemo(() => ({
    from: utcStart(from),
    toExclusive: nextDay(through),
    salespersonId: salespersonId || undefined,
    channel,
    commissionType: canViewFinancial && commissionType ? commissionType : undefined,
  }), [canViewFinancial, channel, commissionType, from, salespersonId, through]);

  useEffect(() => {
    const controller = new AbortController();
    listSalespersons({ page: 1, pageSize: 100 }, controller.signal)
      .then((result) => setSalespersons(result.items))
      .catch((caught) => {
        if (!isAbortError(caught)) setError(getMerchantSalesError(caught, "We couldn’t load the seller list."));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requests: Promise<unknown>[] = [
      getSalesPerformanceReport(reportParams, controller.signal).then(setPerformance),
    ];
    if (canViewFinancial) requests.push(getCommissionFinancialReport(reportParams, controller.signal).then(setFinancial));
    if (salespersonId) {
      requests.push(getSalespersonPerformanceReport(salespersonId, reportParams, controller.signal).then(setSellerPerformance));
      const portfolioParams = { page: portfolioPage, pageSize, state: relationshipState || undefined };
      requests.push(listResellerPortfolio(salespersonId, portfolioParams, controller.signal).then((result) => {
        setPortfolio(result.items); setPortfolioTotal(result.total); setPortfolioOwnerId(salespersonId);
      }));
      if (canViewFinancial) {
        requests.push(getSalespersonFinancialReport(salespersonId, reportParams, controller.signal).then(setSellerFinancial));
        requests.push(listResellerPortfolioFinancial(salespersonId, portfolioParams, controller.signal).then((result) => {
          setPortfolioFinancial(Object.fromEntries(result.items.map((item) => [item.merchantId, item])));
        }));
      }
    }
    Promise.all(requests)
      .then(() => setError(""))
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) setError(getMerchantSalesError(caught, "We couldn’t load these sales reports."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canViewFinancial, portfolioPage, relationshipState, reportParams, salespersonId]);

  async function exportFile(kind: "ledger" | "portfolio") {
    setExporting(true); setError("");
    try {
      if (kind === "ledger") await downloadCommissionLedger({ ...reportParams, page: 1, pageSize: 100 });
      else if (salespersonId) await downloadResellerPortfolio(salespersonId, { state: relationshipState || undefined });
    } catch (caught) {
      setError(getMerchantSalesError(caught, "We couldn’t export this report."));
    } finally { setExporting(false); }
  }

  const visiblePortfolio = !loading && portfolioOwnerId === salespersonId ? portfolio : [];
  const visiblePortfolioTotal = !loading && portfolioOwnerId === salespersonId ? portfolioTotal : 0;

  return <div className="grid gap-4">
    <InlineError message={error} />
    <AdminSection title="Sales reports" description="Sales activity follows the date of the underlying payment. Commission earned, payout and reversal totals each follow their own accounting event date.">
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Filter label="From"><input className={fieldClass} type="date" value={from} onChange={(event) => { setLoading(true); setFrom(event.target.value); }} /></Filter>
        <Filter label="Through"><input className={fieldClass} type="date" value={through} onChange={(event) => { setLoading(true); setThrough(event.target.value); }} /></Filter>
        <Filter label="Channel"><select className={fieldClass} value={channel} onChange={(event) => { setLoading(true); setChannel(event.target.value as typeof channel); }}><option value="all">All channels</option><option value="retail">Direct retail</option><option value="merchant">Merchant</option></select></Filter>
        <Filter label="Seller"><select className={fieldClass} value={salespersonId} onChange={(event) => { setLoading(true); setSalespersonId(event.target.value); setPortfolioPage(1); }}><option value="">All sellers</option>{salespersons.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.salespersonCode}</option>)}</select></Filter>
        {canViewFinancial ? <Filter label="Commission type"><select className={fieldClass} value={commissionType} onChange={(event) => { setLoading(true); setCommissionType(event.target.value); }}><option value="">All types</option><option value="DirectRetailPercentage">Direct retail</option><option value="MerchantOrderPercentage">Legacy merchant</option><option value="ResellerAcquisitionBonus">Acquisition bonus</option><option value="ResellerRepeatPercentage">Repeat reseller</option></select></Filter> : null}
      </div>
      <p className="px-5 pb-5 text-xs font-semibold text-slate-500">UTC range: {reportParams.from} up to, but not including, {reportParams.toExclusive}{canViewFinancial ? ". Commission type filters financial figures only." : "."}</p>
    </AdminSection>

    {loading ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">Loading sales reports…</p> : null}
    {!loading && performance ? <>
      <AdminSection title="Sales performance" description="Attributed paid sales and reseller relationships. Shipping is excluded from revenue.">
        <MetricGrid>
          <Metric label="Attributed retail orders" value={performance.retail.attributedPaidOrders} />
          <Metric label="Retail units" value={performance.retail.unitsSold} />
          <Metric label="Attributed retail revenue" value={money("MYR", performance.retail.attributedRevenue)} />
          <Metric label="Commission-eligible orders" value={performance.retail.commissionEligibleOrders} />
          <Metric label="Commission-eligible units" value={performance.retail.commissionEligibleUnits} />
          <Metric label="Eligible direct revenue" value={money("MYR", performance.retail.commissionEligibleRevenue)} />
          <Metric label="Paid merchant orders" value={performance.merchant.paidOrders} />
          <Metric label="Net wholesale revenue" value={money("MYR", performance.merchant.netWholesaleRevenue)} />
          <Metric label="New reseller activations" value={performance.merchant.newResellerActivations} />
          <Metric label="Resellers acquired" value={performance.relationships.resellersAcquired} />
          <Metric label="Active repeat relationships" value={performance.relationships.active} />
          <Metric label="Ending soon" value={performance.relationships.endingSoon} />
          <Metric label="Expired" value={performance.relationships.expired} />
          <Metric label="Not activated" value={performance.relationships.notActivated} />
        </MetricGrid>
      </AdminSection>
      <AdminSection title="Seller rankings" description="Ranked independently by direct revenue, direct units and new reseller activations.">
        <div className="grid gap-5 p-5 lg:grid-cols-3">
          <Ranking title="Direct eligible revenue" rows={performance.directRevenueRanking} moneyValues />
          <Ranking title="Direct eligible units" rows={performance.directUnitsRanking} />
          <Ranking title="Reseller activations" rows={performance.resellerActivationRanking} />
        </div>
      </AdminSection>
    </> : null}

    {!loading && canViewFinancial && financial ? <AdminSection title="Commission accounting" description="Current status totals use commission earned during the range. Cash paid and reversals use the payout and reversal event dates, even when the current status later changed.">
      <MetricGrid>
        <Metric label="Gross generated" value={money(financial.accounting.currency, financial.accounting.grossGenerated)} />
        <Metric label="Current valid" value={money(financial.accounting.currency, financial.accounting.currentValid)} />
        <Metric label="Payable" value={money(financial.accounting.currency, financial.accounting.payable)} />
        <Metric label="Currently paid" value={money(financial.accounting.currency, financial.accounting.currentPaid)} />
        <Metric label="Reversed" value={money(financial.accounting.currency, financial.accounting.reversed)} />
        <Metric label="Cash paid in range" value={money(financial.accounting.currency, financial.accounting.cashPaidDuringPeriod)} />
        <Metric label="Reversals in range" value={money(financial.accounting.currency, financial.accounting.reversedDuringPeriod)} />
      </MetricGrid>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 p-5"><button className={secondaryButton} disabled={exporting} onClick={() => void exportFile("ledger")} type="button">Export commission ledger CSV</button></div>
      <div className="border-t border-slate-200 p-5"><Ranking title="Commission generated by seller" rows={financial.commissionGeneratedRanking} moneyValues /></div>
    </AdminSection> : null}

    {!loading && sellerPerformance?.salespersonId === salespersonId ? <AdminSection title={`${sellerPerformance.salespersonName} detail`} description="Attributed retail, reseller activations and repeat-order performance for the selected seller.">
      <MetricGrid>
        <Metric label="Attributed retail revenue" value={money("MYR", sellerPerformance.retail.attributedRevenue)} />
        <Metric label="Commission-eligible orders" value={sellerPerformance.retail.commissionEligibleOrders} />
        <Metric label="Commission-eligible units" value={sellerPerformance.retail.commissionEligibleUnits} />
        <Metric label="Eligible direct revenue" value={money("MYR", sellerPerformance.retail.commissionEligibleRevenue)} />
        <Metric label="Reseller activations" value={sellerPerformance.merchant.newResellerActivations} />
        <Metric label="Repeat paid orders" value={sellerPerformance.repeatPaidOrders} />
        <Metric label="Eligible repeat revenue" value={money("MYR", sellerPerformance.repeatEligibleRevenue)} />
        <Metric label="Lifetime wholesale revenue" value={money("MYR", sellerPerformance.lifetimeWholesaleRevenue)} />
        {canViewFinancial && sellerFinancial?.salespersonId === salespersonId ? <><Metric label="Direct commission generated" value={money(sellerFinancial.accounting.currency, sellerFinancial.directCommissionGenerated)} /><Metric label="Direct commission reversed" value={money(sellerFinancial.accounting.currency, sellerFinancial.directCommissionReversed)} /><Metric label="Acquisition bonuses" value={money(sellerFinancial.accounting.currency, sellerFinancial.acquisitionBonusGenerated)} /><Metric label="Repeat commission" value={money(sellerFinancial.accounting.currency, sellerFinancial.repeatCommissionGenerated)} /><Metric label="Currently payable" value={money(sellerFinancial.accounting.currency, sellerFinancial.accounting.payable)} /><Metric label="Currently paid" value={money(sellerFinancial.accounting.currency, sellerFinancial.accounting.currentPaid)} /><Metric label="Currently reversed" value={money(sellerFinancial.accounting.currency, sellerFinancial.accounting.reversed)} /><Metric label="Cash paid in range" value={money(sellerFinancial.accounting.currency, sellerFinancial.accounting.cashPaidDuringPeriod)} /></> : null}
      </MetricGrid>
    </AdminSection> : null}

    {salespersonId ? <AdminSection title="Reseller portfolio" description="Historical acquisition ownership is shown separately from the salesperson currently assigned to service the merchant. This portfolio uses current relationship state and lifetime totals, independently of the report date and channel filters.">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <Filter label="Relationship state"><select className={fieldClass} value={relationshipState} onChange={(event) => { setLoading(true); setRelationshipState(event.target.value); setPortfolioPage(1); }}><option value="">All states</option><option value="NotActivated">Not activated</option><option value="Active">Active</option><option value="EndingSoon">Ending soon</option><option value="Expired">Expired</option></select></Filter>
        {canViewFinancial ? <button className={secondaryButton} disabled={exporting} onClick={() => void exportFile("portfolio")} type="button">Export relationships CSV</button> : null}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Merchant</th><th className="px-4 py-3">Acquired / assigned</th><th className="px-4 py-3">Activation</th><th className="px-4 py-3">Repeat window</th><th className="px-4 py-3">Revenue</th>{canViewFinancial ? <th className="px-4 py-3">Commission</th> : null}</tr></thead><tbody className="divide-y divide-slate-100">{visiblePortfolio.map((item) => { const f = portfolioFinancial[item.merchantId]; return <tr key={item.merchantId}><td className="px-4 py-3"><p className="font-bold">{item.merchantName}</p><p className="font-mono text-xs">{item.merchantCode}</p><Badge tone="soft">{item.commissionPlan}</Badge></td><td className="px-4 py-3"><p>Acquired: {item.acquiredBySalespersonName ?? "Not attributed"}</p><p className="text-xs text-slate-500">Assigned: {item.assignedSalespersonName ?? "Unassigned"}</p></td><td className="px-4 py-3"><p>{item.activationOrderNumber ?? "Not activated"}</p><p className="text-xs text-slate-500">{dateTime(item.activationDate)}</p></td><td className="px-4 py-3"><Badge tone={item.relationshipState === "Expired" ? "danger" : item.relationshipState === "Active" ? "mint" : "soft"}>{relationshipLabel(item.relationshipState)}</Badge><p className="mt-1 text-xs">Ends {dateTime(item.repeatEligibleUntil)}</p></td><td className="px-4 py-3"><p>{money("MYR", item.lifetimeWholesaleRevenue)} lifetime</p><p className="text-xs text-slate-500">{money("MYR", item.repeatEligibleRevenue)} repeat eligible</p></td>{canViewFinancial ? <td className="px-4 py-3"><p>{f?.repeatCommissionPercentage ?? 0}% repeat</p><p className="text-xs">{money(f?.currency ?? "MYR", f?.acquisitionBonusGenerated ?? 0)} bonus</p><p className="text-xs">{money(f?.currency ?? "MYR", f?.repeatCommissionGenerated ?? 0)} repeat</p></td> : null}</tr>; })}</tbody></table>{!loading && !visiblePortfolio.length ? <p className="p-5 text-sm font-semibold text-slate-500">No reseller relationships match these filters.</p> : null}</div>
      <div className="flex justify-between border-t border-slate-200 p-4 text-sm font-semibold"><span>{visiblePortfolioTotal} relationships</span><div className="flex gap-2"><button className={secondaryButton} disabled={portfolioPage === 1 || loading} onClick={() => { setLoading(true); setPortfolioPage((p) => p - 1); }} type="button">Previous</button><button className={secondaryButton} disabled={loading || portfolioPage * pageSize >= visiblePortfolioTotal} onClick={() => { setLoading(true); setPortfolioPage((p) => p + 1); }} type="button">Next</button></div></div>
    </AdminSection> : null}

    <p className="text-sm font-semibold text-slate-600">For shipment-time COGS and contribution profit, use <Link className="font-black text-pet-teal underline" href={adminRoutes.tagInventory}>Tag Inventory profitability</Link>.</p>
  </div>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid min-w-40 gap-1 text-sm font-bold">{label}{children}</label>; }
function MetricGrid({ children }: { children: React.ReactNode }) { return <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{children}</div>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div>; }
function Ranking({ title, rows, moneyValues = false }: { title: string; rows: SalesPerformanceReport["directRevenueRanking"]; moneyValues?: boolean }) { return <div><h3 className="font-black">{title}</h3><ol className="mt-2 grid gap-2">{rows.map((item, index) => <li className="flex justify-between rounded-lg bg-slate-50 px-3 py-2" key={item.salespersonId}><span>{index + 1}. {item.salespersonName}</span><strong>{moneyValues ? money("MYR", item.value) : item.value}</strong></li>)}</ol>{rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">No activity in this range.</p> : null}</div>; }
function nextDay(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
function utcStart(value: string) { return value ? `${value}T00:00:00Z` : ""; }
function relationshipLabel(value: ResellerPortfolioItem["relationshipState"]) { return value === "NotActivated" ? "Not activated" : value === "EndingSoon" ? "Ending soon" : value; }
