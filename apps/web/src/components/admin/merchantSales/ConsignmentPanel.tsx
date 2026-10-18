"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminCapabilities as caps, hasCapability } from "@/lib/adminCapabilities";
import { getAdminCapabilities } from "@/services/authService";
import { listMerchants, type AdminMerchant } from "@/services/adminMerchantSalesService";
import { listAdminTagCatalogOptions, type AdminCatalogOptionProduct } from "@/services/tagCatalogService";
import { isSellableTagCapability } from "@/lib/tagCapabilities";
import * as api from "@/services/adminConsignmentService";
import { dateTime } from "./shared";
import { getMerchantListing, type AdminBranch } from "@/services/merchantDirectoryService";
import { ConsignmentApprovalPolicy } from "./ConsignmentApprovalPolicy";
import { readStoredAuthSession } from "@/services/authStorage";

const button = "rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const empty: api.AgreementInput = { merchantId: "", reference: "", partnerCommissionPercentage: 35,
  effectiveFrom: null, effectiveTo: null, durationTerms: null, settlementFrequency: null,
  paymentDeadlineDays: null, discountTerms: null, returnTerms: null, lossTerms: null,
  signedAgreementReference: null, externalTrackerReference: null };
const terms = [ ["durationTerms", "Duration / end-date policy"], ["settlementFrequency", "Settlement frequency"],
  ["discountTerms", "Discount permissions"], ["returnTerms", "Return terms"], ["lossTerms", "Loss and damage terms"],
  ["signedAgreementReference", "Signed agreement reference"], ["externalTrackerReference", "External tracker reference"] ] as const;

type PendingAction={title:string;message:string;allowSelfReview?:boolean;run:(selfReview?:api.SelfReview)=>Promise<void|string>};

