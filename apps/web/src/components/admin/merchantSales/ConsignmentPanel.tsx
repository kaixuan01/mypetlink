"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminOperationNotice } from "@/components/admin/AdminPanels";
import { adminCapabilities as caps, hasCapability } from "@/lib/adminCapabilities";
import { isSellableTagCapability } from "@/lib/tagCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import { listMerchants, type AdminMerchant } from "@/services/adminMerchantSalesService";
import { listAdminTagCatalogOptions, type AdminCatalogOptionProduct } from "@/services/tagCatalogService";
import * as api from "@/services/adminConsignmentService";
import { ApiClientError } from "@/services/apiClient";
import { primaryButton, secondaryButton } from "./shared";
import { AgreementsView } from "./consignment/AgreementsView";
import { AgreementWizard, type AgreementRequest } from "./consignment/AgreementWizard";
import { ConsignmentOverview } from "./consignment/ConsignmentOverview";
import { CustodyView } from "./consignment/CustodyView";
import { ReconciliationView } from "./consignment/ReconciliationView";
import { ReserveStockDialog } from "./consignment/ReserveStockDialog";
import { SettingsView } from "./consignment/SettingsView";
import { SalesReportsView } from "./consignment/SalesReportsView";
import { SettlementsView } from "./consignment/SettlementsView";
import { SalesReportWizard, type SalesReportRequest } from "./consignment/SalesReportWizard";
import { AgreementTermsSummary } from "./consignment/AgreementTermsSummary";
import {
  consignmentViews,
  errorMessage,
  percentLabel,
  SUMMARY_PAGE_SIZE,
  summarise,
  type ConsignmentView,
} from "./consignment/model";
import { Callout } from "./consignment/ui";
import { useConsignmentActions } from "./consignment/useConsignmentActions";
import { useConsignmentLocation } from "./consignment/useConsignmentLocation";
import type { ConsignmentContext, ConsignmentPermissions, PositionsStatus, SkuOption } from "./consignment/context";

type Page<T> = { items: T[]; total: number };

/**
 * Consignment: partner agreements, stock held by partners, and reconciliation
 * with the agreed external tracker. Each part has its own view so an operator
 * only sees the actions that apply to the record in front of them. The server
 * still validates every rule; this workspace only arranges the work.
 */
