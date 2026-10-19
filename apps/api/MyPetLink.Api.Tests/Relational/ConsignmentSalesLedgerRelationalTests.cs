using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// SKU sales reports and the stock ledger. Aggregate reports move quantities only:
// no unit, Tag Code, invoice, payment or commission is ever touched.
public sealed partial class ConsignmentRelationalTests
{
    private static readonly DateTimeOffset ReportClock = Now.AddDays(30);

    /// <summary>Report work happens after the sales period ends, so it runs on a later clock.</summary>
    private static ConsignmentService Later(MyPetLinkDbContext db) {
        var audit=new AuditLogService(db,new HttpContextAccessor());
        return new(db,audit,new BusinessIdentityService(db,audit,new FixedClock(ReportClock)),new DocumentNumberService(db),new FixedClock(ReportClock));
    }

    private static async Task<(ConsignmentAgreementResponse Agreement,ConsignmentDispatchResponse Dispatch)> ReceivedAtPartner(MyPetLinkDbContext db,int quantity=10)
    {
        var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,quantity,"sales-"+quantity),default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d,"SHIP-SALES"),default);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"Signed delivery acknowledgment") with { Receipt=Receipt(d) },default);
        return (a,d);
    }

    private static async Task<ConsignmentPriceTermResponse> ApprovedPrice(MyPetLinkDbContext db,Guid agreement,decimal price=39.90m,
        string kind="Standard",string? name=null,DateTimeOffset? from=null,DateTimeOffset? to=null)
    {
        var s=Later(db);
        var draft=await s.SavePriceTermAsync(AdminAccountId,null,new(agreement,NfcVariantId,kind,name,price,from??Now.AddDays(-1),to,"PARTNER-PRICE-OK"),null,default);
        return await s.ApprovePriceTermAsync(OwnerAccountId,draft.Id,new(draft.ConcurrencyToken),default);
    }

    private static SaveConsignmentSalesReportRequest Report(Guid agreement,IReadOnlyList<ConsignmentSalesLineRequest> lines,
        int half=1,string reference="SHOP-2026-08-A",string? key=null) =>
        new(agreement,BranchId,"2026-08",half,reference,Now.AddDays(12),"Summary","WhatsApp summary","WA 18 Aug from shop owner",null,lines,key);

    private static ConsignmentSalesLineRequest Sale(Guid? term,int quantity,decimal price=39.90m) => new(NfcVariantId,"Sale",term,price,quantity);

    private static async Task<ConsignmentSalesReportResponse> Recorded(MyPetLinkDbContext db,SaveConsignmentSalesReportRequest request)
    {
        var s=Later(db);var draft=await s.CreateSalesReportAsync(AdminAccountId,request,default);
        return await s.RecordSalesReportAsync(AdminAccountId,draft.Id,new(draft.ConcurrencyToken),default);
    }

    private static async Task<ConsignmentSkuPositionResponse> Position(MyPetLinkDbContext db) =>
        (await Later(db).StockPositionsAsync(MerchantId,default)).Single(p=>p.MerchantBranchId==BranchId).Skus.Single(x=>x.ProductVariantId==NfcVariantId);

    [Fact]
    public async Task ReceiptPostsEachUnitOnceAndStartTrackingReplaysNothing()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (_,d)=await ReceivedAtPartner(db);
        var p=await Position(db);
        Assert.Equal(10,p.Sellable);Assert.Equal(10,p.CustodyUnits);Assert.True(p.TieOutBalanced);Assert.Equal(0,p.UntrackedUnits);
        // An exact replay of the receipt and a tracking start add nothing.
        await Custody(db).ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"Signed delivery acknowledgment") with { Receipt=Receipt(d) },default);
        await Later(db).StartStockTrackingAsync(AdminAccountId,new(BranchId,"Synthetic tracking start for a received delivery"),default);
        Assert.Equal(10,await db.ConsignmentStockLedgerEntries.CountAsync());
        Assert.Equal(10,(await Position(db)).Sellable);
    }

    [Fact]
    public async Task VerifiedSalesMoveQuantitiesWithoutTouchingUnitsOrMoney()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,_)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var report=await Recorded(db,Report(a.Id,[Sale(price.Id,3)]));
        Assert.Equal("Recorded",report.Status);Assert.Empty(report.Issues);
        var p=await Position(db);Assert.Equal(10,p.Sellable);Assert.Equal(3,p.UnverifiedSold);Assert.Equal(7,p.ProvisionalSellable);

        var verified=await Later(db).VerifySalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken),default);
        Assert.Equal("Verified",verified.Status);Assert.Equal("Independent (Team)",verified.ReviewMode);Assert.Equal(119.70m,verified.NetSalesValue);
        p=await Position(db);
        Assert.Equal(7,p.Sellable);Assert.Equal(3,p.SoldUnidentified);Assert.Equal(10,p.CustodyUnits);Assert.True(p.TieOutBalanced);
        Assert.All(await db.ConsignmentUnits.ToListAsync(),u=>{ Assert.Equal(ConsignmentUnitStatus.Received,u.Status);Assert.Null(u.CurrentHandoverRecordId); });
        Assert.Empty(db.ConsignmentHandoverRecords);Assert.Empty(db.MerchantInvoices);Assert.Empty(db.MerchantPayments);
        Assert.Empty(db.SalesCommissions);Assert.Empty(db.TagOrders);
        Assert.True(await db.ConsignmentReviewEvents.AnyAsync(e=>e.SubjectType=="ConsignmentSalesReport"&&e.SubjectId==report.Id));
        var again=await Assert.ThrowsAsync<ApiException>(()=>Later(db).VerifySalesReportAsync(OwnerAccountId,report.Id,new(verified.ConcurrencyToken),default));
        Assert.Equal(409,again.StatusCode);
        Assert.Equal(3,await db.ConsignmentStockLedgerEntries.Where(e=>e.EntryType==ConsignmentLedgerEntryTypes.Sale).SumAsync(e=>e.Quantity));
    }

    [Fact]
    public async Task UnapprovedPricesCanBeRecordedAsReportedButNeverVerified()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,_)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var draftPromo=await Later(db).SavePriceTermAsync(AdminAccountId,null,new(a.Id,NfcVariantId,"Promotion","Unapproved promo",30m,Now.AddDays(-1),Now.AddDays(20),null),null,default);
        var report=await Recorded(db,Report(a.Id,[Sale(null,2,35m),Sale(draftPromo.Id,1,30m)]));
        Assert.Contains(report.Issues,i=>i.Contains("RM35.00 isn't an approved price"));
        Assert.Contains(report.Issues,i=>i.Contains("isn't approved yet"));
        var refused=await Assert.ThrowsAsync<ApiException>(()=>Later(db).VerifySalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken),default));
        Assert.Equal("validation_failed",refused.Code);
        Assert.Empty(db.ConsignmentStockLedgerEntries.Where(e=>e.EntryType==ConsignmentLedgerEntryTypes.Sale));
        var disputed=await Later(db).DisputeSalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken,"Shop sold at an unapproved price"),default);
        Assert.Equal("Disputed",disputed.Status);
        // The partner's corrected report replaces the disputed one; original values stay in history.
        var correction=await Later(db).CorrectSalesReportAsync(AdminAccountId,report.Id,new(disputed.ConcurrencyToken,"Partner sent corrected figures"),default);
        Assert.Equal(2,correction.Version);Assert.Equal(report.Id,correction.SupersedesReportId);
        correction=await Later(db).UpdateSalesReportAsync(AdminAccountId,correction.Id,correction.ConcurrencyToken,Report(a.Id,[Sale(price.Id,3)]),default);
        correction=await Later(db).RecordSalesReportAsync(AdminAccountId,correction.Id,new(correction.ConcurrencyToken),default);
        await Later(db).VerifySalesReportAsync(OwnerAccountId,correction.Id,new(correction.ConcurrencyToken),default);
        var original=await Later(db).GetSalesReportAsync(report.Id,default);
        Assert.Equal("Superseded",original.Status);Assert.Equal(35m,original.Lines.Single(l=>l.PriceTermId==null).UnitNetPrice);
        Assert.Equal(7,(await Position(db)).Sellable);
    }

    [Fact]
    public async Task CorrectionReversesTheVerifiedOriginalExactlyOnce()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,_)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var v1=await Recorded(db,Report(a.Id,[Sale(price.Id,3)]));
        v1=await Later(db).VerifySalesReportAsync(OwnerAccountId,v1.Id,new(v1.ConcurrencyToken),default);
        var v2=await Later(db).CorrectSalesReportAsync(AdminAccountId,v1.Id,new(v1.ConcurrencyToken,"Partner sent corrected figures"),default);
        await Assert.ThrowsAsync<ApiException>(()=>Later(db).CorrectSalesReportAsync(AdminAccountId,v1.Id,new(v1.ConcurrencyToken,"Partner sent corrected figures"),default));
        await Assert.ThrowsAsync<ApiException>(()=>Later(db).UpdateSalesReportAsync(AdminAccountId,v2.Id,v2.ConcurrencyToken,
            Report(a.Id,[Sale(price.Id,2)],reference:"DIFFERENT-REF"),default));
        v2=await Later(db).UpdateSalesReportAsync(AdminAccountId,v2.Id,v2.ConcurrencyToken,Report(a.Id,[Sale(price.Id,2)]),default);
        v2=await Later(db).RecordSalesReportAsync(AdminAccountId,v2.Id,new(v2.ConcurrencyToken),default);
        Assert.Equal(1,(await Position(db)).ProvisionalSellable-(await Position(db)).Sellable);
        await Later(db).VerifySalesReportAsync(OwnerAccountId,v2.Id,new(v2.ConcurrencyToken),default);
        var p=await Position(db);Assert.Equal(8,p.Sellable);Assert.Equal(2,p.SoldUnidentified);Assert.True(p.TieOutBalanced);
        Assert.Equal(1,await db.ConsignmentStockLedgerEntries.CountAsync(e=>e.EntryType==ConsignmentLedgerEntryTypes.Reversal));
    }

    [Fact]
    public async Task RefundsCannotExceedSalesAndOnlySealedReturnsBecomeSellable()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,_)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var first=await Recorded(db,Report(a.Id,[Sale(price.Id,3)]));
        await Later(db).VerifySalesReportAsync(OwnerAccountId,first.Id,new(first.ConcurrencyToken),default);
        var original=first.PeriodStart;
        var tooMany=await Recorded(db,Report(a.Id,[new(NfcVariantId,"Refund",price.Id,39.90m,4,original,1,0,null,true,"Sealed package seen in shop photo")],half:2,reference:"SHOP-2026-08-B"));
        Assert.Contains(tooMany.Issues,i=>i.Contains("4 refunds at this price, but only 3 verified sales"));
        await Later(db).DisputeSalesReportAsync(OwnerAccountId,tooMany.Id,new(tooMany.ConcurrencyToken,"Refund count is higher than sales"),default);
        var fix=await Later(db).CorrectSalesReportAsync(AdminAccountId,tooMany.Id,new((await Later(db).GetSalesReportAsync(tooMany.Id,default)).ConcurrencyToken,"Partner sent corrected figures"),default);
        fix=await Later(db).UpdateSalesReportAsync(AdminAccountId,fix.Id,fix.ConcurrencyToken,
            Report(a.Id,[new(NfcVariantId,"Refund",price.Id,39.90m,2,original,1,1,null,true,"Sealed package seen in shop photo")],half:2,reference:"SHOP-2026-08-B"),default);
        fix=await Later(db).RecordSalesReportAsync(AdminAccountId,fix.Id,new(fix.ConcurrencyToken),default);
        Assert.Empty(fix.Issues);Assert.Equal(-79.80m,fix.NetSalesValue);
        await Later(db).VerifySalesReportAsync(OwnerAccountId,fix.Id,new(fix.ConcurrencyToken),default);
        // One sealed return is back on the shelf; the opened one is unsellable, never sellable.
        var p=await Position(db);Assert.Equal(8,p.Sellable);Assert.Equal(1,p.Unsellable);Assert.Equal(1,p.SoldUnidentified);Assert.True(p.TieOutBalanced);
    }

    [Fact]
    public async Task SalesBeyondRecordedStockAndOverlappingReportsAreRefused()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,_)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var over=await Recorded(db,Report(a.Id,[Sale(price.Id,11)],key:"KEY-OVER"));
        Assert.Contains(over.Issues,i=>i.Contains("1 more than the sellable stock"));
        await Assert.ThrowsAsync<ApiException>(()=>Later(db).VerifySalesReportAsync(OwnerAccountId,over.Id,new(over.ConcurrencyToken),default));
        // An identical retry of the submission replays; a changed one is a conflict, never the old values.
        var replay=await Later(db).CreateSalesReportAsync(AdminAccountId,Report(a.Id,[Sale(price.Id,11)],key:"KEY-OVER"),default);
        Assert.Equal(over.Id,replay.Id);
        var changed=await Assert.ThrowsAsync<ApiException>(()=>Later(db).CreateSalesReportAsync(AdminAccountId,Report(a.Id,[Sale(price.Id,1)],key:"KEY-OVER"),default));
        Assert.Equal("submission_changed",changed.Code);
        // A second report for the period or reference is refused.
        await Assert.ThrowsAsync<ApiException>(()=>Later(db).CreateSalesReportAsync(AdminAccountId,Report(a.Id,[Sale(price.Id,1)],reference:"OTHER-REF"),default));
        await Assert.ThrowsAsync<ApiException>(()=>Later(db).CreateSalesReportAsync(AdminAccountId,Report(a.Id,[Sale(price.Id,1)],half:2),default));
        await Assert.ThrowsAsync<ApiException>(()=>Later(db).CreateSalesReportAsync(AdminAccountId,
            Report(a.Id,[Sale(price.Id,1),Sale(price.Id,2)],half:2,reference:"DUPLICATE-LINES"),default));
        Assert.Equal(1,await db.ConsignmentSalesReports.CountAsync());
    }

    [Fact]
    public async Task IdentifiedHandoversNeedAttributionCarryNoPriceAndNeverCountTwice()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,d)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);var s=Custody(db);var unit=d.Units[0].Id;
        ConsignmentActionRequest Handoff(ConsignmentDispatchResponse current,string reference,string? attribution,bool sale=false,Guid? original=null) =>
            Action(current,"Tracker "+reference,[unit]) with { Handover=new(reference,Now,sale,sale?39.90m:null,sale?0m:null,null,original,attribution) };
        var priced=await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"external-handover",Handoff(d,"H-PRICED","AggregateSale",true),default));
        Assert.Contains("sales report",priced.Message);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"external-handover",Handoff(d,"H-NONE",null),default));
        var nothingSold=await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"external-handover",Handoff(d,"H-EARLY","AggregateSale"),default));
        Assert.Equal(409,nothingSold.StatusCode);
        var report=await Recorded(db,Report(a.Id,[Sale(price.Id,1)]));
        await Later(db).VerifySalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken),default);
        d=await s.GetAsync(d.Id,false,default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"external-handover",Handoff(d,"H-KNOWN","AggregateSale"),default);
        var p=await Position(db);Assert.Equal(9,p.Sellable);Assert.Equal(0,p.SoldUnidentified);Assert.Equal(9,p.CustodyUnits);Assert.True(p.TieOutBalanced);
        Assert.Equal("AggregateSale",d.Reconciliation.Single().Attribution);Assert.False(d.Reconciliation.Single().IsReportedSale);
        d=await s.ActionAsync(AdminAccountId,d.Id,"reverse-handover",Handoff(d,"H-REVERSE",null,original:d.Units.Single(u=>u.Id==unit).CurrentHandoverRecordId),default);
        p=await Position(db);Assert.Equal(1,p.SoldUnidentified);Assert.Equal(10,p.CustodyUnits);Assert.True(p.TieOutBalanced);
    }

    [Fact]
    public async Task ReturningACountedPackageLeavesTheChosenBucket()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();
        var (_,d)=await ReceivedAtPartner(db,4);var s=Custody(db);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"RETURN-1",[d.Units[0].Id]) with { ReturnFromBucket="Unsellable" },default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"RETURN-1",[d.Units[0].Id]),default);
        var p=await Position(db);Assert.Equal(3,p.Sellable);Assert.Equal(3,p.CustodyUnits);Assert.True(p.TieOutBalanced);
    }

    [Fact]
    public async Task SoloFounderVerifiesOwnReportOnlyWithItsRecordedEvidence()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,_)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var report=await Recorded(db,Report(a.Id,[Sale(price.Id,2)]));
        var team=await Assert.ThrowsAsync<ApiException>(()=>Later(db).VerifySalesReportAsync(AdminAccountId,report.Id,new(report.ConcurrencyToken),default));
        Assert.Equal("independent_review_required",team.Code);
        await SoloAccess(db);await SetMode(db);
        var solo=new ConsignmentService(db,new AuditLogService(db,new HttpContextAccessor()),
            new BusinessIdentityService(db,new AuditLogService(db,new HttpContextAccessor()),new FixedClock(ReportClock)),
            new DocumentNumberService(db),new FixedClock(ReportClock),new MyPetLink.Api.Auth.AdminAccessResolver(db,new StubCurrentUserService(AdminAccountId)));
        var wrong=await Assert.ThrowsAsync<ApiException>(()=>solo.VerifySalesReportAsync(AdminAccountId,report.Id,
            new(report.ConcurrencyToken,SelfReview:Attest("SOME-OTHER-EVIDENCE")),default));
        Assert.Equal("validation_failed",wrong.Code);Assert.Contains("same evidence",wrong.Message);
        var verified=await solo.VerifySalesReportAsync(AdminAccountId,report.Id,new(report.ConcurrencyToken,SelfReview:Attest("WA 18 Aug from shop owner")),default);
        Assert.Equal("Self-reviewed (Solo)",verified.ReviewMode);
        Assert.Equal(8,(await Position(db)).Sellable);
    }

    [Fact]
    public async Task ActivationsBeyondReportedSalesNeedAcknowledgment()
    {
        await using var scope=await Database(10);await using var db=scope.NewContext();
        var (a,d)=await ReceivedAtPartner(db);var price=await ApprovedPrice(db,a.Id);
        var manifest=await Documents(db).ManifestAsync(AdminAccountId,d.Id,default);
        var activation=new SmartTagService(db,new AuditLogService(db,new HttpContextAccessor()));
        foreach(var (code,i) in manifest.Units.Take(2).Select((u,i)=>(u.TagCode!,i)))
        {
            var pet=Guid.NewGuid();
            db.Pets.Add(new Pet { Id=pet,OwnerUserId=OwnerAccountId,Slug="consigned-"+i,Name="Buddy",Species="Dog",LifecycleStatus=PetLifecycleStatus.Active });
            await db.SaveChangesAsync();await activation.ActivateAsync(OwnerAccountId,code,new(pet));
        }
        var report=await Recorded(db,Report(a.Id,[Sale(price.Id,1)]));
        Assert.Contains(report.Warnings,w=>w.Contains("2 tags at this partner have been activated"));
        var unacknowledged=await Assert.ThrowsAsync<ApiException>(()=>Later(db).VerifySalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken),default));
        Assert.Equal("warnings_unacknowledged",unacknowledged.Code);
        await Later(db).VerifySalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken,AcknowledgeWarnings:true),default);
        Assert.Equal(1,(await Position(db)).SoldUnidentified);
        Assert.All(await db.ConsignmentUnits.ToListAsync(),u=>Assert.Equal(ConsignmentUnitStatus.Received,u.Status));
    }

    [Fact]
    public async Task PriceApprovalNeedsEvidenceAndRefusesOverlappingStandardPrices()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();
        var a=await Agreement(db);var s=Later(db);
        var noEvidence=await s.SavePriceTermAsync(AdminAccountId,null,new(a.Id,NfcVariantId,"Standard",null,39.90m,Now.AddDays(-1),null,null),null,default);
        await Assert.ThrowsAsync<ApiException>(()=>s.ApprovePriceTermAsync(OwnerAccountId,noEvidence.Id,new(noEvidence.ConcurrencyToken),default));
        await Assert.ThrowsAsync<ApiException>(()=>s.SavePriceTermAsync(AdminAccountId,null,new(a.Id,NfcVariantId,"Promotion",null,30m,Now,null,null),null,default));
        await ApprovedPrice(db,a.Id);
        var overlap=await s.SavePriceTermAsync(AdminAccountId,null,new(a.Id,NfcVariantId,"Standard",null,42m,Now,null,"PARTNER-PRICE-OK"),null,default);
        var refused=await Assert.ThrowsAsync<ApiException>(()=>s.ApprovePriceTermAsync(OwnerAccountId,overlap.Id,new(overlap.ConcurrencyToken),default));
        Assert.Equal(409,refused.StatusCode);
        var promo=await ApprovedPrice(db,a.Id,34.90m,"Promotion","Opening week",Now.AddDays(-1),Now.AddDays(6));
        Assert.Equal("Approved",promo.Status);Assert.Equal("Independent (Team)",promo.ReviewMode);
    }

    [Fact]
    public async Task LedgerIsAppendOnlyAndEachSourcePostsOnce()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();
        await ReceivedAtPartner(db,4);
        var entry=await db.ConsignmentStockLedgerEntries.FirstAsync();entry.Quantity=2;
        await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
        db.ChangeTracker.Clear();entry=await db.ConsignmentStockLedgerEntries.AsNoTracking().FirstAsync();
        db.ConsignmentStockLedgerEntries.Add(new ConsignmentStockLedgerEntry { MerchantId=entry.MerchantId,MerchantBranchId=entry.MerchantBranchId,
            ProductVariantId=entry.ProductVariantId,SkuSnapshot=entry.SkuSnapshot,FromBucket=entry.FromBucket,ToBucket=entry.ToBucket,Quantity=1,
            EntryType=entry.EntryType,SourceType=entry.SourceType,SourceLineId=entry.SourceLineId,EffectiveAt=Now,PostedAt=Now,ActorAdminUserId=entry.ActorAdminUserId });
        await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());
    }
}