export function ConsignmentPanel() {
  const access = getAdminCapabilities();
  const can = (key: Parameters<typeof hasCapability>[1]) => hasCapability(access,key);
  const [policy,setPolicy]=useState<api.ApprovalPolicy|null>(null);
  const [policyError,setPolicyError]=useState("");
  const [selfConfirmed,setSelfConfirmed]=useState(false);
  const [selfReason,setSelfReason]=useState("");
  const [selfEvidence,setSelfEvidence]=useState("");
  const [agreements,setAgreements] = useState<api.Agreement[]>([]);
  const [dispatches,setDispatches] = useState<api.ConsignmentDispatch[]>([]);
  const [agreementPage,setAgreementPage] = useState(1);
  const [dispatchPage,setDispatchPage] = useState(1);
  const [agreementTotal,setAgreementTotal] = useState(0);
  const [dispatchTotal,setDispatchTotal] = useState(0);
  const [merchants,setMerchants] = useState<AdminMerchant[]>([]);
  const [catalog,setCatalog] = useState<AdminCatalogOptionProduct[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [editor,setEditor] = useState(false);
  const [editing,setEditing] = useState<api.Agreement | null>(null);
  const [form,setForm] = useState<api.AgreementInput>(empty);
  const [open,setOpen] = useState<api.ConsignmentDispatch | null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [reference,setReference] = useState("");
  const [agreementId,setAgreementId] = useState("");
  const [destination,setDestination] = useState("");
  const [branches,setBranches] = useState<AdminBranch[]>([]);
  const [branchId,setBranchId] = useState("");
  const [closeReason,setCloseReason] = useState("");
  const [receipt,setReceipt] = useState({recipient:"",receivedAt:"",quantity:0,damagedQuantity:0,missingQuantity:0,signedEvidenceReference:""});
  const [receivingChoices,setReceivingChoices] = useState<Record<string,string>>({});
  const [handover,setHandover] = useState({eventReference:"",eventAt:"",isReportedSale:false,sellingPrice:null as number|null,discountAmount:null as number|null,discountDescription:""});
  const [exportFrom,setExportFrom] = useState("");
  const [exportTo,setExportTo] = useState("");
  const [tracker,setTracker] = useState("");
  const [lines,setLines] = useState([{ productVariantId: "", quantity: 100 }]);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const [pending,setPendingState] = useState<PendingAction|null>(null);
  function setPending(next:PendingAction|null){setSelfConfirmed(false);setSelfReason("");setSelfEvidence("");setPendingState(next);}
  useEffect(()=>{let active=true;api.getApprovalPolicy().then(p=>{if(active){setPolicy(p);setPolicyError("");}}).catch(()=>{if(active)setPolicyError("Approval policy could not be loaded. Self-review is unavailable. Refresh to try again.");});return()=>{active=false;};},[]);
  const load = useCallback(async () => {
    const [a,d] = await Promise.all([api.listAgreements(agreementPage),api.listDispatches(dispatchPage)]);
    setAgreements(a.items); setAgreementTotal(a.total); setDispatches(d.items); setDispatchTotal(d.total);
  },[agreementPage,dispatchPage]);
  useEffect(() => {
    let active = true;
    Promise.all([api.listAgreements(agreementPage),api.listDispatches(dispatchPage)]).then(([a,d]) => {
      if (!active) return;
      setAgreements(a.items);setAgreementTotal(a.total);setDispatches(d.items);setDispatchTotal(d.total);setError("");
    }).catch(e => { if (active) setError(message(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[agreementPage,dispatchPage]);
  const canManage = can(caps.consignmentAgreementsManage);
  const canApprove = can(caps.consignmentAgreementsApprove);
  const canAllocate = can(caps.consignmentAllocate);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("dispatch");
    if (id) api.getDispatch(id).then(setOpen).catch(e => setError(message(e)));
  },[]);
  useEffect(() => {
    if (!open?.id) return;
    const url = new URL(window.location.href);url.searchParams.set("tab","consignment");url.searchParams.set("dispatch",open.id);
    window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  },[open?.id]);
  const selectedMerchant = agreements.find(a => a.id === agreementId)?.merchantId;
  useEffect(() => {
    let active=true;
    if(selectedMerchant && canAllocate) getMerchantListing(selectedMerchant).then(r=>{if(active)setBranches(r.branches.filter(b=>b.isActive));}).catch(e=>{if(active)setError(message(e));});
    return()=>{active=false;};
  },[selectedMerchant,canAllocate]);
  useEffect(() => {
    let active = true;
    if (canManage) listMerchants({ page: 1,pageSize: 100,isActive: true }).then(r => { if (active) setMerchants(r.items); }).catch(e => { if (active) setError(message(e)); });
    if (canAllocate) listAdminTagCatalogOptions().then(r => { if (active) setCatalog(r); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  },[canManage,canAllocate]);
  async function work(fn: () => Promise<void | string>, success: string) {
    setBusy(true);setError("");setNotice("");
    try { const result=await fn();await load();setNotice(typeof result==="string"?result:success); } catch(e) { setError(message(e)); }
    finally { setBusy(false);setPending(null); }
  }
  const change = <K extends keyof api.AgreementInput>(key: K,value: api.AgreementInput[K]) => setForm(f => ({...f,[key]:value}));
  function edit(a?: api.Agreement,revision = false) {
    setEditing(revision ? null : a ?? null);
    setForm(a ? { ...a, supersedesAgreementId: revision ? a.id : a.supersedesAgreementId } : {...empty});
    setEditor(true);setError("");
  }
  function confirmAction(action: api.CustodyAction,label: string) {
    if (!open) return;
    if (!reference.trim()) { setError("Enter the reason or acknowledgment reference first."); return; }
    if (["return","release","external-handover","correct-handover","reverse-handover","write-off"].includes(action) && selected.length === 0) { setError("Select the affected units first."); return; }
    const record = open;
    const evidence: api.ActionEvidence = {};
    if (["receive","record-discrepancy","resolve-discrepancy"].includes(action)) {
      if (!receipt.recipient.trim() || !receipt.receivedAt || receipt.signedEvidenceReference.trim().length<5) {setError("Enter the actual recipient, receipt date, quantities and signed evidence reference.");return;}
      const ids=(finding:string)=>record.units.filter(u=>receivingChoices[u.id]===finding).map(u=>u.id);
      const goodUnitIds=ids("Good"),damagedUnitIds=ids("Damaged"),missingUnitIds=ids("Missing"),returnedUnitIds=ids("Returned");
      if(!goodUnitIds.length&&!damagedUnitIds.length&&!missingUnitIds.length&&!returnedUnitIds.length){setError("Choose the actual receiving finding for each affected unit.");return;}
      evidence.receipt={...receipt,receivedAt:new Date(receipt.receivedAt).toISOString(),quantity:goodUnitIds.length+damagedUnitIds.length,
        damagedQuantity:damagedUnitIds.length,missingQuantity:missingUnitIds.length,goodUnitIds,damagedUnitIds,missingUnitIds,returnedUnitIds};
    }
    if (["external-handover","correct-handover","reverse-handover"].includes(action)) {
      if(selected.length!==1||!handover.eventReference.trim()||!handover.eventAt){setError("Select one unit and enter a unique external entry reference and event date.");return;}
      evidence.handover={...handover,eventAt:new Date(handover.eventAt).toISOString(),
        isReportedSale:action==="reverse-handover"?false:handover.isReportedSale,
        sellingPrice:action==="reverse-handover"||!handover.isReportedSale?null:handover.sellingPrice,
        discountAmount:action==="reverse-handover"||!handover.isReportedSale?null:handover.discountAmount,
        discountDescription:action==="reverse-handover"||!handover.isReportedSale?null:handover.discountDescription||null,
        supersedesRecordId:action==="external-handover"?null:record.units.find(u=>u.id===selected[0])?.currentHandoverRecordId??null};
    }
    setPending({ title: `${label}?`,message: `${record.dispatchNumber} · ${record.merchantName}. ${action === "dispatch" ? "This confirms stock custody only and creates no invoice, sale or commission." : "The reference and affected units will be retained in the activity history."}`,
      allowSelfReview:policy?.canSelfReview && ["receive","record-discrepancy","resolve-discrepancy"].includes(action),
      run: async (selfReview) => { setOpen(await api.custodyAction(record,action,reference,selected,{...evidence,...(selfReview?{selfReview}:{})}));setSelected([]);setReference("");setReceivingChoices({}); } });
  }
  const skus = catalog.flatMap(p => p.variants.filter(v => v.isActive && isSellableTagCapability(v)).map(v => ({id:v.id,label:`${p.name} · ${v.sku} · ${v.displayName}`})));
  return <div className="grid gap-6">
    <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Consignment records physical stock custody. Sales, commission and payments must be reconciled in the agreed external tracker. Activation alone does not record a sale.</p>
    {policy?<ConsignmentApprovalPolicy policy={policy} canManage={can(caps.consignmentPolicyManage)} onChange={setPolicy}/>:null}
    {policyError?<p role="alert">{policyError}</p>:null}
    {loading ? <p role="status">Loading consignment records…</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error} <button className={button} onClick={() => void work(async () => { await load();if(open) setOpen(await api.getDispatch(open.id)); },"Records refreshed.")}>Refresh records</button></p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3">{notice}</p> : null}
    <AdminSection title="Consignment agreements" description="Keep each partner’s terms and approved versions together. Unconfirmed terms remain pending.">
      {canManage ? <button className={button} disabled={busy} onClick={() => edit()}>New agreement</button> : null}
      {!loading && agreements.length === 0 ? <p>No consignment agreements yet.</p> : null}
      <div className="grid gap-3">{agreements.map(a => <article key={a.id} className="rounded-xl border p-4">
        <strong>{a.merchantName} · {a.reference} v{a.version}</strong>{a.approvalReviewMode?<p className="font-semibold">{a.approvalReviewMode}</p>:null}<p>{statusLabel(a.status)} · Partner {a.partnerCommissionPercentage}% · MyPetLink {((10000-Math.round(a.partnerCommissionPercentage*100))/100).toFixed(2)}%</p>
        <p className="text-sm">{a.pendingTerms.length ? `Pending: ${a.pendingTerms.join(", ")}` : "All commercial terms confirmed."}</p>
        <p className="text-sm">Effective: {dateTime(a.effectiveFrom)} to {dateTime(a.effectiveTo)} · Tracker: {a.externalTrackerReference ?? "Pending confirmation"}</p>
        {canManage || canApprove ? <div className="mt-2 flex flex-wrap gap-2">
          {a.status === "Draft" ? <>{canManage?<button className={button} onClick={() => edit(a)}>Edit draft</button>:null}{canApprove?<button className={button} disabled={busy || a.pendingTerms.length > 0} onClick={() => setPending({title:"Approve agreement?",message:`${a.reference} v${a.version} · ${a.merchantName} · ${a.partnerCommissionPercentage}% partner commission. ${agreementSummary(a)} Approval freezes the terms. Independent review is required unless you explicitly self-review as the authorized Solo founder.`,allowSelfReview:policy?.canSelfReview,run:async (selfReview) => { await api.agreementAction(a,"approve",a.signedAgreementReference ?? "",selfReview); }})}>Approve agreement</button>:null}</> : canManage?<button className={button} onClick={() => edit(a,true)}>Create new version</button>:null}
          {a.status !== "Closed" && canApprove ? <button className={button} disabled={busy||!closeReason.trim()} onClick={() => setPending({title:"Close agreement?",message:"All reservations, partner-held stock and returned units must be reconciled before closure.",run:async () => { await api.agreementAction(a,"close",closeReason); }})}>Close agreement</button> : null}
        </div> : null}
      </article>)}</div>
      <Pager page={agreementPage} total={agreementTotal} setPage={setAgreementPage}/>
      {canApprove?<Field label="Agreement closure reason" value={closeReason} onChange={setCloseReason} placeholder="Record the reason for closing an agreement"/>:null}
      {editor && canManage ? <form className="mt-4 grid gap-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault();void work(async () => { await api.saveAgreement(form,editing?.id,editing?.concurrencyToken);setEditor(false); },"Agreement draft saved."); }}>
        <h3 className="font-bold">{editing ? "Edit draft" : form.supersedesAgreementId ? "New agreement version" : "New agreement draft"}</h3>
        <label>Merchant<select className={input} required value={form.merchantId} disabled={Boolean(editing || form.supersedesAgreementId)} onChange={e => change("merchantId",e.target.value)}><option value="">Choose merchant</option>{merchants.map(m => <option key={m.id} value={m.id}>{m.tradingName ?? m.legalBusinessName}</option>)}</select></label>
        <Field label="Agreement reference" value={form.reference} disabled={Boolean(editing||form.supersedesAgreementId)} onChange={v => change("reference",v)} required/>
        <Field label="Partner commission (%)" type="number" value={form.partnerCommissionPercentage===null?"":String(form.partnerCommissionPercentage)} onChange={v => change("partnerCommissionPercentage",v===""?null:Number(v))} required min="0" max="100" step="0.01"/>
        <p className="text-sm">35% is the proposed initial partner rate. Confirm the rate for this agreement before approval.</p>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Effective start" type="datetime-local" value={localDate(form.effectiveFrom)} onChange={v => change("effectiveFrom",v ? new Date(v).toISOString() : null)}/><Field label="Effective end (if agreed)" type="datetime-local" value={localDate(form.effectiveTo)} onChange={v => change("effectiveTo",v ? new Date(v).toISOString() : null)}/></div>
        {terms.map(([key,label]) => <Field key={key} label={label} value={form[key] ?? ""} onChange={v => change(key,v || null)}/>)}
        <Field label="Payment deadline (days)" type="number" value={form.paymentDeadlineDays === null ? "" : String(form.paymentDeadlineDays)} onChange={v => change("paymentDeadlineDays",v === "" ? null : Number(v))} min="0" max="365" step="1"/>
        <div className="flex gap-2"><button className={button} disabled={busy} type="submit">Save draft</button><button className={button} type="button" onClick={() => setEditor(false)}>Close editor</button></div>
      </form> : null}
    </AdminSection>
    {canAllocate ? <AdminSection title="Reserve consignment stock" description="Only inspected, available tags are selected. Existing customer reservations are protected.">
      <form className="grid gap-3" onSubmit={e => { e.preventDefault();
        const content = { agreementId,merchantBranchId:branchId,destination,externalTrackerReference: tracker,lines };
        const fingerprint = JSON.stringify(content);
        const storageKey = `mypetlink_consignment_submission:${readStoredAuthSession()?.user.id??"local"}`;
        try { const previous=JSON.parse(window.sessionStorage.getItem(storageKey)??"null") as typeof request.current;if(previous?.fingerprint===fingerprint)request.current=previous; } catch { /* A stale local draft does not authorize a stock change. */ }
        if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint,key:crypto.randomUUID() };
        try { window.sessionStorage.setItem(storageKey,JSON.stringify(request.current)); } catch { setError("Your browser could not retain this submission reference. Enable session storage before reserving stock.");return; }
        const submission = {...content,idempotencyKey:request.current.key};
        setPending({title:"Reserve these tags?",message:`${lines.reduce((n,l)=>n+l.quantity,0)} tags will leave central availability. No payment, invoice or commission will be created.`,run:async () => { const result=await api.reserveConsignment(submission);setOpen(result);return result.reservationReused
          ? `Existing reservation ${result.dispatchNumber} reopened. No additional tags were reserved.` : `Reservation ${result.dispatchNumber} created.`; }});
      }}>
        <label>Approved agreement<select className={input} required value={agreementId} onChange={e => { setAgreementId(e.target.value);setBranchId("");setDestination("");setBranches([]);const a=agreements.find(a=>a.id===e.target.value);if(a?.externalTrackerReference)setTracker(a.externalTrackerReference); }}><option value="">Choose agreement</option>{agreements.filter(a => a.status === "Active").map(a => <option key={a.id} value={a.id}>{a.merchantName} · {a.reference} v{a.version}</option>)}</select></label>
        <label>Delivery branch<select className={input} required value={branchId} onChange={e=>{setBranchId(e.target.value);const b=branches.find(b=>b.id===e.target.value);setDestination(b?branchDestination(b):"");}}><option value="">Choose an active merchant branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <p className="text-sm">{destination||"Create or confirm the merchant's physical branch before reserving stock."}</p>
        <Field label="External tracker reference" value={tracker} onChange={setTracker} required/>
        {lines.map((line,i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <label>Tag option {i+1}<select className={input} required value={line.productVariantId} onChange={e => setLines(ls => ls.map((l,n)=>n===i?{...l,productVariantId:e.target.value}:l))}><option value="">Choose tag option</option>{skus.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <Field label={`Quantity ${i+1}`} type="number" value={String(line.quantity)} min="1" max="1000" step="1" required onChange={v=>setLines(ls=>ls.map((l,n)=>n===i?{...l,quantity:Number(v)}:l))}/>
          {lines.length>1?<button type="button" className={button} onClick={()=>setLines(ls=>ls.filter((_,n)=>n!==i))}>Remove line {i+1}</button>:null}
        </div>)}
        <div className="flex gap-2"><button type="button" className={button} onClick={()=>setLines(ls=>[...ls,{productVariantId:"",quantity:1}])}>Add tag option</button><button className={button} type="submit" disabled={busy}>Reserve tags</button></div>
        <button type="button" className={button} onClick={()=>setPending({title:"Clear reservation form?",message:"This clears the form only. Matching active reservations will still reopen without reserving additional tags.",run:async()=>{request.current=null;window.sessionStorage.removeItem(`mypetlink_consignment_submission:${readStoredAuthSession()?.user.id??"local"}`);setAgreementId("");setBranchId("");setDestination("");setBranches([]);setTracker("");setLines([{productVariantId:"",quantity:100}]);return "Reservation form cleared. Existing reservations are unchanged.";}})}>Clear reservation form</button>
      </form>
    </AdminSection>:null}
    <AdminSection title="Stock custody and reconciliation" description="Match individual units with the external tracker and keep returns separate from available stock.">
      {!loading && dispatches.length===0?<p>No consignment dispatches yet.</p>:null}
      <div className="grid gap-2">{dispatches.map(d=><button key={d.id} className={`${button} text-left`} onClick={()=>void work(async()=>{setOpen(await api.getDispatch(d.id));setSelected([]);},"Dispatch opened.")}>{d.dispatchNumber} · {d.merchantName} · {dispatchStatusLabel(d.status)} · {d.units.length} tags</button>)}</div>
      <Pager page={dispatchPage} total={dispatchTotal} setPage={setDispatchPage}/>
      {open?<div className="mt-4 grid gap-3 rounded-xl border p-4">
        <h3 className="font-bold">{open.dispatchNumber} · {open.merchantName}</h3><p>{open.destination}</p><p>Agreement {open.agreementReference} v{open.agreementVersion} · {dispatchStatusLabel(open.status)}</p>
        <p>Reserved {open.reserved} · Open partner custody {open.partnerHeld} · Return inspection {open.returnedQuarantine} · Released {open.released} · Written off {open.writtenOff} · External handovers {open.externalHandovers}</p>
        <p>Receiving: {open.units.filter(u=>u.status==="Received"&&u.receivingState==="Good").length} confirmed good at partner · {open.units.filter(u=>u.receivingState==="Damaged").length} damaged under review · {open.units.filter(u=>u.receivingState==="Missing").length} missing under review · {open.units.filter(u=>u.status==="Dispatched"&&u.receivingState==="Unconfirmed").length} not yet confirmed</p>
        <p>External tracker: {open.externalTrackerReference}</p>
        {open.hasOpenDiscrepancy?<p role="alert" className="bg-amber-50 p-3">Delivery discrepancy remains open for the affected units. Confirmed good units can proceed. Customer handovers remain blocked for missing, damaged and unconfirmed units.</p>:null}
        {open.activatedWithoutExternalReference>0?<p role="status" className="bg-amber-50 p-2">{open.activatedWithoutExternalReference} activated tags still need an external handover reference. Check the tracker; activation is not proof of sale.</p>:null}
        {open.hasIssuedDocument?<button className={button} disabled={busy} onClick={()=>void work(async()=>{await api.downloadConsignment(open.id,"dispatch-note.pdf");},"Issued dispatch note downloaded.")}>Download Dispatch Note</button>:<p className="text-sm">The dispatch note is issued when physical dispatch is confirmed.</p>}
        {can(caps.consignmentManifestExport)?<div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>void work(async()=>setOpen(await api.getDispatch(open.id,true)),"Controlled manifest opened.")}>View Tag Codes</button><button className={button} disabled={busy} onClick={()=>void work(async()=>{await api.downloadConsignment(open.id,"manifest.csv");},"Controlled manifest downloaded.")}>Download controlled manifest</button></div>:null}
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Select</th><th>Tag / Unit</th><th>SKU / Batch</th><th>Custody</th><th>Inspection</th><th>External reference</th><th>Receiving</th></tr></thead><tbody>{open.units.map(u=><tr key={u.id} className="border-t"><td><input aria-label={`Select ${u.unitReference}`} type="checkbox" checked={selected.includes(u.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,u.id]:s.filter(id=>id!==u.id))}/></td><td className="p-2">{u.tagCode??u.unitReference} {u.isActivated?"· Activated":""}</td><td>{u.sku} / {u.batch??"—"}</td><td>{statusLabel(u.status)}</td><td>{statusLabel(u.qaStatus)}</td><td>{u.externalReference??"—"}</td><td><span>{statusLabel(u.receivingState)}</span>{can(caps.consignmentReconcile)&&open.status!=="Reserved"&&open.status!=="Cancelled"?<select className={input} aria-label={`Receiving finding for ${u.unitReference}`} value={receivingChoices[u.id]??""} onChange={e=>setReceivingChoices(c=>({...c,[u.id]:e.target.value}))}><option value="">No new finding</option><option value="Good">Received good / located good</option><option value="Damaged">Received damaged</option><option value="Missing">Missing</option><option value="Returned">Physical return reviewed</option></select>:null}</td></tr>)}</tbody></table></div>
        <Field label="Action reason / acknowledgment / tracker entry reference" value={reference} onChange={setReference} placeholder="Evidence reference; exclude customer personal details"/>
        <p className="text-sm">Keep customer names, contact details and other personal information out of tracker references. Receipt evidence records the actual partner recipient only.</p>
        {can(caps.consignmentReconcile)&&(open.status==="Dispatched"||open.hasOpenDiscrepancy)?<fieldset className="grid gap-3 rounded-xl border p-3"><legend>Partner receipt evidence</legend>
          <p>Record the partner’s actual signed evidence. Team Mode requires a different administrator; the authorized Solo founder must explicitly attest to self-review. Missing or damaged deliveries stay open for investigation.</p>
          <Field label="Actual partner recipient" value={receipt.recipient} onChange={v=>setReceipt(r=>({...r,recipient:v}))} placeholder="Name on signed receipt"/>
          <Field label="Actual receipt date" type="datetime-local" value={receipt.receivedAt} onChange={v=>setReceipt(r=>({...r,receivedAt:v}))}/>
          <p>Choose a finding beside each affected unit. Counts cover only those units: {open.units.filter(u=>["Good","Damaged"].includes(receivingChoices[u.id])).length} counted (including {open.units.filter(u=>receivingChoices[u.id]==="Damaged").length} damaged), {open.units.filter(u=>receivingChoices[u.id]==="Missing").length} missing, {open.units.filter(u=>receivingChoices[u.id]==="Returned").length} physically returned.</p>
          <button className={button} disabled={busy} onClick={()=>setReceivingChoices(Object.fromEntries(open.units.filter(u=>u.status==="Dispatched"&&u.receivingState==="Unconfirmed").map(u=>[u.id,"Good"])))}>Mark unconfirmed units good</button>
          <p>Team Mode requires a reviewer who neither dispatched the stock nor recorded that unit’s discrepancy. An authorized Solo self-review requires new supporting evidence. Review actual returns separately; never count them at the partner.</p>
          <Field label="Signed receipt / evidence reference" value={receipt.signedEvidenceReference} onChange={v=>setReceipt(r=>({...r,signedEvidenceReference:v}))} placeholder="Reference to actual retained signed evidence"/>
          <button className={button} disabled={busy} onClick={()=>confirmAction("record-discrepancy","Record delivery discrepancy")}>Record delivery discrepancy</button>
          {open.hasOpenDiscrepancy?<button className={button} disabled={busy} onClick={()=>confirmAction("resolve-discrepancy","Review selected discrepancy outcomes")}>Review selected discrepancy outcomes</button>:null}
        </fieldset>:null}
        {can(caps.consignmentReconcile)?<fieldset className="grid gap-3 rounded-xl border p-3"><legend>External handover evidence</legend>
          <p>Select one unit per unique external entry. Reported sale details remain unverified and create no invoice, commission or settlement.</p>
          <Field label="Unique external event reference" value={handover.eventReference} onChange={v=>setHandover(h=>({...h,eventReference:v}))} placeholder="Unique tracker entry; new reference for corrections"/>
          <Field label="Actual handover / correction date" type="datetime-local" value={handover.eventAt} onChange={v=>setHandover(h=>({...h,eventAt:v}))}/>
          <label><input type="checkbox" checked={handover.isReportedSale} onChange={e=>setHandover(h=>({...h,isReportedSale:e.target.checked}))}/> Includes an unverified externally reported sale</label>
          {handover.isReportedSale?<><Field label="Actual selling price (MYR)" type="number" min="0" max="999999.99" step="0.01" value={handover.sellingPrice===null?"":String(handover.sellingPrice)} onChange={v=>setHandover(h=>({...h,sellingPrice:v===""?null:Number(v)}))}/><Field label="Discount amount (MYR; zero if none)" type="number" min="0" max="999999.99" step="0.01" value={handover.discountAmount===null?"":String(handover.discountAmount)} onChange={v=>setHandover(h=>({...h,discountAmount:v===""?null:Number(v)}))}/><Field label="Discount explanation" value={handover.discountDescription} onChange={v=>setHandover(h=>({...h,discountDescription:v}))}/></>:null}
        </fieldset>:null}
        <div className="flex flex-wrap gap-2">
          {open.status==="Reserved"&&can(caps.consignmentDispatch)?<button className={button} disabled={busy} onClick={()=>confirmAction("dispatch","Confirm dispatch")}>Confirm dispatch</button>:null}
          {open.status==="Reserved"&&canAllocate?<button className={button} disabled={busy} onClick={()=>confirmAction("cancel","Cancel reservation")}>Cancel reservation</button>:null}
          {open.status==="Dispatched"&&can(caps.consignmentReconcile)?<button className={button} disabled={busy} onClick={()=>confirmAction("receive","Acknowledge receipt")}>Acknowledge receipt</button>:null}
          {can(caps.consignmentReturn)?<button className={button} disabled={busy||!selected.length} onClick={()=>confirmAction("return","Receive selected returns")}>Receive selected returns</button>:null}
          {can(caps.consignmentRelease)?<button className={button} disabled={busy||!selected.length} onClick={()=>confirmAction("release","Release inspected returns")}>Release inspected returns</button>:null}
          {can(caps.consignmentReconcile)?<button className={button} disabled={busy||!selected.length} onClick={()=>confirmAction("external-handover","Record external customer handover")}>Record external customer handover</button>:null}
          {can(caps.consignmentReconcile)?<><button className={button} disabled={busy||selected.length!==1} onClick={()=>confirmAction("correct-handover","Correct current handover record")}>Correct current handover record</button><button className={button} disabled={busy||selected.length!==1} onClick={()=>confirmAction("reverse-handover","Reverse current handover record")}>Reverse current handover record</button></>:null}
          {can(caps.consignmentWriteOff)?<button className={button} disabled={busy||!selected.length} onClick={()=>confirmAction("write-off","Write off failed returned stock")}>Write off failed returned stock</button>:null}
        </div>
        <p className="text-sm">Returns remain unavailable until a fresh physical inspection passes and an authorized administrator releases them. Customer-owned tags cannot use this stock-return process.</p>
        <details><summary>Custody activity</summary><ul>{open.history.map((h,i)=><li className="grid gap-1 border-b py-2" key={i}>{dateTime(h.occurredAt)} · {statusLabel(h.action)} · {h.unitId?unitReference(h.unitId):"Whole delivery"} · {h.actorName??"Administrator"} · {h.reference}{h.reviewMode?<strong>{h.reviewMode}</strong>:null}{h.evidenceJson?<p className="text-xs">{receiptSummary(h.evidenceJson)}</p>:null}</li>)}</ul></details>
        {open.reviews?.length?<details><summary>Receiving review evidence</summary><ul>{open.reviews.map(e=><li className="border-b py-2" key={e.id}><strong>{e.reviewMode}</strong> · {dateTime(e.recordedAt)} · {e.actorAdminUserId} · {e.reason} · {e.externalEvidenceReference}</li>)}</ul></details>:null}
        <details><summary>External reconciliation history</summary><ul>{open.reconciliation.map(h=><li key={h.id}>{h.eventReference} · {h.kind} · {dateTime(h.eventAt)} · Unit {open.units.findIndex(u=>u.id===h.unitId)+1} · {h.isReportedSale?`Reported MYR ${h.sellingPrice?.toFixed(2)}; discount MYR ${h.discountAmount?.toFixed(2)}`:"Custody evidence"} · {h.verificationStatus} · {h.evidenceReference}</li>)}</ul><p>Corrections and reversals retain their originals. Reversal does not undo customer ownership or activation.</p></details>
      </div>:null}
      {can(caps.consignmentManifestExport)?<div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Reconciliation export start" type="datetime-local" value={exportFrom} onChange={setExportFrom}/><Field label="Reconciliation export end (exclusive)" type="datetime-local" value={exportTo} onChange={setExportTo}/><button className={button} disabled={busy||!exportFrom||!exportTo} onClick={()=>void work(async()=>{await api.downloadReconciliation(new Date(exportFrom).toISOString(),new Date(exportTo).toISOString());},"Restricted reconciliation export downloaded.")}>Download reconciliation records</button><button className={button} disabled={busy||!exportFrom||!exportTo} onClick={()=>void work(async()=>{await api.downloadReviewLog(new Date(exportFrom).toISOString(),new Date(exportTo).toISOString());},"Review log downloaded.")}>Download review log</button></div>:null}
    </AdminSection>
    <ConfirmDialog open={pending!==null} title={pending?.title??"Confirm action"} message={pending?.message??""} confirmLabel="Confirm" confirmDisabled={busy||Boolean(pending?.allowSelfReview&&selfConfirmed&&(selfReason.trim().length<10||selfEvidence.trim().length<5))} onCancel={()=>{if(!busy)setPending(null);}} onConfirm={()=>{if(pending&&!busy)void work(()=>pending.run(pending.allowSelfReview&&selfConfirmed?{confirmed:true,reason:selfReason,externalEvidenceReference:selfEvidence}:undefined),"Changes recorded.");}}>
      {pending?.allowSelfReview?<fieldset className="grid gap-3"><legend>Solo self-review</legend><label><input type="checkbox" checked={selfConfirmed} onChange={e=>setSelfConfirmed(e.target.checked)}/> This is my own work. I confirm the actual partner acceptance, acknowledgment or new supporting evidence. Record this as Self-reviewed (Solo).</label>{selfConfirmed?<><Field label="Self-review reason" value={selfReason} onChange={setSelfReason}/><Field label="Self-review external evidence reference" value={selfEvidence} onChange={setSelfEvidence}/><p>Use the exact signed agreement or receiving evidence reference for this operation. A discrepancy resolution must cite new evidence.</p></>:null}</fieldset>:null}
    </ConfirmDialog>
  </div>;
}
function message(e: unknown) { return e instanceof Error ? e.message : "We couldn't complete this action. Please try again."; }
function localDate(value: string | null) {
  if (!value) return "";
  const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function Field({label,value,onChange,type="text",required=false,min,max,step,disabled=false,placeholder}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean;min?:string;max?:string;step?:string;disabled?:boolean;placeholder?:string}) {
  return <label className="grid gap-1 text-sm font-medium">{label}<input className={input} type={type} value={value} required={required} min={min} max={max} step={step} disabled={disabled} maxLength={2000} placeholder={placeholder??(required?undefined:"Pending confirmation")} onChange={e=>onChange(e.target.value)}/></label>;
}
function branchDestination(b: AdminBranch) {return [b.name,b.address.addressLine1,b.address.addressLine2,b.address.postcode,b.address.city,b.address.state,b.address.country].filter(v=>v?.trim()).map(v=>v!.trim()).join(", ");}
function unitReference(id:string) {return "CU-"+id.replaceAll("-","").toUpperCase();}
function receiptSummary(json: string) {try {const e=JSON.parse(json) as {ReceivingState?:string;Recipient?:string;Quantity?:number;DamagedQuantity?:number;MissingQuantity?:number;SignedEvidenceReference?:string};if(e.ReceivingState)return ` · Receiving finding: ${statusLabel(e.ReceivingState)}`;return ` · ${e.Recipient??"Recipient"}: ${e.Quantity??0} counted, ${e.DamagedQuantity??0} damaged, ${e.MissingQuantity??0} missing · ${e.SignedEvidenceReference??""}`;}catch{return " · Receipt evidence retained.";}}
function Pager({page,total,setPage}:{page:number;total:number;setPage:(p:number)=>void}) {
  return <div className="mt-3 flex items-center gap-3"><button className={button} disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} · {total} records</span><button className={button} disabled={page*20>=total} onClick={()=>setPage(page+1)}>Next</button></div>;
}

function dispatchStatusLabel(value:string) {return value==="Received"?"Receiving complete":statusLabel(value);}
function statusLabel(value: string) {
  const labels: Record<string,string> = {
    ReviewRequired:"Receiving review required", Unconfirmed:"Not yet confirmed", Good:"Confirmed good", Damaged:"Damaged; under review", Missing:"Missing; under review", Returned:"Physical return reviewed", "receiving-unit":"Unit receiving finding", receive:"Partner receipt recorded", Reserved: "Reserved", Dispatched: "Dispatched", Received: "Received", Cancelled: "Cancelled",
    ReturnedQuarantine: "Return inspection", Released: "Released", ExternalHandover: "Customer handover recorded",
    NeedsReview: "Needs review", "external-handover": "Customer handover reference recorded",
    reserved: "Stock reserved", dispatched: "Stock dispatched", received: "Partner receipt acknowledged",
    cancelled: "Reservation cancelled", return: "Return received for inspection", release: "Inspected return released",
    WrittenOff:"Written off; unavailable", "write-off":"Failed return written off", "record-discrepancy":"Receiving discrepancy recorded", "resolve-discrepancy":"Receiving discrepancy resolved", "correct-handover":"External handover corrected", "reverse-handover":"External handover reversed",
  };
  return labels[value] ?? value;
}

function agreementSummary(a:api.Agreement){return `Effective ${dateTime(a.effectiveFrom)} to ${dateTime(a.effectiveTo)}. Duration: ${a.durationTerms}. Settlement: ${a.settlementFrequency}; deadline ${a.paymentDeadlineDays} days. Discounts: ${a.discountTerms}. Returns: ${a.returnTerms}. Loss: ${a.lossTerms}. Partner acceptance: ${a.signedAgreementReference}. Tracker: ${a.externalTrackerReference}.`; }
