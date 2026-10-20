using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;
namespace MyPetLink.Api.Tests.Relational;

// Independent audit probes. Assertions capture observed defects; these are not acceptance tests.
public sealed partial class ConsignmentRelationalTests
{
    [Fact]
    public async Task IP01_ReturnedOutcomeSucceedsWithoutAnyPhysicalReturn()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
            await Month(db,"ip01"); await ClosedCount(db,Count("2026-08-31",6,1));
            var before=await Ledger(db); var movements=await db.ConsignmentMovements.CountAsync();
            var d=await OpenDiscrepancy(db,"UnsellableFound");
            var result=await Resolve(db,d,"ReturnedToMyPetLink",1);
            Assert.Equal("Resolved",result.Status); Assert.Equal(before,await Ledger(db));
            Assert.Equal(1,(await Position(db)).Unsellable);
            Assert.Equal(movements,await db.ConsignmentMovements.CountAsync());
            Assert.False(await db.ConsignmentUnits.AnyAsync(u=>u.Status==ConsignmentUnitStatus.ReturnedQuarantine));
        } finally { MigratedSchema.Value=false; }
    }
    [Fact]
    public async Task IP02_CorrectingALateSaleLeavesInvestigationWithoutAnOpenShortage()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
            var (a,p,_)=await Month(db,"ip02"); await ClosedCount(db,Count("2026-08-31",5));
            var late=await Verified(db,ReportFor(a.Id,"2026-08",2,"IP02-B",[Sale(p.Id,2)]));
            Assert.Equal((5,0,0,5,0,10,true),await Ledger(db));
            var correction=await Correct(db,late,ReportFor(a.Id,"2026-08",2,"IP02-B",[Sale(p.Id,1)]));
            await Later(db).VerifySalesReportAsync(ReviewerUser,correction.Id,new(correction.ConcurrencyToken,AcknowledgeWarnings:true),default);
            Assert.Equal((4,0,2,4,0,10,true),await Ledger(db));
            Assert.Equal(0,await db.ConsignmentStockDiscrepancies.SumAsync(d=>d.OpenQuantity));
            Assert.Equal(2,(await Position(db)).Investigation);
        } finally { MigratedSchema.Value=false; }
    }
    [Fact]
    public async Task IP03_ReducingALateRefundThrowsWhenNoSaleLineExists()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"ip03"); await ClosedCount(db,Count("2026-08-31",9));
        var late=await Verified(db,ReportFor(a.Id,"2026-08",2,"IP03-B",[Refund(p.Id,2,AugustFirst,restock:2)]));

        // The reduced refund is allowed to explain an unrelated later shortage, triggering First(Sale).
        await ClosedCount(db,Count("2026-09-15",8),LateClock);
        var correction=await Correct(db,late,ReportFor(a.Id,"2026-08",2,"IP03-B",[Refund(p.Id,1,AugustFirst,restock:1)]));
        var before=await Ledger(db); var entries=await db.ConsignmentStockLedgerEntries.CountAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(()=>At(db,LateClock).VerifySalesReportAsync(ReviewerUser,correction.Id,new(correction.ConcurrencyToken,AcknowledgeWarnings:true),default));
        Assert.Equal(before,await Ledger(db)); Assert.Equal(entries,await db.ConsignmentStockLedgerEntries.CountAsync());
    }
    [Fact]
    public async Task IP04_AugustLateSaleAutomaticallyResolvesSeptemberShortage()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"ip04"); await ClosedCount(db,Count("2026-08-31",7));
        var september=await ClosedCount(db,Count("2026-09-15",6),LateClock);
        var shortage=await OpenDiscrepancy(db,"Shortage"); Assert.Equal(september.Id,shortage.OriginStocktakeId);
        var late=await Verified(db,ReportFor(a.Id,"2026-08",2,"IP04-B",[Sale(p.Id,1)]),LateClock);
        var resolved=(await Later(db).DiscrepanciesAsync(BranchId,null,default)).Single();
        Assert.Equal("Resolved",resolved.Status); Assert.Equal(late.Id,resolved.Resolutions.Single().LinkedSalesReportId);
        Assert.Equal((6,0,0,4,0,10,true),await Ledger(db));
    }
    [Fact]
    public async Task IP05_AugustSecondHalfSaleResolvesAnEarlierAugustFirstHalfShortage()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"ip05"); var first=await ClosedCount(db,Count("2026-08-15",6));
        var second=await ClosedCount(db,Count("2026-08-31",5));
        await Verified(db,ReportFor(a.Id,"2026-08",2,"IP05-B",[Sale(p.Id,1)]));
        var ds=await Later(db).DiscrepanciesAsync(BranchId,null,default);
        Assert.Equal("Resolved",ds.Single(d=>d.OriginStocktakeId==first.Id).Status);
        Assert.Equal("Open",ds.Single(d=>d.OriginStocktakeId==second.Id).Status);
    }
    [Fact]
    public async Task IP06_ClosedStocktakeAcceptsAnAdditionalUnfrozenLineThroughSql()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
            await Month(db,"ip06"); var closed=await ClosedCount(db,Count("2026-08-31",7));
            var variant=await db.TagProductVariants.Where(v=>v.Id!=NfcVariantId).Select(v=>v.Id).FirstAsync();
            var id=Guid.NewGuid();
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO ConsignmentStocktakeLines(Id,StocktakeId,ProductVariantId,SkuSnapshot,CountedSellable,CountedUnsellable) VALUES({id},{closed.Id},{variant},{"AUDIT-INJECTED"},999,0)");
            Assert.Equal(2,(await Later(db).GetStocktakeAsync(closed.Id,default)).Lines.Count);
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentStocktakeLines SET CountedSellable=888 WHERE Id={id}");
            Assert.Equal(888,await db.ConsignmentStocktakeLines.Where(l=>l.Id==id).Select(l=>l.CountedSellable).SingleAsync());
        } finally { MigratedSchema.Value=false; }
    }
    [Fact]
    public async Task IP07_SurplusNoteDoesNotPermitSalesBeyondVerifiedCapacity()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"ip07"); await ClosedCount(db,Count("2026-08-31",9));
        var expected=await Later(db).StocktakeExpectationAsync(BranchId,"2026-09-15",default);
        Assert.Equal((7,2,9),(expected.Lines.Single().BookSellable,expected.Lines.Single().OpenSurplusBefore,expected.Lines.Single().ExpectedSellable));
        var r=await Recorded(db,ReportFor(a.Id,"2026-09",1,"IP07-C",[Sale(p.Id,8)]));
        var before=await Ledger(db);
        await Assert.ThrowsAsync<ApiException>(()=>At(db,LateClock).VerifySalesReportAsync(OwnerAccountId,r.Id,new(r.ConcurrencyToken,AcknowledgeWarnings:true),default));
        Assert.Equal(before,await Ledger(db)); Assert.Equal((7,0,0,3,0,10,true),before);
    }
    [Fact]
    public async Task IP08_MorningAfterCountCannotRecordItsActualDate()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        await Month(db,"ip08");
        var morning=new DateTimeOffset(2026,9,1,9,0,0,Myt);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>At(db,morning).CreateStocktakeAsync(AdminAccountId,Count("2026-09-01",7),default))).StatusCode);
        var s=await RecordedCount(db,Count("2026-08-31",7),morning);
        Assert.Equal("Approved",(await At(db,morning).ApproveStocktakeAsync(OwnerAccountId,s.Id,new(s.ConcurrencyToken),default)).Status);
        Assert.Null(typeof(ConsignmentStocktake).GetProperty("CountedAt"));
    }
    [Fact]
    public async Task IP09_SurplusResolutionLetsAMakerResolveTheirOwnRelatedShortageInTeamMode()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        await Month(db,"ip09"); await ClosedCount(db,Count("2026-08-15",5));
        var shortage=await OpenDiscrepancy(db,"Shortage");
        var svc=Later(db); var s=await svc.CreateStocktakeAsync(ReviewerUser,Count("2026-08-31",7),default);
        s=await svc.RecordStocktakeAsync(ReviewerUser,s.Id,new(s.ConcurrencyToken),default);
        await svc.ApproveStocktakeAsync(OwnerAccountId,s.Id,new(s.ConcurrencyToken,AcknowledgeWarnings:true),default);
        var surplus=await OpenDiscrepancy(db,"Surplus");
        await Assert.ThrowsAsync<ApiException>(()=>svc.ResolveDiscrepancyAsync(AdminAccountId,shortage.Id,new(shortage.ConcurrencyToken,"Found",2,"Found evidence photo","Shop owner confirms both packages"),default));
        var resolved=await svc.ResolveDiscrepancyAsync(AdminAccountId,surplus.Id,new(surplus.ConcurrencyToken,"EarlierShortageFound",2,"Found evidence photo","Shop owner confirms both packages",shortage.Id),default);
        Assert.Equal("Resolved",resolved.Status); Assert.Equal("Independent (Team)",resolved.Resolutions.Single().ReviewMode);
        Assert.Equal("Resolved",(await svc.DiscrepanciesAsync(BranchId,null,default)).Single(d=>d.Id==shortage.Id).Status);
        Assert.False(await db.ConsignmentReviewEvents.AnyAsync(e=>e.SubjectId==shortage.Id));
    }
    [Fact]
    public async Task IP10_SoloResolutionAcceptsTheOriginalMissingCountAsFoundEvidence()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext();
        await Month(db,"ip10"); var closed=await ClosedCount(db,Count("2026-08-31",5));
        await SoloAccess(db); await SetMode(db); var solo=SoloLater(db);
        var d=await OpenDiscrepancy(db,"Shortage");
        var resolved=await solo.ResolveDiscrepancyAsync(AdminAccountId,d.Id,new(d.ConcurrencyToken,"Found",2,closed.EvidenceReference,
            "I confirm both missing packages were found",SelfReview:new(true,"I checked the count evidence myself",closed.EvidenceReference)),default);
        Assert.Equal("Resolved",resolved.Status); Assert.Equal("Self-reviewed (Solo)",resolved.Resolutions.Single().ReviewMode);
        Assert.Equal(closed.EvidenceReference,resolved.Resolutions.Single().EvidenceReference);
    }    [Fact]
    public async Task IP11_ConcurrentPartialResolutionAndReplayMoveStockExactlyOnce()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext();
            await Month(db,"ip11"); await ClosedCount(db,Count("2026-08-31",5));
            var d=await OpenDiscrepancy(db,"Shortage");
            var results=await Task.WhenAll(Enumerable.Range(0,2).Select(async _=>{
                await using var other=scope.NewContext();
                try { await Resolve(other,d,"Found",1); return 200; } catch(ApiException e){return e.StatusCode;}
            }));
            Assert.Equal(new[]{200,409},results.Order().ToArray());
            Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>Resolve(db,d,"Found",1))).StatusCode);
            Assert.Equal((6,0,1,3,0,10,true),await Ledger(db));
            Assert.Equal(1,await db.ConsignmentDiscrepancyResolutions.CountAsync());
            Assert.Equal(1,await db.ConsignmentReviewEvents.CountAsync(e=>e.SubjectId==d.Id));
            await AssertInvestigationMatchesOpenShortages(db);
        } finally { MigratedSchema.Value=false; }
    }
    [Fact]
    public async Task IP12_ConcurrentReportVerificationAndCloseAreSerializedAndSafe()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext();
            var (a,p,_)=await Month(db,"ip12");
            var report=await Recorded(db,ReportFor(a.Id,"2026-08",2,"IP12-B",[Sale(p.Id,2)]));
            var count=await RecordedCount(db,Count("2026-08-31",5));
            var results=await Task.WhenAll(Enumerable.Range(0,2).Select(async i=>{
                await using var other=scope.NewContext();
                try {
                    if(i==0) await Later(other).VerifySalesReportAsync(OwnerAccountId,report.Id,new(report.ConcurrencyToken,AcknowledgeWarnings:true),default);
                    else await Later(other).ApproveStocktakeAsync(OwnerAccountId,count.Id,new(count.ConcurrencyToken,AcknowledgeWarnings:true),default);
                    return 200;
                } catch(ApiException e){return e.StatusCode;}
            }));
            Assert.Equal(200,results[0]); Assert.Contains(results[1],new[]{200,400});
            if(results[1]!=200) await Later(db).ApproveStocktakeAsync(OwnerAccountId,count.Id,new(count.ConcurrencyToken,AcknowledgeWarnings:true),default);
            Assert.Equal((5,0,0,5,0,10,true),await Ledger(db));
            Assert.Equal(0,await db.ConsignmentStockDiscrepancies.CountAsync());
            Assert.Equal(2,await db.ConsignmentStockLedgerEntries.CountAsync(e=>e.EntryType==MyPetLink.Api.Services.ConsignmentLedgerEntryTypes.Sale));
        } finally { MigratedSchema.Value=false; }
    }
    [Fact]
    public async Task IP13_FailedCloseLeavesAllBusinessAndAuditStateUnchanged()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(4); await using var db=scope.NewContext();
            var a=await AgreementFrom(db,AugustFirst); var d=await ReceiveUnder(db,a.Id,4,"ip13");
            var count=await RecordedCount(db,Count("2026-08-15",1));
            var svc=Later(db); d=await svc.GetAsync(d.Id,false,default);
            await svc.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"IP13-RETURN",d.Units.Take(3).Select(u=>u.Id).ToArray()),default);
            async Task<string> Snapshot(){
                db.ChangeTracker.Clear();
                var state=new {
                    Ledger=await db.ConsignmentStockLedgerEntries.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Counts=await db.ConsignmentStocktakes.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Lines=await db.ConsignmentStocktakeLines.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Discrepancies=await db.ConsignmentStockDiscrepancies.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Resolutions=await db.ConsignmentDiscrepancyResolutions.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Reviews=await db.ConsignmentReviewEvents.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Units=await db.ConsignmentUnits.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Reports=await db.ConsignmentSalesReports.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    ReportLines=await db.ConsignmentSalesReportLines.AsNoTracking().OrderBy(x=>x.Id).ToListAsync(),
                    Audit=await db.AuditLogs.CountAsync()
                }; return System.Text.Json.JsonSerializer.Serialize(state);
            }
            var before=await Snapshot();
            Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>svc.ApproveStocktakeAsync(OwnerAccountId,count.Id,new(count.ConcurrencyToken,AcknowledgeWarnings:true),default))).StatusCode);
            Assert.Equal(before,await Snapshot());
        } finally { MigratedSchema.Value=false; }
    }}






