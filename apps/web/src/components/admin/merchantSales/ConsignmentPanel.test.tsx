// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsignmentPanel } from "./ConsignmentPanel";
import { allAdminCapabilities, adminCapabilities, noAdminAccess } from "@/lib/adminCapabilities";
import type { Agreement, ConsignmentDispatch } from "@/services/adminConsignmentService";
const mocks=vi.hoisted(()=>({issueDeliveryOrder:vi.fn(),previewDeliveryOrder:vi.fn(),signatureStatus:vi.fn(),signatureImage:vi.fn(),defaults:vi.fn(),saveDefaults:vi.fn(),prefix:vi.fn(),savePrefix:vi.fn(),policy:vi.fn(),agreements:vi.fn(),dispatches:vi.fn(),get:vi.fn(),save:vi.fn(),act:vi.fn(),approve:vi.fn(),download:vi.fn(),access:vi.fn(),reserve:vi.fn(),catalog:vi.fn(),listing:vi.fn(),reconciliation:vi.fn(),reviewLog:vi.fn(),positions:vi.fn(),priceTerms:vi.fn(),salesReports:vi.fn(),salesReport:vi.fn(),saveReport:vi.fn(),reportAction:vi.fn(),savePrice:vi.fn(),priceAction:vi.fn(),startTracking:vi.fn(),copyPrices:vi.fn()}));
vi.mock("@/services/authService",()=>({getAdminCapabilities:mocks.access}));
vi.mock("@/services/adminMerchantSalesService",()=>({listMerchants:vi.fn(async()=>({items:[{id:"merchant",legalBusinessName:"First Pet Shop",tradingName:null}],total:1}))}));
vi.mock("@/services/merchantDirectoryService",()=>({getMerchantListing:mocks.listing}));
vi.mock("@/services/tagCatalogService",()=>({listAdminTagCatalogOptions:mocks.catalog}));
vi.mock("@/services/adminDocumentSignatureService",async(importOriginal)=>({...(await importOriginal<typeof import("@/services/adminDocumentSignatureService")>()),getDocumentSignature:mocks.signatureStatus,getDocumentSignatureImage:mocks.signatureImage}));
vi.mock("@/services/adminConsignmentService",()=>({getAgreementDocument:vi.fn(()=>new Promise(()=>{})),getApprovalPolicy:mocks.policy,listAgreements:mocks.agreements,listDispatches:mocks.dispatches,getDispatch:mocks.get,saveAgreement:mocks.save,getDefaultTerms:mocks.defaults,saveDefaultTerms:mocks.saveDefaults,getAgreementPrefix:mocks.prefix,saveAgreementPrefix:mocks.savePrefix,custodyAction:mocks.act,agreementAction:mocks.approve,downloadConsignment:mocks.download,issueDeliveryOrder:mocks.issueDeliveryOrder,previewDeliveryOrder:mocks.previewDeliveryOrder,reserveConsignment:mocks.reserve,downloadReconciliation:mocks.reconciliation,downloadReviewLog:mocks.reviewLog,listStockPositions:mocks.positions,listPriceTerms:mocks.priceTerms,listSalesReports:mocks.salesReports,getSalesReport:mocks.salesReport,saveSalesReport:mocks.saveReport,salesReportAction:mocks.reportAction,savePriceTerm:mocks.savePrice,priceTermAction:mocks.priceAction,startStockTracking:mocks.startTracking,copyPriceTerms:mocks.copyPrices,downloadSalesReports:vi.fn(),downloadStockLedger:vi.fn(),listStocktakes:vi.fn(async()=>({items:[],total:0})),listDiscrepancies:vi.fn(async()=>[]),getStocktake:vi.fn(),getStocktakeExpectation:vi.fn(),saveStocktake:vi.fn(),stocktakeAction:vi.fn(),resolveDiscrepancy:vi.fn(),downloadStocktakes:vi.fn()}));
const agreement: Agreement={id:"agreement",merchantId:"merchant",merchantName:"First Pet Shop",reference:"SHOP-1",version:1,status:"Draft",partnerCommissionPercentage:35,effectiveFrom:null,effectiveTo:null,durationTerms:null,settlementFrequency:null,paymentDeadlineDays:null,discountTerms:null,returnTerms:null,lossTerms:null,signedAgreementReference:null,externalTrackerReference:null,pendingTerms:["Duration","Payment deadline"],concurrencyToken:"agreement-token"};
const dispatch: ConsignmentDispatch={id:"dispatch",agreementId:"agreement",dispatchNumber:"MPL-CS-TEST-1",merchantName:"First Pet Shop",agreementReference:"SHOP-1",agreementVersion:1,commissionPercentage:35,destination:"Shop branch",status:"Reserved",externalTrackerReference:"TRACKER-1",dispatchedAt:null,receivedAt:null,shipmentReference:null,receiptAcknowledgment:null,reserved:1,partnerHeld:0,returnedQuarantine:0,released:0,externalHandovers:0,writtenOff:0,activatedWithoutExternalReference:0,units:[{id:"unit",unitReference:"CU-UNIT",receivingState:"Unconfirmed",tagCode:null,sku:"SKU-1",productName:"Smart Tag",variant:"Standard",batch:"B-1",status:"Reserved",qaStatus:"Passed",isActivated:false,externalReference:null,currentHandoverRecordId:null}],history:[],concurrencyToken:"stock-token",merchantBranchId:null,hasOpenDiscrepancy:false,hasIssuedDocument:false,recipientName:null,partnerReceivedAt:null,receivedQuantity:null,reconciliation:[]};
const ready={...agreement,pendingTerms:[],effectiveFrom:"2026-10-01T00:00:00Z",signedAgreementReference:"PARTNER-SIGNED-TERMS",durationTerms:"One year",settlementFrequency:"Monthly",paymentDeadlineDays:14,discountTerms:"None",returnTerms:"30 days",lossTerms:"Partner",externalTrackerReference:"TRACKER-1"};
const inactiveDefaults={revision:1,isActive:false,terms:{partnerCommissionPercentage:35,trialDurationDays:60,durationTerms:"Suggested",settlementFrequency:null,paymentDeadlineDays:null,discountTerms:null,returnTerms:null,lossTerms:null},missing:["Settlement frequency"],updatedAt:null,updatedByName:null,concurrencyToken:"defaults-token",history:[]};
const activeDefaults={...inactiveDefaults,revision:3,isActive:true,missing:[],updatedAt:"2026-10-19T00:00:00Z",updatedByName:"Synthetic Admin",terms:{partnerCommissionPercentage:30,trialDurationDays:60,durationTerms:"Synthetic 60-day trial",settlementFrequency:"Synthetic monthly",paymentDeadlineDays:7,discountTerms:"Synthetic approved prices",returnTerms:"Synthetic carry forward",lossTerms:"Synthetic evidence-based"}};
const shopPrefix={merchantId:"merchant",prefix:null,suggestedPrefix:"FIRSTPET",locked:false,lockedAt:null,referencePattern:"FIRSTPET-CONS-2026-",concurrencyToken:""};
beforeEach(()=>{mocks.policy.mockResolvedValue({mode:"Team",selfReviewerAdminUserId:null,selfReviewerName:null,canSelfReview:false,updatedByAdminUserId:null,updatedAt:null,concurrencyToken:"policy",eligibleReviewers:[],history:[]});window.history.replaceState(null,"","/");window.sessionStorage.clear();vi.clearAllMocks();mocks.access.mockReturnValue(allAdminCapabilities());mocks.signatureStatus.mockResolvedValue({signature:null,maxUploadBytes:2097152});mocks.signatureImage.mockResolvedValue(new Blob(["synthetic"],{type:"image/png"}));URL.createObjectURL=vi.fn(()=>"blob:synthetic-signature");URL.revokeObjectURL=vi.fn();mocks.catalog.mockResolvedValue([]);mocks.listing.mockResolvedValue({branches:[]});mocks.agreements.mockResolvedValue({items:[agreement],total:1});mocks.dispatches.mockResolvedValue({items:[dispatch],total:1});mocks.get.mockResolvedValue(dispatch);mocks.act.mockResolvedValue({...dispatch,status:"Dispatched"});mocks.positions.mockResolvedValue([]);mocks.defaults.mockResolvedValue(inactiveDefaults);mocks.prefix.mockResolvedValue(shopPrefix);mocks.priceTerms.mockResolvedValue([]);mocks.salesReports.mockResolvedValue({items:[],total:0});});
afterEach(cleanup);

