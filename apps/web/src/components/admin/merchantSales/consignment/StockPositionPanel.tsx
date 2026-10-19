"use client";

import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminEmptyPanel, AdminStatusBadge } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";
import { dateTime, secondaryButton, shortDate } from "../shared";
import type { ConsignmentContext } from "./context";
import { Callout } from "./ui";

/**
 * SKU stock per partner branch. "On the shelf" is what a count can confirm;
 * "left the shelf" is what the partner is still accountable for while the
 * individual Tag Codes are unknown. The tie-out proves the two add up to the
 * tagged units still in the partner's custody.
 */
export function StockPositionPanel({ context, merchantId }: { context: ConsignmentContext; merchantId?: string }) {
  const positions = (context.positions ?? []).filter((p) => !merchantId || p.merchantId === merchantId);
  const status = context.positionsStatus;
  const failed = status.state === "error" || status.state === "forbidden";
  const retry = (
    <button className={`${secondaryButton} mt-2`} onClick={context.retryPositions} type="button">
      Try again
    </button>
  );

  // Never-loaded stock is unknown, not empty: say so instead of showing zero.
  if (context.positions === null) {
    return (
      <AdminSection compact title="Partner stock">
        <div className="p-4">
          {failed ? (
            <Callout role="alert" title="Partner stock couldn’t be loaded" tone="critical">
              <span className="block">{status.message}</span>
              {status.state === "error" ? retry : null}
            </Callout>
          ) : (
            <p className="text-sm font-semibold text-slate-500" role="status">
              Loading partner stock…
            </p>
          )}
        </div>
      </AdminSection>
    );
  }

  // Figures from an earlier load stay visible, clearly labelled, while a refresh fails or runs.
  const staleNotice = failed ? (
    <Callout role="alert" title="These figures may be out of date" tone="warning">
      <span className="block">
        Partner stock couldn’t be refreshed{status.loadedAt ? `; showing figures from ${dateTime(status.loadedAt)}` : ""}.{" "}
        {status.message}
      </span>
      {status.state === "error" ? retry : null}
    </Callout>
  ) : null;

  if (positions.length === 0) {
    if (staleNotice) return staleNotice;
    return (
      <AdminSection compact title="Partner stock">
        <AdminEmptyPanel
          compact
          description="Stock appears here once a delivery has been received by a partner."
          icon="tag"
          title="No partner stock yet"
        />
      </AdminSection>
    );
  }

  return (
    <div className="grid gap-4">
      {staleNotice}
      {positions.map((position) => (
        <BranchPosition context={context} key={position.merchantBranchId} position={position} />
      ))}
    </div>
  );
}

