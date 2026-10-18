"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import * as api from "@/services/adminConsignmentService";
import { dateTime } from "./shared";

export function ConsignmentApprovalPolicy({policy,canManage,onChange}:{policy:api.ApprovalPolicy;canManage:boolean;onChange:(p:api.ApprovalPolicy)=>void}) {
  const [mode,setMode]=useState<"Team"|"Solo">("Team");
  const [founder,setFounder]=useState("");
  const [reason,setReason]=useState("");
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const field="w-full rounded-xl border p-3";
  async function save(){
    setBusy(true);setError("");setNotice("");
    try{onChange(await api.saveApprovalPolicy({concurrencyToken:policy.concurrencyToken,mode,selfReviewerAdminUserId:mode==="Solo"?founder:null,confirmed:true,reason}));setConfirm(false);setReason("");setNotice("Approval policy saved.");}
    catch(e){setError(e instanceof Error?e.message:"We couldn't save the approval policy. Refresh and try again.");}
    finally{setBusy(false);}
  }
  return <section className="grid gap-3 rounded-xl border p-4" aria-label="Consignment approval policy">
    <h2 className="font-bold">Consignment approval policy</h2>
    <p>Current approval mode: <strong>{policy.mode}</strong></p>
    <p>Authorized self-reviewer: {policy.mode==="Solo"?policy.selfReviewerName??"Unavailable; self-review is blocked":"None"}</p>
    {policy.mode==="Solo"&&policy.selfReviewerIsEligible===false?<p role="alert">The named founder no longer has active self-review permission. Self-review is blocked until access is restored or Team Mode is selected.</p>:null}
    <p>Team requires independent internal review. Solo permits only the named founder with self-review permission to review their own consignment work. Partner acceptance, real counts, supporting evidence and stock holds still apply.</p>
    <p className="text-sm">Last change: {dateTime(policy.updatedAt)} · {policy.updatedByAdminUserId??"Initial Team policy"}</p>
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {canManage?<form className="grid gap-3" onSubmit={e=>{e.preventDefault();setConfirm(true);}}>
      <label>New approval mode<select className={field} value={mode} onChange={e=>setMode(e.target.value as "Team"|"Solo")}><option value="Team">Team</option><option value="Solo">Solo</option></select></label>
      {mode==="Solo"?<label>Authorize founder for self-review<select className={field} required value={founder} onChange={e=>setFounder(e.target.value)}><option value="">Choose one founder</option>{policy.eligibleReviewers.filter(a=>a.hasSelfReviewCapability).map(a=><option key={a.adminUserId} value={a.adminUserId}>{a.name}</option>)}</select></label>:null}
      <label>Approval policy change reason<textarea className={field} required minLength={10} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button className={field} disabled={busy||reason.trim().length<10||mode==="Solo"&&!founder} type="submit">Review policy change</button>
    </form>:null}
    <details><summary>Approval policy change history</summary><ul>{policy.history.map(e=><li className="border-b py-2" key={e.id}>{dateTime(e.recordedAt)} · {e.actorAdminUserId} · {e.previousPolicyMode} → {e.policyMode} · Founder {e.selfReviewerAdminUserId??"None"} · {e.reason}</li>)}</ul><p>The latest 20 changes are shown. Download the review log for a complete date range.</p></details>
    <ConfirmDialog open={confirm} title={mode==="Solo"?"Enable Solo Operator Mode?":"Restore Team Approval Mode?"} message={mode==="Solo"?"This removes independent internal review for the named founder only. Each self-review requires explicit confirmation, a reason and genuine external evidence. It does not prove partner acceptance or authorize stock release, payments or financial postings.":"New operations will require independent internal review immediately. Historical Solo self-reviews keep their original evidence and labels."} confirmLabel="Confirm policy change" confirmDisabled={busy} onCancel={()=>setConfirm(false)} onConfirm={()=>void save()}/>
  </section>;
}
