"use client";

import type * as api from "@/services/adminConsignmentService";
import { ConsignmentApprovalPolicy } from "../ConsignmentApprovalPolicy";
import type { ConsignmentContext } from "./context";

export function SettingsView({
  context,
  onPolicyChange,
}: {
  context: ConsignmentContext;
  onPolicyChange: (policy: api.ApprovalPolicy) => void;
}) {
  if (!context.policy) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500" role="status">
        {context.loading ? "Loading consignment settings…" : "Consignment settings are unavailable right now."}
      </p>
    );
  }
  return <ConsignmentApprovalPolicy canManage={context.can.managePolicy} onChange={onPolicyChange} policy={context.policy} />;
}
