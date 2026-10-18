// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConsignmentApprovalPolicy } from "./ConsignmentApprovalPolicy";
import type { ApprovalPolicy } from "@/services/adminConsignmentService";
const save=vi.hoisted(()=>vi.fn());
vi.mock("@/services/adminConsignmentService",()=>({saveApprovalPolicy:save}));
const policy:ApprovalPolicy={mode:"Team",selfReviewerAdminUserId:null,selfReviewerName:null,canSelfReview:false,updatedByAdminUserId:null,updatedAt:null,concurrencyToken:"POLICY-V1",eligibleReviewers:[{adminUserId:"founder",name:"Synthetic Founder",hasSelfReviewCapability:true},{adminUserId:"viewer",name:"Viewer",hasSelfReviewCapability:false}],history:[]};
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
it("shows Team and hides configuration controls from read-only operators",()=>{
  render(<ConsignmentApprovalPolicy policy={policy} canManage={false} onChange={vi.fn()}/>);
  expect(screen.getByText("Team")).toBeTruthy();expect(screen.getByText(/Authorized self-reviewer: None/)).toBeTruthy();
  expect(screen.queryByLabelText("New approval mode")).toBeNull();
});
it("requires reason, eligible founder and a separate warning confirmation before enabling Solo",async()=>{
  const changed=vi.fn();save.mockResolvedValue({...policy,mode:"Solo",selfReviewerAdminUserId:"founder",selfReviewerName:"Synthetic Founder"});
  render(<ConsignmentApprovalPolicy policy={policy} canManage onChange={changed}/>);
  fireEvent.change(screen.getByLabelText("New approval mode"),{target:{value:"Solo"}});
  expect(screen.queryByRole("option",{name:"Viewer"})).toBeNull();
  const button=screen.getByRole("button",{name:"Review policy change"}) as HTMLButtonElement;expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Authorize founder for self-review"),{target:{value:"founder"}});
  fireEvent.change(screen.getByLabelText("Approval policy change reason"),{target:{value:"Single founder operations with external partner evidence"}});
  fireEvent.click(button);expect(save).not.toHaveBeenCalled();expect(screen.getByText(/This removes independent internal review/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Confirm policy change"}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith({concurrencyToken:"POLICY-V1",mode:"Solo",selfReviewerAdminUserId:"founder",confirmed:true,reason:"Single founder operations with external partner evidence"}));
  expect(await screen.findByText("Approval policy saved.")).toBeTruthy();expect(changed).toHaveBeenCalled();
});
it("restores Team without retaining a self-review nomination and displays historical audit details",async()=>{
  const current={...policy,mode:"Solo" as const,selfReviewerName:"Synthetic Founder",selfReviewerAdminUserId:"founder",history:[{id:"event",action:"approval-policy-changed",reviewMode:"Policy change",actorAdminUserId:"admin",recordedAt:"2026-10-18T01:00:00Z",reason:"Single founder operations",externalEvidenceReference:"",policyMode:"Solo",previousPolicyMode:"Team",selfReviewerAdminUserId:"founder",previousSelfReviewerAdminUserId:null,agreementId:null,dispatchId:null}]};
  save.mockResolvedValue(policy);render(<ConsignmentApprovalPolicy policy={current} canManage onChange={vi.fn()}/>);
  expect(screen.getByText(/admin · Team → Solo · Founder founder/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Approval policy change reason"),{target:{value:"Employees now provide independent review"}});
  fireEvent.click(screen.getByRole("button",{name:"Review policy change"}));fireEvent.click(screen.getByRole("button",{name:"Confirm policy change"}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({mode:"Team",selfReviewerAdminUserId:null})));
});
it("keeps errors visible after a stale policy conflict",async()=>{
  save.mockRejectedValue(new Error("This record changed. Reload before trying again."));
  render(<ConsignmentApprovalPolicy policy={policy} canManage onChange={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText("Approval policy change reason"),{target:{value:"Revert to independent Team review"}});
  fireEvent.click(screen.getByRole("button",{name:"Review policy change"}));fireEvent.click(screen.getByRole("button",{name:"Confirm policy change"}));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent","This record changed. Reload before trying again.");
});