function BranchPosition({ context, position }: { context: ConsignmentContext; position: api.StockPosition }) {
  const untracked = position.skus.reduce((n, s) => n + s.untrackedUnits, 0);
  const unbalanced = position.skus.filter((s) => !s.tieOutBalanced);
  const activationGaps = position.skus.filter((s) => s.activatedInCustody > s.soldUnidentified);
  const total = (pick: (s: api.SkuPosition) => number) => position.skus.reduce((n, s) => n + pick(s), 0);

  const startTracking = () =>
    context.actions.request({
      title: "Bring this partner’s stock into tracking?",
      message: `${position.merchantName} · ${position.branchName}. Units the partner already received are counted onto the shelf, and earlier returns and handovers are taken off. Running this again changes nothing.`,
      reason: { label: "Reason", hint: "For example: deliveries received before sales reporting started.", minLength: 10 },
      confirmLabel: "Start tracking",
      run: async ({ reason }) => {
        await api.startStockTracking(position.merchantBranchId, reason);
        return `${position.branchName} stock is now tracked by SKU.`;
      },
    });

  return (
    <AdminSection
      action={
        position.lastVerifiedPeriodEnd ? (
          <span className="text-xs font-semibold text-slate-500">
            Sales verified to {shortDate(new Date(Date.parse(position.lastVerifiedPeriodEnd) - 1).toISOString())}
          </span>
        ) : undefined
      }
      compact
      description={`${position.branchName}${position.reportsAwaitingVerification ? ` · ${position.reportsAwaitingVerification} report${position.reportsAwaitingVerification === 1 ? "" : "s"} awaiting verification` : ""}`}
      title={position.merchantName}
    >
      <div className="grid gap-3 p-4 sm:p-5">
        {untracked > 0 ? (
          <Callout title={`${untracked} received ${untracked === 1 ? "unit isn’t" : "units aren’t"} in SKU stock yet`} tone="warning">
            <span className="block">They were received before sales reporting started, so sales can’t be verified against them.</span>
            {context.can.verifySales ? (
              <button className={`${secondaryButton} mt-2`} disabled={context.actions.busy} onClick={startTracking} type="button">
                Bring into stock tracking
              </button>
            ) : null}
          </Callout>
        ) : null}
        {unbalanced.length > 0 && untracked === 0 ? (
          <Callout role="alert" title="Stock doesn’t add up" tone="critical">
            {unbalanced.map((s) => s.sku).join(", ")}: the SKU stock no longer matches the tagged units in the partner’s custody.
            Review recent returns and handovers before verifying more reports.
          </Callout>
        ) : null}
        {activationGaps.map((s) => (
          <Callout key={s.productVariantId} tone="info">
            {s.sku}: customers activated {s.activatedInCustody} tags, but {s.soldUnidentified} sales are verified. Activation isn’t
            proof of sale — check for unreported sales.
          </Callout>
        ))}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">
              {position.merchantName} stock by SKU
            </caption>
            <thead className="border-b border-slate-200 text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">SKU</th>
                <th className="px-3 py-2 text-right">On the shelf</th>
                <th className="px-3 py-2 text-right">Provisional</th>
                <th className="px-3 py-2 text-right">Unsellable</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2 text-right">Investigating</th>
                <th className="px-3 py-2 text-right">Tagged units</th>
                <th className="py-2 pl-3">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {position.skus.map((s) => (
                <tr key={s.productVariantId}>
                  <td className="py-2.5 pr-3">
                    <span className="block font-black text-slate-900">{s.sku}</span>
                    <span className="block text-xs text-slate-500">{s.productName}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-base font-black text-slate-950">{s.sellable}</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.unverifiedSold || s.unverifiedRestockable ? (
                      <span title="Includes sales reported but not yet verified">{s.provisionalSellable}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">{s.unsellable || <span className="text-slate-300">0</span>}</td>
                  <td className="px-3 py-2.5 text-right">{s.soldUnidentified || <span className="text-slate-300">0</span>}</td>
                  <td className="px-3 py-2.5 text-right">{s.investigation || <span className="text-slate-300">0</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.custodyUnits}
                    {s.deliveryHolds ? <span className="block text-xs text-[#a63c2e]">+{s.deliveryHolds} on delivery hold</span> : null}
                  </td>
                  <td className="py-2.5 pl-3">
                    {s.untrackedUnits ? (
                      <AdminStatusBadge tone="warning">Not tracked</AdminStatusBadge>
                    ) : s.tieOutBalanced ? (
                      <AdminStatusBadge dot tone="positive">
                        Balanced
                      </AdminStatusBadge>
                    ) : (
                      <AdminStatusBadge dot tone="critical">
                        Mismatch
                      </AdminStatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {position.skus.length > 1 ? (
              <tfoot className="border-t border-slate-200 font-black text-slate-900">
                <tr>
                  <td className="py-2 pr-3">Total</td>
                  <td className="px-3 py-2 text-right">{total((s) => s.sellable)}</td>
                  <td className="px-3 py-2 text-right">{total((s) => s.provisionalSellable)}</td>
                  <td className="px-3 py-2 text-right">{total((s) => s.unsellable)}</td>
                  <td className="px-3 py-2 text-right">{total((s) => s.soldUnidentified)}</td>
                  <td className="px-3 py-2 text-right">{total((s) => s.investigation)}</td>
                  <td className="px-3 py-2 text-right">{total((s) => s.custodyUnits)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          On the shelf counts only verified reports. Provisional also subtracts sales recorded but not yet verified. Sold units stay
          the partner’s responsibility until their tags are identified — no Tag Code is ever marked sold from a report.
        </p>
      </div>
    </AdminSection>
  );
}