const sections=()=>screen.getByRole("navigation",{name:"Consignment sections"});
function goTo(label: RegExp){fireEvent.click(within(sections()).getByRole("button",{name:label}));}
async function openAgreement(name=/SHOP-1 v1/){goTo(/^Agreements/);fireEvent.click(await screen.findByRole("button",{name:new RegExp(`Open agreement ${name.source}`)}));}
async function openDispatch(){goTo(/^Dispatches/);fireEvent.click(await screen.findByRole("button",{name:/MPL-CS-TEST-1/}));}

describe("Consignment operations",()=>{
  it("explains that delivery moves stock and verification records money owed, not an invoice or payment",async()=>{render(<ConsignmentPanel/>);const header=(await screen.findByRole("heading",{name:"Consignment"})).closest("header")!;expect(header.textContent).toMatch(/Delivering stock only moves it into the partner.s care/);expect(header.textContent).toMatch(/records what the partner owes for that period, and any sales commission waits as Pending/);expect(header.textContent).toMatch(/ready to pay only once that period is paid in full/);expect(header.textContent).toMatch(/Nothing here creates an invoice or records money received on its own/);expect(header.textContent).not.toMatch(/only a verified sales report does/);});
  it("keeps unconfirmed terms pending and prevents approval",async()=>{render(<ConsignmentPanel/>);await openAgreement();await screen.findByText(/Pending: Duration, Payment deadline/);expect((screen.getByRole("button",{name:"Approve agreement"}) as HTMLButtonElement).disabled).toBe(true);expect(mocks.approve).not.toHaveBeenCalled();});
  it("does not reveal tag codes or mutations with view permission only",async()=>{mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView])});render(<ConsignmentPanel/>);await openDispatch();await screen.findByText("CU-UNIT");expect(screen.queryByRole("button",{name:"View Tag Codes"})).toBeNull();expect(screen.queryByRole("button",{name:"Confirm dispatch"})).toBeNull();expect(screen.queryByRole("button",{name:"New agreement"})).toBeNull();expect(screen.queryByRole("button",{name:"Reserve stock"})).toBeNull();expect(mocks.get).toHaveBeenCalledWith("dispatch");});
  it("requires confirmation and submits current token without financial fields",async()=>{render(<ConsignmentPanel/>);await openDispatch();fireEvent.change(await screen.findByLabelText("Courier or shipment reference"),{target:{value:"SHIP-1"}});fireEvent.click(screen.getByRole("button",{name:"Confirm dispatch"}));expect(mocks.act).not.toHaveBeenCalled();expect(screen.getByText(/creates no invoice, sale or commission/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(dispatch,"dispatch","SHIP-1",[],{}));});
  it("reveals a controlled manifest only after explicit action",async()=>{render(<ConsignmentPanel/>);await openDispatch();await screen.findByText("CU-UNIT");expect(mocks.get).not.toHaveBeenCalledWith("dispatch",true);mocks.get.mockResolvedValue({...dispatch,units:[{...dispatch.units[0],tagCode:"MPL-CODE-TEST"}]});fireEvent.click(screen.getByRole("button",{name:"View Tag Codes"}));await screen.findByText("MPL-CODE-TEST");expect(mocks.get).toHaveBeenCalledWith("dispatch",true);});
  it("shows failures without a success message and offers refresh",async()=>{mocks.dispatches.mockRejectedValue(new Error("Connection unavailable"));render(<ConsignmentPanel/>);await screen.findByRole("alert");expect(screen.getByText(/Connection unavailable/)).toBeTruthy();expect(screen.getByRole("button",{name:"Refresh records"})).toBeTruthy();expect(screen.queryByText("Changes recorded.")).toBeNull();});
  it("does not let an agreement editor approve without the separate capability",async()=>{
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView,adminCapabilities.consignmentAgreementsManage])});
    render(<ConsignmentPanel/>);await openAgreement();expect(await screen.findByRole("button",{name:"Edit draft"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Approve agreement"})).toBeNull();expect(screen.queryByRole("button",{name:"Close agreement"})).toBeNull();
  });
  it("keeps a cleared commission blank and formats the complementary share",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...agreement,partnerCommissionPercentage:35.15}],total:1});render(<ConsignmentPanel/>);
    goTo(/^Agreements/);await screen.findByText(/MyPetLink 64.85%/);fireEvent.click(screen.getByRole("button",{name:/Open agreement SHOP-1 v1/}));fireEvent.click(await screen.findByRole("button",{name:"Edit draft"}));
    expect((screen.getByLabelText("Agreement reference") as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    const rate=screen.getByLabelText("Partner commission (%)") as HTMLInputElement;expect(rate.value).toBe("35.15");fireEvent.change(rate,{target:{value:""}});expect(rate.value).toBe("");
  });
  it("requires receiving fields before offering receipt confirmation",async()=>{
    const shipped={...dispatch,status:"Dispatched",hasIssuedDocument:true};mocks.get.mockResolvedValue(shipped);render(<ConsignmentPanel/>);
    await openDispatch();await screen.findByLabelText("Actual partner recipient");
    fireEvent.change(screen.getByLabelText("Receipt acknowledgment reference"),{target:{value:"x"}});fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));
    expect(screen.getByRole("alert").textContent).toContain("actual recipient");expect(mocks.act).not.toHaveBeenCalled();
  });
  it("downloads an issued non-sensitive note for a viewer without exposing codes",async()=>{
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView])});mocks.get.mockResolvedValue({...dispatch,hasIssuedDocument:true,status:"Dispatched"});
    render(<ConsignmentPanel/>);await openDispatch();fireEvent.click(await screen.findByRole("button",{name:"Download Dispatch Note"}));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledWith("dispatch","dispatch-note.pdf"));expect(screen.queryByRole("button",{name:"View Tag Codes"})).toBeNull();
  });
  it("generates a Delivery Order once for a dispatched delivery and then offers it for download",async()=>{
    const shipped={...dispatch,status:"Dispatched",dispatchedAt:"2026-10-23T02:00:00Z",hasIssuedDocument:true,units:[{...dispatch.units[0],status:"Dispatched"}]};
    const order={id:"do",deliveryOrderNumber:"MPL-DO-261023-0001",issuedAt:"2026-10-23T03:00:00Z",deliveredQuantity:1,fileName:"MyPetLink_Delivery_Order_MPL-DO-261023-0001.pdf",issuedByName:"Synthetic Admin"};
    mocks.get.mockResolvedValue(shipped);mocks.issueDeliveryOrder.mockResolvedValue(order);
    render(<ConsignmentPanel/>);await openDispatch();
    fireEvent.click(await screen.findByRole("button",{name:"Generate DO"}));
    expect(mocks.issueDeliveryOrder).not.toHaveBeenCalled();expect(screen.getByText(/No stock is moved/)).toBeTruthy();
    mocks.get.mockResolvedValue({...shipped,deliveryOrder:order});
    const buttons=screen.getAllByRole("button",{name:"Generate DO"});fireEvent.click(buttons[buttons.length-1]);
    await waitFor(()=>expect(mocks.issueDeliveryOrder).toHaveBeenCalledWith("dispatch"));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledWith("dispatch","delivery-order.pdf"));
    await screen.findByText("Delivery Order MPL-DO-261023-0001 generated and downloaded.");
    expect(await screen.findByRole("button",{name:"Download DO"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Generate DO"})).toBeNull();
    expect(screen.getByText(/MPL-DO-261023-0001 · 1 tag · generated/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Download DO"}));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledTimes(2));expect(mocks.issueDeliveryOrder).toHaveBeenCalledTimes(1);
  });
  it("signs Delivered By with the operator's own signature only after a preview and explicit confirmation",async()=>{
    const shipped={...dispatch,status:"Dispatched",dispatchedAt:"2026-10-23T02:00:00Z",units:[{...dispatch.units[0],status:"Dispatched"}]};
    const order={id:"do",deliveryOrderNumber:"MPL-DO-261024-0001",issuedAt:"2026-10-24T03:00:00Z",deliveredQuantity:1,fileName:"x.pdf",issuedByName:"Synthetic Admin",signatoryName:"Synthetic Signatory",signatoryPosition:"Director",signedAt:"2026-10-24T03:00:00Z"};
    mocks.signatureStatus.mockResolvedValue({signature:{id:"sig",signatoryName:"Synthetic Signatory",signatoryPosition:"Director",imageWidth:300,imageHeight:100,savedAt:"2026-10-24T01:00:00Z"},maxUploadBytes:2097152});
    mocks.get.mockResolvedValue(shipped);mocks.issueDeliveryOrder.mockResolvedValue(order);mocks.previewDeliveryOrder.mockResolvedValue(undefined);
    render(<ConsignmentPanel/>);await openDispatch();
    fireEvent.click(await screen.findByRole("button",{name:"Generate DO"}));
    const sign=await screen.findByRole("radio",{name:/Sign Delivered By with my signature/}) as HTMLInputElement;
    await waitFor(()=>expect(sign.disabled).toBe(false));
    // Unsigned is the default every time the dialog opens.
    expect((screen.getByRole("radio",{name:/Leave unsigned/}) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(sign);
    expect(screen.getByRole("img",{name:"Your signature"})).toBeTruthy();
    expect((screen.getByRole("button",{name:"Sign and generate DO"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Preview signed DO"}));
    await waitFor(()=>expect(mocks.previewDeliveryOrder).toHaveBeenCalledWith("dispatch","sig"));
    expect(mocks.issueDeliveryOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox",{name:/I, Synthetic Signatory, am signing this Delivery Order as Director/}));
    mocks.get.mockResolvedValue({...shipped,deliveryOrder:order});
    fireEvent.click(screen.getByRole("button",{name:"Sign and generate DO"}));
    await waitFor(()=>expect(mocks.issueDeliveryOrder).toHaveBeenCalledWith("dispatch",{signatureId:"sig",confirmed:true}));
    await screen.findByText("Delivery Order MPL-DO-261024-0001 signed, generated and downloaded.");
    expect(screen.getByText(/Delivered By signed by Synthetic Signatory, Director/)).toBeTruthy();
    expect(mocks.issueDeliveryOrder).toHaveBeenCalledTimes(1);
  });
  it("generates unsigned when no signature is on file or signing is not permitted",async()=>{
    const shipped={...dispatch,status:"Dispatched",dispatchedAt:"2026-10-23T02:00:00Z",units:[{...dispatch.units[0],status:"Dispatched"}]};
    const order={id:"do",deliveryOrderNumber:"MPL-DO-261024-0002",issuedAt:"2026-10-24T03:00:00Z",deliveredQuantity:1,fileName:"x.pdf",issuedByName:null};
    mocks.get.mockResolvedValue(shipped);mocks.issueDeliveryOrder.mockResolvedValue(order);mocks.previewDeliveryOrder.mockResolvedValue(undefined);
    render(<ConsignmentPanel/>);await openDispatch();
    fireEvent.click(await screen.findByRole("button",{name:"Generate DO"}));
    await screen.findByText(/You don’t have a signature on file/);
    expect((screen.getByRole("radio",{name:/Sign Delivered By with my signature/}) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Preview DO"}));
    await waitFor(()=>expect(mocks.previewDeliveryOrder).toHaveBeenCalledWith("dispatch",undefined));
    cleanup();vi.clearAllMocks();
    // Dispatching without the signing permission: no signing choice at all, and no signature is looked up.
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView,adminCapabilities.consignmentDispatch])});
    mocks.policy.mockResolvedValue({mode:"Team",selfReviewerAdminUserId:null,selfReviewerName:null,canSelfReview:false,updatedByAdminUserId:null,updatedAt:null,concurrencyToken:"policy",eligibleReviewers:[],history:[]});
    mocks.agreements.mockResolvedValue({items:[agreement],total:1});mocks.dispatches.mockResolvedValue({items:[dispatch],total:1});mocks.positions.mockResolvedValue([]);
    mocks.get.mockResolvedValue(shipped);mocks.issueDeliveryOrder.mockResolvedValue(order);
    render(<ConsignmentPanel/>);await openDispatch();
    fireEvent.click(await screen.findByRole("button",{name:"Generate DO"}));
    await screen.findByText(/left blank for both parties to sign by hand/);
    expect(screen.queryByRole("radio",{name:/Sign Delivered By/})).toBeNull();expect(mocks.signatureStatus).not.toHaveBeenCalled();
    const buttons=screen.getAllByRole("button",{name:"Generate DO"});fireEvent.click(buttons[buttons.length-1]);
    await waitFor(()=>expect(mocks.issueDeliveryOrder).toHaveBeenCalledWith("dispatch"));
  });
  it("never offers a Delivery Order for a reservation, and only dispatchers can generate one",async()=>{
    render(<ConsignmentPanel/>);await openDispatch();await screen.findByText("CU-UNIT");
    expect(screen.queryByRole("button",{name:"Generate DO"})).toBeNull();expect(screen.queryByRole("button",{name:"Download DO"})).toBeNull();
    cleanup();
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView])});
    const shipped={...dispatch,status:"Dispatched",dispatchedAt:"2026-10-23T02:00:00Z"};mocks.get.mockResolvedValue(shipped);
    render(<ConsignmentPanel/>);await openDispatch();await screen.findByText("CU-UNIT");
    expect(screen.queryByRole("button",{name:"Generate DO"})).toBeNull();
    cleanup();
    mocks.get.mockResolvedValue({...shipped,deliveryOrder:{id:"do",deliveryOrderNumber:"MPL-DO-261023-0002",issuedAt:"2026-10-23T03:00:00Z",deliveredQuantity:1,fileName:"x.pdf",issuedByName:null}});
    render(<ConsignmentPanel/>);await openDispatch();fireEvent.click(await screen.findByRole("button",{name:"Download DO"}));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledWith("dispatch","delivery-order.pdf"));expect(mocks.issueDeliveryOrder).not.toHaveBeenCalled();
  });
  it("restores an open dispatch from its link and retains a pending discrepancy",async()=>{
    window.history.replaceState(null,"","/?tab=consignment&dispatch=dispatch");mocks.get.mockResolvedValue({...dispatch,status:"Dispatched",hasOpenDiscrepancy:true});
    render(<ConsignmentPanel/>);await screen.findByText(/Delivery discrepancy remains open/);expect(mocks.get).toHaveBeenCalledWith("dispatch");
    expect(screen.getByRole("button",{name:"Review selected discrepancy outcomes"})).toBeTruthy();
    expect(within(sections()).getByRole("button",{name:/^Dispatches/}).getAttribute("aria-current")).toBe("page");
  });
  it("reuses the submission reference after a full component remount",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...ready,status:"Active"}],total:1});
    mocks.catalog.mockResolvedValue([{name:"Smart Tag",variants:[{id:"sku",sku:"SKU-1",displayName:"Standard",isActive:true,supportsQr:true,supportsNfc:true}]}]);
    mocks.listing.mockResolvedValue({branches:[{id:"branch",name:"Shop branch",isActive:true,address:{addressLine1:"1 Street",addressLine2:null,postcode:"50000",city:"KL",state:"KL",country:"Malaysia"}}]});
    mocks.reserve.mockResolvedValue({...dispatch,reservationReused:true});
    async function submit(){
      const before=mocks.reserve.mock.calls.length;
      fireEvent.click(screen.getAllByRole("button",{name:"Reserve stock"})[0]);
      await screen.findByRole("option",{name:"First Pet Shop · SHOP-1 v1"});
      fireEvent.change(screen.getByLabelText("Approved agreement"),{target:{value:"agreement"}});
      await screen.findByRole("option",{name:"Shop branch"});fireEvent.change(screen.getByLabelText("Delivery branch"),{target:{value:"branch"}});
      await waitFor(()=>expect(screen.getByRole("option",{name:/Smart Tag · SKU-1/})).toBeTruthy());
      fireEvent.change(screen.getByLabelText("Tag option 1"),{target:{value:"sku"}});fireEvent.change(screen.getByLabelText("External tracker reference"),{target:{value:"TRACKER"}});
      fireEvent.click(screen.getByRole("button",{name:"Review reservation"}));expect(mocks.reserve).toHaveBeenCalledTimes(before);
      expect(screen.getByText(/100 tags will leave central availability/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Reserve tags"}));
    }
    const first=render(<ConsignmentPanel/>);await submit();await waitFor(()=>expect(mocks.reserve).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Existing reservation MPL-CS-TEST-1 reopened. No additional tags were reserved/)).toBeTruthy();
    expect(screen.queryByText("Changes recorded.")).toBeNull();
    const key=mocks.reserve.mock.calls[0][0].idempotencyKey;first.unmount();render(<ConsignmentPanel/>);await submit();
    await waitFor(()=>expect(mocks.reserve).toHaveBeenCalledTimes(2));expect(mocks.reserve.mock.calls[1][0].idempotencyKey).toBe(key);
  });
  it("submits truthful unit findings for a partial receipt and displays derived counts",async()=>{
    const shipped={...dispatch,status:"Dispatched",units:[{...dispatch.units[0],status:"Dispatched"},{...dispatch.units[0],id:"missing",unitReference:"CU-MISSING",status:"Dispatched"}]};
    mocks.get.mockResolvedValue(shipped);render(<ConsignmentPanel/>);await openDispatch();
    fireEvent.change(await screen.findByLabelText("Actual partner recipient"),{target:{value:"Synthetic Recipient"}});
    fireEvent.change(screen.getByLabelText("Actual receipt date"),{target:{value:"2026-10-17T10:00"}});
    fireEvent.change(screen.getByLabelText("Signed receipt / evidence reference"),{target:{value:"SIGNED-RECEIPT"}});
    fireEvent.change(screen.getByLabelText("Receipt acknowledgment reference"),{target:{value:"RX-PARTIAL-1"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-UNIT"),{target:{value:"Good"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-MISSING"),{target:{value:"Missing"}});
    expect(screen.getByText(/1 counted \(including 0 damaged\), 1 missing, 0 physically returned/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));
    await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(shipped,"receive","RX-PARTIAL-1",[],{receipt:expect.objectContaining({quantity:1,damagedQuantity:0,missingQuantity:1,goodUnitIds:["unit"],missingUnitIds:["missing"],returnedUnitIds:[]})}));
  });
  it("separates history fields and keeps stable unit references after sorting changes",async()=>{
    const record={...dispatch,status:"Dispatched",units:[{...dispatch.units[0],status:"Dispatched"}],history:[{action:"receive",reference:"RX-REFERENCE",occurredAt:"2026-10-17T10:00:00Z",unitId:"unit",actorAdminUserId:"admin",actorName:"Operator",evidenceJson:JSON.stringify({Recipient:"Synthetic Recipient",Quantity:1,DamagedQuantity:0,MissingQuantity:0,SignedEvidenceReference:"SIGNED"})}]};
    mocks.get.mockResolvedValue(record);render(<ConsignmentPanel/>);await openDispatch();
    const history=await screen.findByText(/Reference RX-REFERENCE/);expect(history.textContent).toContain("CU-UNIT · Operator");
    expect(screen.getByText(/Synthetic Recipient: 1 counted, 0 damaged, 0 missing · SIGNED/)).toBeTruthy();
    expect(screen.getByRole("checkbox",{name:"Select CU-UNIT"})).toBeTruthy();expect(screen.queryByText("Unit 1")).toBeNull();
    mocks.get.mockResolvedValue({...record,units:[{...record.units[0],id:"other",unitReference:"CU-OTHER"},record.units[0]]});
    fireEvent.click(screen.getByRole("button",{name:"View Tag Codes"}));
    await screen.findByRole("checkbox",{name:"Select CU-OTHER"});expect(screen.getByRole("checkbox",{name:"Select CU-UNIT"})).toBeTruthy();
  });
  it("clears only the form and makes no claim to create a second reservation",async()=>{
    render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:"Reserve stock"}));fireEvent.click(screen.getByRole("button",{name:"Clear reservation form"}));
    expect(screen.getByText(/Matching active reservations will still reopen/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Clear form"}));
    expect(await screen.findByText("Reservation form cleared. Existing reservations are unchanged.")).toBeTruthy();expect(mocks.reserve).not.toHaveBeenCalled();
    expect(screen.queryByRole("button",{name:"Start separate reservation"})).toBeNull();
  });
  it("labels resolved receiving work without claiming returned stock arrived at the partner",async()=>{
    mocks.get.mockResolvedValue({...dispatch,status:"Received",reserved:0,returnedQuarantine:1,receivedQuantity:null,units:[{...dispatch.units[0],status:"ReturnedQuarantine",receivingState:"Returned"}]});
    render(<ConsignmentPanel/>);await openDispatch();
    expect(await screen.findByText("Receiving complete")).toBeTruthy();
    expect(screen.getByText(/Receiving: 0 confirmed good at partner/)).toBeTruthy();
  });
  it("captures explicit Solo confirmation and partner acceptance evidence when approving own terms",async()=>{
    mocks.policy.mockResolvedValue({mode:"Solo",selfReviewerAdminUserId:"admin",selfReviewerName:"Founder",canSelfReview:true,updatedByAdminUserId:"admin",updatedAt:null,concurrencyToken:"p",eligibleReviewers:[],history:[]});
    mocks.agreements.mockResolvedValue({items:[ready],total:1});render(<ConsignmentPanel/>);
    await screen.findByText(/Authorized self-reviewer: Founder/);
    await openAgreement();fireEvent.click(await screen.findByRole("button",{name:"Approve agreement"}));
    const dialog=screen.getByRole("dialog");expect(within(dialog).getByText("One year")).toBeTruthy();expect(within(dialog).getByText("Monthly")).toBeTruthy();
    expect(within(dialog).getByText(/not the partner’s signature/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox",{name:/This is my own work/}));
    const confirm=screen.getByRole("button",{name:/^Approve$/}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Self-review reason"),{target:{value:"Founder verified genuine partner acceptance"}});
    fireEvent.change(screen.getByLabelText("Self-review external evidence reference"),{target:{value:"PARTNER-SIGNED-TERMS"}});
    fireEvent.click(confirm);await waitFor(()=>expect(mocks.approve).toHaveBeenCalledWith(ready,"approve","PARTNER-SIGNED-TERMS",{confirmed:true,reason:"Founder verified genuine partner acceptance",externalEvidenceReference:"PARTNER-SIGNED-TERMS"}));
  });
  it("does not offer Solo attestation when the policy does not explicitly authorize the current operator",async()=>{
    mocks.policy.mockResolvedValue({mode:"Solo",selfReviewerName:"Another founder",canSelfReview:false,updatedAt:null,eligibleReviewers:[],history:[]});
    mocks.agreements.mockResolvedValue({items:[ready],total:1});render(<ConsignmentPanel/>);
    await screen.findByText(/Authorized self-reviewer: Another founder/);await openAgreement();fireEvent.click(await screen.findByRole("button",{name:"Approve agreement"}));
    expect(screen.queryByRole("checkbox",{name:/This is my own work/})).toBeNull();
  });
  it("displays historical Solo markers after returning to Team",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...agreement,status:"Active",approvalReviewMode:"Self-reviewed (Solo)"}],total:1});
    render(<ConsignmentPanel/>);expect((await screen.findAllByText("Team")).length).toBeGreaterThan(0);
    goTo(/^Agreements/);expect(await screen.findByText("Self-reviewed (Solo)")).toBeTruthy();
  });

  it("sends Solo receipt attestation only after the founder explicitly confirms it",async()=>{
    mocks.policy.mockResolvedValue({mode:"Solo",selfReviewerName:"Founder",canSelfReview:true,updatedAt:null,eligibleReviewers:[],history:[]});
    const shipped={...dispatch,status:"Dispatched",units:[{...dispatch.units[0],status:"Dispatched"}]};mocks.get.mockResolvedValue(shipped);
    render(<ConsignmentPanel/>);await screen.findByText(/Authorized self-reviewer: Founder/);await openDispatch();
    fireEvent.change(await screen.findByLabelText("Actual partner recipient"),{target:{value:"Synthetic Partner"}});
    fireEvent.change(screen.getByLabelText("Actual receipt date"),{target:{value:"2026-10-18T10:00"}});
    fireEvent.change(screen.getByLabelText("Signed receipt / evidence reference"),{target:{value:"PARTNER-COUNT-1"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-UNIT"),{target:{value:"Good"}});
    fireEvent.change(screen.getByLabelText("Receipt acknowledgment reference"),{target:{value:"RECEIPT-1"}});
    fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));expect(mocks.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox",{name:/This is my own work/}));
    fireEvent.change(screen.getByLabelText("Self-review reason"),{target:{value:"Founder verified partner signed count"}});
    fireEvent.change(screen.getByLabelText("Self-review external evidence reference"),{target:{value:"PARTNER-COUNT-1"}});
    fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));
    await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(shipped,"receive","RECEIPT-1",[],expect.objectContaining({selfReview:{confirmed:true,reason:"Founder verified partner signed count",externalEvidenceReference:"PARTNER-COUNT-1"},receipt:expect.objectContaining({quantity:1,goodUnitIds:["unit"]})})));
  });
});