export function ConsignmentPanel() {
  const access = getAdminCapabilities();
  const can = (key: Parameters<typeof hasCapability>[1]) => hasCapability(access, key);
  const permissions: ConsignmentPermissions = {
    manage: can(caps.consignmentAgreementsManage),
    approve: can(caps.consignmentAgreementsApprove),
    allocate: can(caps.consignmentAllocate),
    dispatch: can(caps.consignmentDispatch),
    reconcile: can(caps.consignmentReconcile),
    returns: can(caps.consignmentReturn),
    release: can(caps.consignmentRelease),
    writeOff: can(caps.consignmentWriteOff),
    exportRecords: can(caps.consignmentManifestExport),
    managePolicy: can(caps.consignmentPolicyManage),
    managePrices: can(caps.consignmentPriceTermsManage),
    recordSales: can(caps.consignmentSalesReportsRecord),
    verifySales: can(caps.consignmentSalesReportsVerify),
    recordStocktake: can(caps.consignmentStocktakeRecord),
    closePeriods: can(caps.consignmentPeriodsClose),
    resolveDiscrepancies: can(caps.consignmentDiscrepanciesResolve),
  };
  const canListMerchants = permissions.manage || can(caps.salesView);
  // Settlements carry partner money and sales earnings, so they need their own permission.
  const canViewSettlements = can(caps.consignmentSettlementsView);
  const location = useConsignmentLocation();

  const [policy, setPolicy] = useState<api.ApprovalPolicy | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [agreements, setAgreements] = useState<Page<api.Agreement> | null>(null);
  const [dispatches, setDispatches] = useState<Page<api.ConsignmentDispatch> | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [catalog, setCatalog] = useState<AdminCatalogOptionProduct[]>([]);
  const [wizard, setWizard] = useState<AgreementRequest | null>(null);
  const [reserveFor, setReserveFor] = useState<{ agreementId: string | null } | null>(null);
  const [positions, setPositions] = useState<api.StockPosition[] | null>(null);
  const [positionsStatus, setPositionsStatus] = useState<PositionsStatus>({ state: "loading", loadedAt: null });
  const [positionsKey, setPositionsKey] = useState(0);
  const retryPositions = useCallback(() => {
    setPositionsStatus((s) => ({ ...s, state: "loading" }));
    setPositionsKey((key) => key + 1);
  }, []);
  const [salesReport, setSalesReport] = useState<SalesReportRequest | null>(null);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const { actions, dialog } = useConsignmentActions(reload);

  useEffect(() => {
    let active = true;
    api
      .getApprovalPolicy()
      .then((p) => {
        if (active) {
          setPolicy(p);
          setPolicyError("");
        }
      })
      .catch(() => {
        if (active) setPolicyError("The approval policy could not be loaded, so self-review is unavailable. Refresh to try again.");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // One summary page of each record type powers the overview, the attention
  // lists and the agreement picker. Totals are only shown when it is complete.
  useEffect(() => {
    let active = true;
    Promise.all([
      api.listAgreements(1, { pageSize: SUMMARY_PAGE_SIZE }),
      api.listDispatches(1, { pageSize: SUMMARY_PAGE_SIZE }),
    ])
      .then(([a, d]) => {
        if (!active) return;
        setAgreements(a);
        setDispatches(d);
        setLoadError("");
      })
      .catch((e) => {
        if (active) setLoadError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // SKU stock per partner branch, for the overview, sales reports and the report wizard.
  // A failed load keeps the last figures, labelled as stale; it never turns them into zero.
  useEffect(() => {
    let active = true;
    api
      .listStockPositions()
      .then((value) => {
        if (!active) return;
        setPositions(value);
        setPositionsStatus({ state: "loaded", loadedAt: new Date().toISOString() });
      })
      .catch((e) => {
        if (!active) return;
        const forbidden = e instanceof ApiClientError && e.status === 403;
        setPositionsStatus((s) => ({
          state: forbidden ? "forbidden" : "error",
          message: forbidden ? "You don’t have access to partner stock." : errorMessage(e),
          loadedAt: s.loadedAt,
        }));
      });
    return () => {
      active = false;
    };
  }, [reloadKey, positionsKey]);

  useEffect(() => {
    let active = true;
    if (canListMerchants) {
      listMerchants({ page: 1, pageSize: 100, isActive: true })
        .then((r) => {
          if (active) setMerchants(r.items);
        })
        .catch(() => {
          // The merchant filter and picker simply stay empty; the wizard explains.
        });
    }
    if (permissions.allocate || permissions.managePrices) {
      listAdminTagCatalogOptions()
        .then((r) => {
          if (active) setCatalog(r);
        })
        .catch((e) => {
          if (active) actions.setNotice({ tone: "error", title: errorMessage(e) });
        });
    }
    return () => {
      active = false;
    };
    // actions.setNotice is a stable state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canListMerchants, permissions.allocate, permissions.managePrices]);

  const summary = useMemo(() => summarise(agreements, dispatches), [agreements, dispatches]);
  const skus: SkuOption[] = useMemo(
    () =>
      catalog.flatMap((p) =>
        p.variants
          .filter((v) => v.isActive && isSellableTagCapability(v))
          .map((v) => ({ id: v.id, label: `${p.name} · ${v.sku} · ${v.displayName}` }))
      ),
    [catalog]
  );

  const approve = useCallback(
    (a: api.Agreement) =>
      actions.request({
        title: "Approve agreement?",
        message: `${a.reference} v${a.version} · ${a.merchantName} · ${percentLabel(a.partnerCommissionPercentage)} partner commission. Approval freezes these terms for this version. Independent review is required unless you explicitly self-review as the authorized Solo founder.`,
        details: (
          <div className="grid gap-3">
            <Callout tone="warning" title="Internal approval is not the partner’s signature">
              The signed agreement reference below is the evidence that the partner accepted these terms. Approve only if
              that signed agreement exists and matches this version.
            </Callout>
            <AgreementTermsSummary agreement={a} compact />
          </div>
        ),
        allowSelfReview: policy?.canSelfReview,
        confirmLabel: "Approve",
        run: async ({ selfReview }) => {
          await api.agreementAction(a, "approve", a.signedAgreementReference ?? "", selfReview);
          return `${a.reference} v${a.version} approved. You can now reserve stock for this partner.`;
        },
      }),
    [actions, policy?.canSelfReview]
  );

  const close = useCallback(
    (a: api.Agreement) =>
      actions.request({
        title: "Close agreement?",
        message: `${a.reference} v${a.version} · ${a.merchantName}. Every reservation, partner-held tag and returned unit must be reconciled before closure. A closed version cannot be reopened.`,
        destructive: true,
        confirmLabel: "Confirm closure",
        reason: { label: "Reason for closing", hint: "Kept in the agreement’s history. Exclude customer personal details." },
        run: async ({ reason }) => {
          await api.agreementAction(a, "close", reason);
          return `${a.reference} v${a.version} closed.`;
        },
      }),
    [actions]
  );

  const context: ConsignmentContext = {
    can: permissions,
    policy,
    actions,
    reloadKey,
    summary,
    agreements: agreements?.items ?? [],
    dispatches: dispatches?.items ?? [],
    positions,
    positionsStatus,
    retryPositions,
    merchants,
    skus,
    loading,
    navigate: location.navigate,
    openWizard: setWizard,
    openReserve: (agreementId) => setReserveFor({ agreementId }),
    approve,
    close,
    openSalesReport: setSalesReport,
  };

  const counts: Partial<Record<ConsignmentView, number | null>> = {
    agreements: summary.draftsReady,
    custody:
      summary.awaitingDispatch === null || summary.awaitingReceipt === null || summary.openDiscrepancies === null
        ? null
        : summary.awaitingDispatch + summary.awaitingReceipt + summary.openDiscrepancies,
    sales: positions && positionsStatus.state === "loaded"
      ? positions.reduce((n, p) => n + p.reportsAwaitingVerification + p.disputedReports, 0) : null,
    reconciliation: positions && positionsStatus.state === "loaded"
      ? positions.reduce((n, p) => n + (p.openDiscrepancies ?? 0) + (p.stocktakeInProgress ? 1 : 0), 0) : null,
  };

  return (
    <div className="grid gap-4" data-testid="consignment-workspace">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-950">Consignment</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Partner agreements, stock held by partners, verified partner sales and what each partner owes. Delivering stock
            only moves it into the partner&apos;s care. Verifying a sales report records what the partner owes for that period,
            and any sales commission waits as Pending. Partner payments are recorded separately; commission is ready to pay
            only once that period is paid in full. Nothing here creates an invoice or records money received on its own.
          </p>
        </div>
        {permissions.manage || permissions.allocate || permissions.recordSales ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {permissions.recordSales ? (
              <button className={secondaryButton} disabled={actions.busy} onClick={() => setSalesReport({ mode: "new" })} type="button">
                Record sales report
              </button>
            ) : null}
            {permissions.allocate ? (
              <button className={secondaryButton} disabled={actions.busy} onClick={() => setReserveFor({ agreementId: null })} type="button">
                Reserve stock
              </button>
            ) : null}
            {permissions.manage ? (
              <button className={primaryButton} disabled={actions.busy} onClick={() => setWizard({ mode: "new" })} type="button">
                New agreement
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <nav aria-label="Consignment sections" className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-1 rounded-xl bg-slate-100/80 p-1">
          {consignmentViews.filter((view) => view.id !== "settlements" || canViewSettlements).map((view) => {
            const current = location.view === view.id;
            const count = counts[view.id];
            return (
              <button
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-pet-teal ${
                  current ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
                }`}
                key={view.id}
                onClick={() => location.navigate({ view: view.id })}
                type="button"
              >
                {view.label}
                {count ? (
                  <span className="grid min-w-5 place-items-center rounded-full bg-[#fdf6e7] px-1.5 text-[0.7rem] font-black text-[#8a5a10]">
                    <span className="sr-only">, </span>
                    {count}
                    <span className="sr-only"> need attention</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {actions.notice ? (
        <AdminOperationNotice
          actionLabel={actions.notice.tone === "error" ? "Refresh records" : undefined}
          onAction={reload}
          onDismiss={() => actions.setNotice(null)}
          title={actions.notice.title}
          tone={actions.notice.tone}
        />
      ) : null}

      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-4" role="alert">
          <p className="text-sm font-bold text-[#a63c2e]">We couldn’t load consignment records. {loadError}</p>
          <button className={secondaryButton} disabled={actions.busy} onClick={reload} type="button">
            Refresh records
          </button>
        </div>
      ) : null}
      {policyError ? <Callout tone="warning">{policyError}</Callout> : null}

      {location.view === "overview" ? <ConsignmentOverview context={context} /> : null}
      {location.view === "agreements" ? <AgreementsView agreementId={location.agreementId} context={context} /> : null}
      {location.view === "custody" ? <CustodyView context={context} dispatchId={location.dispatchId} /> : null}
      {location.view === "sales" ? <SalesReportsView context={context} reportId={location.reportId} /> : null}
      {location.view === "settlements" && canViewSettlements ? <SettlementsView /> : null}
      {location.view === "reconciliation" ? <ReconciliationView context={context} stocktakeId={location.stocktakeId} /> : null}
      {location.view === "settings" ? <SettingsView context={context} onPolicyChange={setPolicy} /> : null}

      {wizard ? (
        <AgreementWizard
          canApprove={permissions.approve}
          merchants={merchants}
          onApprove={(saved) => {
            setWizard(null);
            approve(saved);
          }}
          onClose={() => setWizard(null)}
          onSaved={(saved, message) => {
            reload();
            actions.setNotice({ tone: "success", title: message });
            location.navigate({ agreement: saved.id, dispatch: null });
          }}
          request={wizard}
        />
      ) : null}

      {salesReport ? (
        <SalesReportWizard
          context={context}
          key={salesReport.mode === "edit" ? salesReport.report.id + salesReport.report.concurrencyToken : "new"}
          onClose={() => setSalesReport(null)}
          onSaved={(saved, message) => {
            setSalesReport(null);
            reload();
            actions.setNotice({ tone: "success", title: message });
            location.navigate({ report: saved.id });
          }}
          request={salesReport}
        />
      ) : null}

      <ReserveStockDialog
        actions={actions}
        agreements={agreements?.items ?? []}
        initialAgreementId={reserveFor?.agreementId ?? null}
        onClose={() => setReserveFor(null)}
        onReserved={(result) => {
          setReserveFor(null);
          location.navigate({ dispatch: result.id, agreement: null });
        }}
        open={reserveFor !== null}
        skus={skus}
      />

      {dialog}
    </div>
  );
}
