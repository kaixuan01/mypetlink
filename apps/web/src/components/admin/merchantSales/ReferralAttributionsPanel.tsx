"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminDataTable, type AdminColumn } from "@/components/admin/table/AdminDataTable";
import { AdminSearchInput } from "@/components/admin/table/AdminSearchInput";
import { useAdminTableQuery } from "@/components/admin/table/useAdminTableQuery";
import { Badge } from "@/components/ui/Badge";
import { isAbortError } from "@/services/apiClient";
import {
  correctOwnerReferralAttribution,
  getMerchantSalesError,
  listOwnerReferralAttributions,
  listSalespersons,
  type AdminOwnerReferralAttribution,
  type AdminSalesperson,
} from "@/services/adminMerchantSalesService";
import {
  DetailGrid,
  DetailRow,
  InlineError,
  StatusMessage,
  fieldClass,
  primaryButton,
  secondaryButton,
  shortDate,
} from "./shared";

export function ReferralAttributionsPanel({ canManage = true }: { canManage?: boolean }) {
  const { query, actions } = useAdminTableQuery({ filterKeys: [] as const, defaultSortBy: "attributedAt" });
  const params = useMemo(() => ({ page: query.page, pageSize: query.pageSize, search: query.search || undefined }), [query.page, query.pageSize, query.search]);
  const key = JSON.stringify(params);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; items: AdminOwnerReferralAttribution[]; total: number; error: string }>();
  const [open, setOpen] = useState<AdminOwnerReferralAttribution | null>(null);
  const [salespersons, setSalespersons] = useState<AdminSalesperson[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${key}#${reload}`;
    listOwnerReferralAttributions(params, controller.signal)
      .then((result) => !controller.signal.aborted && setState({ key: requestKey, ...result, error: "" }))
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setState({ key: requestKey, items: [], total: 0, error: getMerchantSalesError(error, "We couldn’t load owner referrals.") });
        }
      });
    return () => controller.abort();
  }, [key, params, reload]);

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    listSalespersons({ page: 1, pageSize: 100, isActive: true }, controller.signal)
      .then((result) => setSalespersons(result.items.filter((item) => item.referralCode)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [canManage]);

  const requestKey = `${key}#${reload}`;
  const columns: AdminColumn<AdminOwnerReferralAttribution>[] = [
    { id: "owner", header: "Owner", cell: (row) => <div><p className="font-bold text-slate-900">{row.ownerName}</p><p className="text-xs text-slate-500">{row.ownerEmail}</p></div> },
    { id: "salesperson", header: "Salesperson", cell: (row) => <div><p className="font-bold">{row.salespersonName}</p><p className="font-mono text-xs">{row.salespersonCode} · {row.referralCode}</p></div> },
    { id: "source", header: "Source", cell: (row) => <Badge tone="soft">{row.attributionSource === "ReferralLink" ? "Referral link" : "Admin correction"}</Badge> },
    { id: "attributed", header: "Attributed", cell: (row) => shortDate(row.attributedAt) },
  ];

  return <div className="grid gap-4">
    {message ? <StatusMessage message={message} /> : null}
    <InlineError message={actionError} />
    {open ? <AdminSection
      action={<button className={secondaryButton} onClick={() => setOpen(null)} type="button">Close</button>}
      title={open.ownerName}
      description={open.ownerEmail}
    >
      <div className="grid gap-4 p-5">
        <DetailGrid>
          <DetailRow label="Salesperson">{open.salespersonName} ({open.salespersonCode})</DetailRow>
          <DetailRow label="Referral code">{open.referralCode}</DetailRow>
          <DetailRow label="Captured">{shortDate(open.capturedAt)}</DetailRow>
          <DetailRow label="Attributed">{shortDate(open.attributedAt)}</DetailRow>
          <DetailRow label="Source">{open.attributionSource === "ReferralLink" ? "Referral link" : "Admin correction"}</DetailRow>
        </DetailGrid>
        {canManage ? <div className="grid gap-2 sm:max-w-lg">
          <label className="text-sm font-bold" htmlFor="correct-referral-salesperson">Correct salesperson for future orders</label>
          <select id="correct-referral-salesperson" className={fieldClass} onChange={(event) => setSelected(event.target.value)} value={selected}>
            <option value="">Choose a salesperson</option>
            {salespersons.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.salespersonCode} · {item.referralCode})</option>)}
          </select>
          <p className="text-sm text-slate-500">This changes the owner’s attribution for future orders only. Existing order history is not changed.</p>
          <button className={`${primaryButton} w-fit`} disabled={!selected} onClick={() => {
            if (!selected) return;
            void correctOwnerReferralAttribution(open.userId, selected, open.concurrencyToken)
              .then((saved) => { setOpen(saved); setSelected(""); setActionError(""); setMessage("Owner referral attribution updated for future orders."); refresh(); })
              .catch((error) => setActionError(getMerchantSalesError(error, "We couldn’t update this attribution.")));
          }} type="button">Save correction</button>
        </div> : null}
      </div>
    </AdminSection> : null}
    <AdminSection title="Owner referrals" description="The salesperson credited when each referred owner account was created.">
      <div className="border-b border-slate-200 p-4"><AdminSearchInput onChange={actions.setSearch} placeholder="Search owner, salesperson or referral code…" value={query.search} /></div>
      <AdminDataTable columns={columns} emptyTitle="No owner referrals yet." emptyDescription="New attributed owners will appear here." error={state?.key === requestKey ? state.error || undefined : undefined} loading={state?.key !== requestKey} onPageChange={actions.setPage} onPageSizeChange={actions.setPageSize} onRetry={refresh} onRowOpen={setOpen} onSortChange={actions.setSort} page={query.page} pageSize={query.pageSize} rowKey={(row) => row.userId} rowOpenLabel="View" rows={state?.key === requestKey ? state.items : []} sortBy={query.sortBy} sortDir={query.sortDir} total={state?.key === requestKey ? state.total : 0} />
    </AdminSection>
  </div>;
}