describe("Consignment workspace navigation",()=>{
  it("opens on the overview and keeps the chosen section in the URL",async()=>{
    render(<ConsignmentPanel/>);
    expect(await screen.findByTestId("consignment-overview")).toBeTruthy();
    expect(within(sections()).getByRole("button",{name:/^Overview/}).getAttribute("aria-current")).toBe("page");
    goTo(/^Stocktake & reconciliation/);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("reconciliation");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("consignment");
    expect(screen.getByText("Partner-reported sales are unverified")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Download reconciliation records"})).toBeTruthy();
    goTo(/^Settings/);
    expect(await screen.findByRole("region",{name:"Consignment approval policy"})).toBeTruthy();
    expect(screen.queryByText("Partner-reported sales are unverified")).toBeNull();
  });
  it("follows Back and Forward through the browser history",async()=>{
    render(<ConsignmentPanel/>);await screen.findByTestId("consignment-overview");
    act(()=>{window.history.pushState(null,"","/?tab=consignment&view=settings");window.dispatchEvent(new PopStateEvent("popstate"));});
    expect(await screen.findByRole("region",{name:"Consignment approval policy"})).toBeTruthy();
    act(()=>{window.history.pushState(null,"","/?tab=consignment&view=overview");window.dispatchEvent(new PopStateEvent("popstate"));});
    expect(await screen.findByTestId("consignment-overview")).toBeTruthy();
  });
  it("keeps policy configuration out of the main views and only in Settings",async()=>{
    render(<ConsignmentPanel/>);await screen.findByTestId("consignment-overview");
    expect(screen.queryByLabelText("New approval mode")).toBeNull();
    expect(screen.queryByLabelText(/closure reason/i)).toBeNull();
    goTo(/^Settings/);expect(await screen.findByLabelText("New approval mode")).toBeTruthy();
  });
  it("hides restricted exports from operators without export permission",async()=>{
    mocks.access.mockReturnValue({...noAdminAccess,granted:new Set([adminCapabilities.consignmentView])});
    render(<ConsignmentPanel/>);goTo(/^Stocktake & reconciliation/);
    expect(await screen.findByText(/don’t have permission to download reconciliation exports/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Download reconciliation records"})).toBeNull();
  });
  it("reports overview totals only from complete records",async()=>{
    mocks.dispatches.mockResolvedValue({items:[{...dispatch,status:"Dispatched",partnerHeld:4}],total:250});
    mocks.agreements.mockResolvedValue({items:[{...ready,status:"Active"}],total:1});
    render(<ConsignmentPanel/>);
    const held=(await screen.findByText("Tags held by partners")).parentElement!;
    expect(held.textContent).toContain("—");expect(held.textContent).toContain("Too many records to total here");
    const active=screen.getByText("Active partner agreements").parentElement!;expect(active.textContent).toContain("1");
  });
});

describe("Contextual consignment actions",()=>{
  it("offers reservation, revision and closure only for an active agreement, and closure needs a reason",async()=>{
    const live={...ready,status:"Active"};mocks.agreements.mockResolvedValue({items:[live],total:1});mocks.approve.mockResolvedValue({...live,status:"Closed"});
    render(<ConsignmentPanel/>);await openAgreement();
    const header=(await screen.findByRole("heading",{name:/SHOP-1 · version 1/})).closest("section")!;
    expect(within(header).getByRole("button",{name:"Reserve stock"})).toBeTruthy();
    expect(within(header).getByRole("button",{name:"Create new version"})).toBeTruthy();
    expect(within(header).queryByRole("button",{name:"Edit draft"})).toBeNull();
    expect(within(header).queryByRole("button",{name:"Approve agreement"})).toBeNull();
    fireEvent.click(within(header).getByRole("button",{name:"Close agreement"}));
    const confirm=screen.getByRole("button",{name:"Confirm closure"}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for closing"),{target:{value:"Partner stopped trading"}});expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);await waitFor(()=>expect(mocks.approve).toHaveBeenCalledWith(live,"close","Partner stopped trading"));
  });
  it("offers no further agreement actions on a closed version except a new version",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...ready,status:"Closed"}],total:1});
    render(<ConsignmentPanel/>);await openAgreement();
    expect(await screen.findByRole("button",{name:"Create new version"})).toBeTruthy();
    for(const name of ["Close agreement","Approve agreement","Edit draft","Reserve stock"])expect(screen.queryAllByRole("button",{name}).filter(b=>b.closest("section")?.getAttribute("aria-labelledby")==="agreement-title")).toHaveLength(0);
  });
  it("shows only dispatch actions for a reservation, and only receipt actions once dispatched",async()=>{
    render(<ConsignmentPanel/>);await openDispatch();
    expect(await screen.findByRole("button",{name:"Confirm dispatch"})).toBeTruthy();
    expect(screen.getByRole("button",{name:"Cancel reservation"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Acknowledge receipt"})).toBeNull();
    expect(screen.queryByText("Record a stock movement")).toBeNull();
    expect(screen.queryByRole("checkbox",{name:"Select CU-UNIT"})).toBeNull();
    cleanup();
    mocks.get.mockResolvedValue({...dispatch,status:"Dispatched",units:[{...dispatch.units[0],status:"Dispatched"}]});
    render(<ConsignmentPanel/>);await openDispatch();
    expect(await screen.findByRole("button",{name:"Acknowledge receipt"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Confirm dispatch"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Review selected discrepancy outcomes"})).toBeNull();
  });
  it("cancels a reservation only with a recorded reason",async()=>{
    mocks.act.mockResolvedValue({...dispatch,status:"Cancelled"});
    render(<ConsignmentPanel/>);await openDispatch();fireEvent.click(await screen.findByRole("button",{name:"Cancel reservation"}));
    const dialog=screen.getByRole("dialog");const confirm=within(dialog).getByRole("button",{name:"Cancel reservation"}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Reason for cancelling"),{target:{value:"Partner postponed"}});fireEvent.click(confirm);
    await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(dispatch,"cancel","Partner postponed",[],{}));
  });
  it("records a stock movement only for chosen units with a reference",async()=>{
    const held={...dispatch,status:"Received",partnerHeld:1,units:[{...dispatch.units[0],status:"Received",receivingState:"Good"}]};mocks.get.mockResolvedValue(held);mocks.act.mockResolvedValue(held);
    render(<ConsignmentPanel/>);await openDispatch();fireEvent.click(await screen.findByRole("radio",{name:/Receive returned tags/}));
    const submit=screen.getByRole("button",{name:"Receive selected returns"}) as HTMLButtonElement;expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox",{name:"Select CU-UNIT"}));expect(submit.disabled).toBe(false);
    fireEvent.click(submit);expect(screen.getByRole("alert").textContent).toContain("reason or tracker entry reference");
    fireEvent.change(screen.getByLabelText("Reason or tracker entry reference"),{target:{value:"RETURN-1"}});fireEvent.click(submit);
    fireEvent.click(screen.getByRole("button",{name:/^Confirm$/}));await waitFor(()=>expect(mocks.act).toHaveBeenCalledWith(held,"return","RETURN-1",["unit"],{}));
  });
  it("refuses a receipt dated before dispatch before sending it",async()=>{
    mocks.get.mockResolvedValue({...dispatch,status:"Dispatched",dispatchedAt:"2026-10-17T12:00:00Z",units:[{...dispatch.units[0],status:"Dispatched"}]});
    render(<ConsignmentPanel/>);await openDispatch();
    fireEvent.change(await screen.findByLabelText("Actual partner recipient"),{target:{value:"Synthetic Partner"}});
    fireEvent.change(screen.getByLabelText("Actual receipt date"),{target:{value:"2026-10-16T10:00"}});
    fireEvent.change(screen.getByLabelText("Signed receipt / evidence reference"),{target:{value:"PARTNER-COUNT-1"}});
    fireEvent.change(screen.getByLabelText("Receiving finding for CU-UNIT"),{target:{value:"Good"}});
    fireEvent.change(screen.getByLabelText("Receipt acknowledgment reference"),{target:{value:"RECEIPT-1"}});
    expect(screen.getByText(/On or after dispatch:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Acknowledge receipt"}));
    expect(screen.getByRole("alert").textContent).toContain("must be on or after dispatch");
    expect(screen.queryByRole("dialog")).toBeNull();expect(mocks.act).not.toHaveBeenCalled();
  });
  it("shows a refused reservation inside the open dialog and keeps the entries",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...ready,status:"Active"}],total:1});
    mocks.catalog.mockResolvedValue([{name:"Smart Tag",variants:[{id:"sku",sku:"SKU-1",displayName:"Standard",isActive:true,supportsQr:true,supportsNfc:true}]}]);
    mocks.listing.mockResolvedValue({branches:[{id:"branch",name:"Shop branch",isActive:true,address:{addressLine1:"1 Street",addressLine2:null,postcode:"50000",city:"KL",state:"KL",country:"Malaysia"}}]});
    mocks.reserve.mockRejectedValue(new Error("There are not enough eligible inspected tags for this allocation."));
    render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:"Reserve stock"}));
    await screen.findByRole("option",{name:"First Pet Shop · SHOP-1 v1"});fireEvent.change(screen.getByLabelText("Approved agreement"),{target:{value:"agreement"}});
    await screen.findByRole("option",{name:"Shop branch"});fireEvent.change(screen.getByLabelText("Delivery branch"),{target:{value:"branch"}});
    await waitFor(()=>expect(screen.getByRole("option",{name:/Smart Tag · SKU-1/})).toBeTruthy());fireEvent.change(screen.getByLabelText("Tag option 1"),{target:{value:"sku"}});
    fireEvent.click(screen.getByRole("button",{name:"Review reservation"}));fireEvent.click(screen.getByRole("button",{name:"Reserve tags"}));
    const dialog=screen.getByRole("dialog");
    expect((await within(dialog).findByRole("alert")).textContent).toContain("not enough eligible inspected tags");
    expect(within(dialog).getByText(/Nothing was reserved; your entries are kept/)).toBeTruthy();
    expect(screen.queryByTestId("admin-operation-notice")).toBeNull();
    expect(within(dialog).getByRole("button",{name:"Reserve tags"})).toBeTruthy();
  });
});

