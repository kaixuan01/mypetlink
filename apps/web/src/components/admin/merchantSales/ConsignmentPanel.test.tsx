// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "./ConsignmentPanel";
import { allAdminCapabilities, adminCapabilities, noAdminAccess } from "@/lib/adminCapabilities";
import type { Agreement, ConsignmentDispatch } from "@/services/adminConsignmentService";
const mocks=vi.hoisted(()=>({policy:vi.fn(),agreements:vi.fn(),dispatches:vi.fn(),get:vi.fn(),save:vi.fn(),act:vi.fn(),approve:vi.fn(),download:vi.fn(),access:vi.fn(),reserve:vi.fn(),catalog:vi.fn(),listing:vi.fn()}));
vi.mock("@/services/authService",()=>({getAdminCapabilities:mocks.access}));
vi.mock("@/services/adminMerchantSalesService",()=>({listMerchants:vi.fn(async()=>({items:[{id:"merchant",legalBusinessName:"First Pet Shop",tradingName:null}],total:1}))}));
vi.mock("@/services/merchantDirectoryService",()=>({getMerchantListing:mocks.listing}));
vi.mock("@/services/tagCatalogService",()=>({listAdminTagCatalogOptions:mocks.catalog}));
vi.mock("@/services/adminConsignmentService",()=>({getApprovalPolicy:mocks.policy,listAgreements:mocks.agreements,listDispatches:mocks.dispatches,getDispatch:mocks.get,saveAgreement:mocks.save,custodyAction:mocks.act,agreementAction:mocks.approve,downloadConsignment:mocks.download,reserveConsignment:mocks.reserve}));
const agreement: Agreement={id:"agreement",merchantId:"merchant",merchantName:"First Pet Shop",reference:"SHOP-1",version:1,status:"Draft",partnerCommissionPercentage:35,effectiveFrom:null,effectiveTo:null,durationTerms:null,settlementFrequency:null,paymentDeadlineDays:null,discountTerms:null,returnTerms:null,lossTerms:null,signedAgreementReference:null,externalTrackerReference:null,pendingTerms:["Duration","Payment deadline"],concurrencyToken:"agreement-token"};
const dispatch: ConsignmentDispatch={id:"dispatch",agreementId:"agreement",dispatchNumber:"MPL-CS-TEST-1",merchantName:"First Pet Shop",agreementReference:"SHOP-1",agreementVersion:1,commissionPercentage:35,destination:"Shop branch",status:"Reserved",externalTrackerReference:"TRACKER-1",dispatchedAt:null,receivedAt:null,shipmentReference:null,receiptAcknowledgment:null,reserved:1,partnerHeld:0,returnedQuarantine:0,released:0,externalHandovers:0,writtenOff:0,activatedWithoutExternalReference:0,units:[{id:"unit",unitReference:"CU-UNIT",receivingState:"Unconfirmed",tagCode:null,sku:"SKU-1",productName:"Smart Tag",variant:"Standard",batch:"B-1",status:"Reserved",qaStatus:"Passed",isActivated:false,externalReference:null,currentHandoverRecordId:null}],history:[],concurrencyToken:"stock-token",merchantBranchId:null,hasOpenDiscrepancy:false,hasIssuedDocument:false,recipientName:null,partnerReceivedAt:null,receivedQuantity:null,reconciliation:[]};
beforeEach(()=>{mocks.policy.mockResolvedValue({mode:"Team",selfReviewerAdminUserId:null,selfReviewerName:null,canSelfReview:false,updatedByAdminUserId:null,updatedAt:null,concurrencyToken:"policy",eligibleReviewers:[],history:[]});window.history.replaceState(null,"","/");window.sessionStorage.clear();vi.clearAllMocks();mocks.access.mockReturnValue(allAdminCapabilities());mocks.catalog.mockResolvedValue([]);mocks.listing.mockResolvedValue({branches:[]});mocks.agreements.mockResolvedValue({items:[agreement],total:1});mocks.dispatches.mockResolvedValue({items:[dispatch],total:1});mocks.get.mockResolvedValue(dispatch);mocks.act.mockResolvedValue({...dispatch,status:"Dispatched"});});
afterEach(cleanup);
describe("Consignment operations",()=>{
  it("keeps unconfirmed terms pending and prevents approval",async()=>{render(<ConsignmentPanel/>);await screen.findByText(/Pending: Duration, Payment deadline/);expect((screen.getByRole("button",{name:"Approve agreement"}) as HTMLButtonElement).disabled).toBe(true);expect(mocks.approve).not.toHaveBeenCalled();});
  it("does not reveal tag codes or mutations with view permission only",async()=>{mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView])});render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));await screen.findByText("CU-UNIT");expect(screen.queryByRole("button",{name:"View Tag Codes"})).toBeNull();expect(screen.queryByRole("button",{name:"Confirm dispatch"})).toBeNull();expect(screen.queryByRole("button",{name:"New agreement"})).toBeNull();expect(mocks.get).toHaveBeenCalledWith("dispatch");});
  it("requires confirmation and submits current token without financial fields",async()=>{render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));fireEvent.change(await screen.findByLabelText("Action reason / acknowledgment / tracker entry reference"),{target:{value:"SHIP-1"}});fireEvent.click(screen.getByRole("button",{name:"Confirm dispatch"}));expect(mocks.act).not.toHaveBeenCalled();expect(screen.getByText(/creates no invoice, sale or commission/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(dispatch,"dispatch","SHIP-1",[],{}));});
  it("reveals a controlled manifest only after explicit action",async()=>{render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));await screen.findByText("CU-UNIT");expect(mocks.get).not.toHaveBeenCalledWith("dispatch",true);mocks.get.mockResolvedValue({...dispatch,units:[{...dispatch.units[0],tagCode:"MPL-CODE-TEST"}]});fireEvent.click(screen.getByRole("button",{name:"View Tag Codes"}));await screen.findByText("MPL-CODE-TEST");expect(mocks.get).toHaveBeenCalledWith("dispatch",true);});
  it("shows failures without a success message and offers refresh",async()=>{mocks.dispatches.mockRejectedValue(new Error("Connection unavailable"));render(<ConsignmentPanel/>);await screen.findByRole("alert");expect(screen.getByText(/Connection unavailable/)).toBeTruthy();expect(screen.getByRole("button",{name:"Refresh records"})).toBeTruthy();expect(screen.queryByText("Changes recorded.")).toBeNull();});
  it("does not let an agreement editor approve without the separate capability",async()=>{
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView,adminCapabilities.consignmentAgreementsManage])});
    render(<ConsignmentPanel/>);await screen.findByText(/SHOP-1 v1/);expect(screen.getByRole("button",{name:"Edit draft"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Approve agreement"})).toBeNull();
  });
  it("keeps a cleared commission blank and formats the complementary share",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...agreement,partnerCommissionPercentage:35.15}],total:1});render(<ConsignmentPanel/>);
    await screen.findByText(/MyPetLink 64.85%/);fireEvent.click(screen.getByRole("button",{name:"Edit draft"}));
    const rate=screen.getByLabelText("Partner commission (%)") as HTMLInputElement;fireEvent.change(rate,{target:{value:""}});expect(rate.value).toBe("");
    expect((screen.getByLabelText("Agreement reference") as HTMLInputElement).disabled).toBe(true);
  });
  it("requires receiving fields before offering receipt confirmation",async()=>{
    const shipped={...dispatch,status:"Dispatched",hasIssuedDocument:true};mocks.get.mockResolvedValue(shipped);render(<ConsignmentPanel/>);
    fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));await screen.findByLabelText("Actual partner recipient");
    fireEvent.change(screen.getByLabelText("Action reason / acknowledgment / tracker entry reference"),{target:{value:"x"}});fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));
    expect(screen.getByRole("alert").textContent).toContain("actual recipient");expect(mocks.act).not.toHaveBeenCalled();
  });
  it("downloads an issued non-sensitive note for a viewer without exposing codes",async()=>{
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView])});mocks.get.mockResolvedValue({...dispatch,hasIssuedDocument:true,status:"Dispatched"});
    render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));fireEvent.click(await screen.findByRole("button",{name:"Download Dispatch Note"}));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledWith("dispatch","dispatch-note.pdf"));expect(screen.queryByRole("button",{name:"View Tag Codes"})).toBeNull();
  });
  it("restores an open dispatch from its link and retains a pending discrepancy",async()=>{
    window.history.replaceState(null,"","/?tab=consignment&dispatch=dispatch");mocks.get.mockResolvedValue({...dispatch,status:"Dispatched",hasOpenDiscrepancy:true});
    render(<ConsignmentPanel/>);await screen.findByText(/Delivery discrepancy remains open/);expect(mocks.get).toHaveBeenCalledWith("dispatch");
    expect(screen.getByRole("button",{name:"Review selected discrepancy outcomes"})).toBeTruthy();
  });
  it("reuses the submission reference after a full component remount",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...agreement,status:"Active",pendingTerms:[]}],total:1});
    mocks.catalog.mockResolvedValue([{name:"Smart Tag",variants:[{id:"sku",sku:"SKU-1",displayName:"Standard",isActive:true,supportsQr:true,supportsNfc:true}]}]);
    mocks.listing.mockResolvedValue({branches:[{id:"branch",name:"Shop branch",isActive:true,address:{addressLine1:"1 Street",addressLine2:null,postcode:"50000",city:"KL",state:"KL",country:"Malaysia"}}]});
    mocks.reserve.mockResolvedValue({...dispatch,reservationReused:true});
    async function submit(){
      fireEvent.change(await screen.findByLabelText("Approved agreement"),{target:{value:"agreement"}});
      await screen.findByRole("option",{name:"Shop branch"});fireEvent.change(screen.getByLabelText("Delivery branch"),{target:{value:"branch"}});
      fireEvent.change(screen.getByLabelText("Tag option 1"),{target:{value:"sku"}});fireEvent.change(screen.getByLabelText("External tracker reference"),{target:{value:"TRACKER"}});
      fireEvent.submit(screen.getByRole("button",{name:"Reserve tags"}).closest("form")!);fireEvent.click(await screen.findByRole("button",{name:/^Confirm$/}));
    }
    const first=render(<ConsignmentPanel/>);await submit();await waitFor(()=>expect(mocks.reserve).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Existing reservation MPL-CS-TEST-1 reopened. No additional tags were reserved/)).toBeTruthy();
    expect(screen.queryByText("Changes recorded.")).toBeNull();
    const key=mocks.reserve.mock.calls[0][0].idempotencyKey;first.unmount();render(<ConsignmentPanel/>);await submit();
    await waitFor(()=>expect(mocks.reserve).toHaveBeenCalledTimes(2));expect(mocks.reserve.mock.calls[1][0].idempotencyKey).toBe(key);
  });
  it("submits truthful unit findings for a partial receipt and displays derived counts",async()=>{
    const shipped={...dispatch,status:"Dispatched",units:[{...dispatch.units[0],status:"Dispatched"},{...dispatch.units[0],id:"missing",unitReference:"CU-MISSING",status:"Dispatched"}]};
    mocks.get.mockResolvedValue(shipped);render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));
    fireEvent.change(await screen.findByLabelText("Actual partner recipient"),{target:{value:"Synthetic Recipient"}});
    fireEvent.change(screen.getByLabelText("Actual receipt date"),{target:{value:"2026-10-17T10:00"}});
    fireEvent.change(screen.getByLabelText("Signed receipt / evidence reference"),{target:{value:"SIGNED-RECEIPT"}});
    fireEvent.change(screen.getByLabelText("Action reason / acknowledgment / tracker entry reference"),{target:{value:"RX-PARTIAL-1"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-UNIT"),{target:{value:"Good"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-MISSING"),{target:{value:"Missing"}});
    expect(screen.getByText(/1 counted \(including 0 damaged\), 1 missing, 0 physically returned/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));
    await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(shipped,"receive","RX-PARTIAL-1",[],{receipt:expect.objectContaining({quantity:1,damagedQuantity:0,missingQuantity:1,goodUnitIds:["unit"],missingUnitIds:["missing"],returnedUnitIds:[]})}));
  });
  it("separates history fields and keeps stable unit references after sorting changes",async()=>{
    const record={...dispatch,history:[{action:"receive",reference:"RX-REFERENCE",occurredAt:"2026-10-17T10:00:00Z",unitId:"unit",actorAdminUserId:"admin",actorName:"Operator",evidenceJson:JSON.stringify({Recipient:"Synthetic Recipient",Quantity:1,DamagedQuantity:0,MissingQuantity:0,SignedEvidenceReference:"SIGNED"})}]};
    mocks.get.mockResolvedValue(record);render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));
    const history=await screen.findByText(/RX-REFERENCE/);expect(history.textContent).toContain("RX-REFERENCE · Synthetic Recipient");
    expect(screen.getByRole("checkbox",{name:"Select CU-UNIT"})).toBeTruthy();expect(screen.queryByText("Unit 1")).toBeNull();
    mocks.get.mockResolvedValue({...record,units:[{...record.units[0],id:"other",unitReference:"CU-OTHER"},record.units[0]]});
    fireEvent.click(screen.getByRole("button",{name:"View Tag Codes"}));
    await screen.findByRole("checkbox",{name:"Select CU-OTHER"});expect(screen.getByRole("checkbox",{name:"Select CU-UNIT"})).toBeTruthy();
  });
  it("clears only the form and makes no claim to create a second reservation",async()=>{
    render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:"Clear reservation form"}));
    expect(screen.getByText(/Matching active reservations will still reopen/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));
    expect(await screen.findByText("Reservation form cleared. Existing reservations are unchanged.")).toBeTruthy();expect(mocks.reserve).not.toHaveBeenCalled();
    expect(screen.queryByRole("button",{name:"Start separate reservation"})).toBeNull();
  });
  it("labels resolved receiving work without claiming returned stock arrived at the partner",async()=>{
    mocks.get.mockResolvedValue({...dispatch,status:"Received",reserved:0,returnedQuarantine:1,receivedQuantity:null,units:[{...dispatch.units[0],status:"ReturnedQuarantine",receivingState:"Returned"}]});
    render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));
    expect(await screen.findByText(/Agreement SHOP-1 v1 · Receiving complete/)).toBeTruthy();
    expect(screen.getByText(/Receiving: 0 confirmed good at partner/)).toBeTruthy();
  });
  it("captures explicit Solo confirmation and partner acceptance evidence when approving own terms",async()=>{
    mocks.policy.mockResolvedValue({mode:"Solo",selfReviewerAdminUserId:"admin",selfReviewerName:"Founder",canSelfReview:true,updatedByAdminUserId:"admin",updatedAt:null,concurrencyToken:"p",eligibleReviewers:[],history:[]});
    const ready={...agreement,pendingTerms:[],signedAgreementReference:"PARTNER-SIGNED-TERMS",durationTerms:"One year",settlementFrequency:"Monthly"};
    mocks.agreements.mockResolvedValue({items:[ready],total:1});render(<ConsignmentPanel/>);
    await screen.findByText(/Authorized self-reviewer: Founder/);
    fireEvent.click(screen.getByRole("button",{name:"Approve agreement"}));
    expect(screen.getByText(/Duration: One year. Settlement: Monthly/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox",{name:/This is my own work/}));
    const confirm=screen.getByRole("button",{name:/^Confirm$/}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Self-review reason"),{target:{value:"Founder verified genuine partner acceptance"}});
    fireEvent.change(screen.getByLabelText("Self-review external evidence reference"),{target:{value:"PARTNER-SIGNED-TERMS"}});
    fireEvent.click(confirm);await waitFor(()=>expect(mocks.approve).toHaveBeenCalledWith(ready,"approve","PARTNER-SIGNED-TERMS",{confirmed:true,reason:"Founder verified genuine partner acceptance",externalEvidenceReference:"PARTNER-SIGNED-TERMS"}));
  });
  it("does not offer Solo attestation when the policy does not explicitly authorize the current operator",async()=>{
    mocks.policy.mockResolvedValue({mode:"Solo",selfReviewerName:"Another founder",canSelfReview:false,updatedAt:null,eligibleReviewers:[],history:[]});
    mocks.agreements.mockResolvedValue({items:[{...agreement,pendingTerms:[]}],total:1});render(<ConsignmentPanel/>);
    await screen.findByText(/Authorized self-reviewer: Another founder/);fireEvent.click(screen.getByRole("button",{name:"Approve agreement"}));
    expect(screen.queryByRole("checkbox",{name:/This is my own work/})).toBeNull();
  });
  it("displays historical Solo markers after returning to Team",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...agreement,status:"Active",approvalReviewMode:"Self-reviewed (Solo)"}],total:1});
    render(<ConsignmentPanel/>);expect(await screen.findByText("Self-reviewed (Solo)")).toBeTruthy();expect(screen.getAllByText("Team").length).toBeGreaterThan(0);
  });

  it("sends Solo receipt attestation only after the founder explicitly confirms it",async()=>{
    mocks.policy.mockResolvedValue({mode:"Solo",selfReviewerName:"Founder",canSelfReview:true,updatedAt:null,eligibleReviewers:[],history:[]});
    const shipped={...dispatch,status:"Dispatched",units:[{...dispatch.units[0],status:"Dispatched"}]};mocks.get.mockResolvedValue(shipped);
    render(<ConsignmentPanel/>);await screen.findByText(/Authorized self-reviewer: Founder/);fireEvent.click(screen.getByRole("button",{name:/MPL-CS-TEST-1/}));
    fireEvent.change(await screen.findByLabelText("Actual partner recipient"),{target:{value:"Synthetic Partner"}});
    fireEvent.change(screen.getByLabelText("Actual receipt date"),{target:{value:"2026-10-18T10:00"}});
    fireEvent.change(screen.getByLabelText("Signed receipt / evidence reference"),{target:{value:"PARTNER-COUNT-1"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-UNIT"),{target:{value:"Good"}});
    fireEvent.change(screen.getByLabelText("Action reason / acknowledgment / tracker entry reference"),{target:{value:"RECEIPT-1"}});
    fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));expect(mocks.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox",{name:/This is my own work/}));
    fireEvent.change(screen.getByLabelText("Self-review reason"),{target:{value:"Founder verified partner signed count"}});
    fireEvent.change(screen.getByLabelText("Self-review external evidence reference"),{target:{value:"PARTNER-COUNT-1"}});
    fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));
    await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(shipped,"receive","RECEIPT-1",[],expect.objectContaining({selfReview:{confirmed:true,reason:"Founder verified partner signed count",externalEvidenceReference:"PARTNER-COUNT-1"},receipt:expect.objectContaining({quantity:1,goodUnitIds:["unit"]})})));
  });

});