describe("Agreement wizard",()=>{
  async function startWizard(){render(<ConsignmentPanel/>);fireEvent.click(await screen.findByRole("button",{name:"New agreement"}));await screen.findByRole("option",{name:"First Pet Shop"});}
  it("validates each step inline and keeps entries when moving back and forward",async()=>{
    await startWizard();
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByText("Choose the partner merchant.")).toBeTruthy();expect(screen.queryByLabelText("Agreement reference")).toBeNull();
    fireEvent.change(screen.getByLabelText("Merchant"),{target:{value:"merchant"}});
    expect(await screen.findByText("FIRSTPET-CONS-2026-…")).toBeTruthy();expect(screen.getByText(/Agreement reference will be generated when you save this draft/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByText(/No default terms are in use yet/)).toBeTruthy();
    const rate=screen.getByLabelText("Partner commission (%)") as HTMLInputElement;expect(rate.value).toBe("");
    expect(screen.queryByRole("button",{name:/proposed initial rate/})).toBeNull();
    fireEvent.change(screen.getByLabelText("Duration and renewal terms"),{target:{value:"Twelve months"}});
    fireEvent.change(screen.getByLabelText("Effective start"),{target:{value:"2026-11-01"}});
    fireEvent.change(screen.getByLabelText("Effective end"),{target:{value:"2026-10-01"}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByText("Enter the partner commission agreed for this version.")).toBeTruthy();expect(screen.getByText("The end date must be after the start date.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Back"}));expect((screen.getByLabelText("Merchant") as HTMLSelectElement).value).toBe("merchant");
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));expect((screen.getByLabelText("Duration and renewal terms") as HTMLInputElement).value).toBe("Twelve months");
    fireEvent.change(screen.getByLabelText("Partner commission (%)"),{target:{value:"35"}});
    fireEvent.change(screen.getByLabelText("Effective end"),{target:{value:""}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByText("Still to agree before approval")).toBeTruthy();expect(screen.getByText(/Signed agreement reference/)).toBeTruthy();
    expect(screen.getByText(/reference generated when you save/)).toBeTruthy();
  });
  it("keeps every entry after a failed save, then retries the same creation and shows the generated reference",async()=>{
    mocks.save.mockRejectedValueOnce(new Error("We couldn't connect right now. Please try again in a moment."));
    await startWizard();
    fireEvent.change(screen.getByLabelText("Merchant"),{target:{value:"merchant"}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    fireEvent.change(screen.getByLabelText("Partner commission (%)"),{target:{value:"30"}});fireEvent.change(screen.getByLabelText("Settlement frequency"),{target:{value:"Monthly"}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));fireEvent.click(screen.getByRole("button",{name:"Save draft"}));
    expect((await screen.findByRole("alert")).textContent).toContain("Your entries are kept");
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    expect((screen.getByLabelText("Settlement frequency") as HTMLInputElement).value).toBe("Monthly");
    mocks.save.mockResolvedValueOnce({...agreement,id:"new",reference:"FIRSTPET-CONS-2026-001",partnerCommissionPercentage:30,pendingTerms:["Duration"]});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));fireEvent.click(screen.getByRole("button",{name:"Save draft"}));
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(2));
    const [first,second]=mocks.save.mock.calls;
    expect(second[0]).toEqual(expect.objectContaining({merchantId:"merchant",reference:"",partnerCommissionPercentage:30,settlementFrequency:"Monthly",signedAgreementReference:null,effectiveFrom:null}));
    expect(second[1]).toBeUndefined();expect(second[3]).toEqual({idempotencyKey:expect.any(String),defaultTermsRevision:null});
    // The retry is the same logical creation, so it carries the same key.
    expect(second[3].idempotencyKey).toBe(first[3].idempotencyKey);
    expect(await screen.findByText("FIRSTPET-CONS-2026-001 v1 saved as a draft")).toBeTruthy();expect(screen.getByText(/Still pending: Duration/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Continue to approval"})).toBeNull();
  });
  it("starts from the active default terms, keeps edits and asks before restoring them",async()=>{
    mocks.defaults.mockResolvedValue(activeDefaults);
    mocks.save.mockResolvedValueOnce({...agreement,id:"new",reference:"FIRSTPET-CONS-2026-001",defaultTermsRevision:3});
    await startWizard();
    fireEvent.change(screen.getByLabelText("Merchant"),{target:{value:"merchant"}});fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(await screen.findByText("Default terms have been applied")).toBeTruthy();expect(screen.getByText(/revision 3/)).toBeTruthy();
    expect((screen.getByLabelText("Partner commission (%)") as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText("Loss and damage responsibility") as HTMLTextAreaElement).value).toBe("Synthetic evidence-based");
    // Evidence is never defaulted.
    expect((screen.getByLabelText("Effective start") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Signed agreement reference") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("External tracker reference") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button",{name:"Restore default terms"})).toBeNull();
    fireEvent.change(screen.getByLabelText("Partner commission (%)"),{target:{value:"33"}});
    fireEvent.click(screen.getByRole("button",{name:"Restore default terms"}));
    expect(screen.getByText(/Replace your edited commission and clauses with the defaults/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Keep my edits"}));expect((screen.getByLabelText("Partner commission (%)") as HTMLInputElement).value).toBe("33");
    fireEvent.click(screen.getByRole("button",{name:"Restore default terms"}));fireEvent.click(screen.getByRole("button",{name:"Replace with defaults"}));
    expect((screen.getByLabelText("Partner commission (%)") as HTMLInputElement).value).toBe("30");
    // The trial suggests an end date, counting the start day as day 1, until one is chosen by hand.
    fireEvent.change(screen.getByLabelText("Effective start"),{target:{value:"2026-11-01"}});
    expect((screen.getByLabelText("Effective end") as HTMLInputElement).value).toBe("2026-12-30");
    expect(screen.getByText(/Suggested from the 60-day trial/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Effective end"),{target:{value:"2027-01-15"}});
    fireEvent.change(screen.getByLabelText("Effective start"),{target:{value:"2026-11-05"}});
    expect((screen.getByLabelText("Effective end") as HTMLInputElement).value).toBe("2027-01-15");
    fireEvent.change(screen.getByLabelText("Partner commission (%)"),{target:{value:"32"}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));fireEvent.click(screen.getByRole("button",{name:"Save draft"}));
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));
    const [input,,,creation]=mocks.save.mock.calls[0];
    expect(input).toEqual(expect.objectContaining({partnerCommissionPercentage:32,durationTerms:"Synthetic 60-day trial",lossTerms:"Synthetic evidence-based",signedAgreementReference:null,externalTrackerReference:null}));
    expect(creation).toEqual({idempotencyKey:expect.any(String),defaultTermsRevision:3});
  });
  it("lets the prefix change before it is used, and not after",async()=>{
    mocks.savePrefix.mockResolvedValue({...shopPrefix,prefix:"PETSHOP",suggestedPrefix:"PETSHOP",referencePattern:"PETSHOP-CONS-2026-",concurrencyToken:"prefix-token"});
    await startWizard();
    fireEvent.change(screen.getByLabelText("Merchant"),{target:{value:"merchant"}});
    fireEvent.click(await screen.findByRole("button",{name:"Change prefix"}));
    fireEvent.change(screen.getByLabelText("Reference prefix"),{target:{value:"pet-shop"}});
    expect((screen.getByLabelText("Reference prefix") as HTMLInputElement).value).toBe("PETSHOP");
    fireEvent.click(screen.getByRole("button",{name:"Save prefix"}));
    await waitFor(()=>expect(mocks.savePrefix).toHaveBeenCalledWith("merchant","PETSHOP",""));
    expect(await screen.findByText("PETSHOP-CONS-2026-…")).toBeTruthy();
    cleanup();
    mocks.prefix.mockResolvedValue({...shopPrefix,prefix:"FIRSTPET",locked:true,lockedAt:"2026-10-01T00:00:00Z"});
    await startWizard();fireEvent.change(screen.getByLabelText("Merchant"),{target:{value:"merchant"}});
    expect(await screen.findByText(/FIRSTPET is already used in this partner’s references/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Change prefix"})).toBeNull();
  });
  it("asks before discarding unsaved entries",async()=>{
    await startWizard();fireEvent.change(screen.getByLabelText("Merchant"),{target:{value:"merchant"}});
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(screen.getByText(/Discard this unsaved agreement/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Keep editing"}));expect((screen.getByLabelText("Merchant") as HTMLSelectElement).value).toBe("merchant");
  });
  it("starts a new version from approved terms without carrying over the previous signature",async()=>{
    mocks.agreements.mockResolvedValue({items:[{...ready,status:"Active"}],total:1});
    render(<ConsignmentPanel/>);await openAgreement();fireEvent.click(await screen.findByRole("button",{name:"Create new version"}));
    expect((screen.getByLabelText("Agreement reference") as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect((screen.getByLabelText("Duration and renewal terms") as HTMLInputElement).value).toBe("One year");
    expect((screen.getByLabelText("Signed agreement reference") as HTMLInputElement).value).toBe("");
  });
});
