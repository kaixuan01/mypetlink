using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;
namespace MyPetLink.Api.Tests.Relational;

public sealed partial class ConsignmentRelationalTests
{
    private static async Task FGInvariant(MyPetLinkDbContext db)
    {
        var positions=await Later(db).StockPositionsAsync(null,default);
        foreach(var branch in positions) foreach(var sku in branch.Skus) {
            Assert.True(sku.TieOutBalanced);
            Assert.True(sku.Sellable>=0 && sku.Unsellable>=0 && sku.Investigation>=0 && sku.SoldUnidentified>=0 && sku.LostUnidentified>=0);
            var missing=await db.ConsignmentStockDiscrepancies.AsNoTracking().Where(d=>d.MerchantBranchId==branch.MerchantBranchId && d.ProductVariantId==sku.ProductVariantId
                && (d.Kind==ConsignmentDiscrepancyKind.Shortage || d.Kind==ConsignmentDiscrepancyKind.UnsellableShortage)).SumAsync(d=>d.OpenQuantity);
            Assert.Equal(missing,sku.Investigation);
        }
    }
    private static async Task<ConsignmentSalesReportResponse> FGVerify(MyPetLinkDbContext db,ConsignmentSalesReportResponse report,
        IReadOnlyList<ConsignmentLateAllocationRequest>? links=null,Guid? actor=null,DateTimeOffset? clock=null) =>
        await At(db,clock??LateClock).VerifySalesReportAsync(actor??OwnerAccountId,report.Id,new(report.ConcurrencyToken,AcknowledgeWarnings:true,Allocations:links),default);
    private static async Task<string> FGFrozen(MyPetLinkDbContext db) => System.Text.Json.JsonSerializer.Serialize(
        await db.ConsignmentStocktakeLines.AsNoTracking().Where(l=>l.FrozenAt!=null).OrderBy(l=>l.Id).Select(l=>new {
            l.Id,l.StocktakeId,l.FrozenAt,l.BookSellable,l.BookUnsellable,l.BookInvestigation,l.BookSold,l.BookLost,l.OpenSurplusBefore,
            l.ClosingSellable,l.ClosingUnsellable,l.ClosingInvestigation,l.ClosingSold,l.ClosingLost,l.OpenSurplusAfter
        }).ToListAsync());

    [Fact]
    public async Task FG01_OriginalB1CorrectionReopensOnlyUnexplainedQuantityAndRemovedLineIsSafe()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
            var (a,p,_)=await Month(db,"fg01"); await ClosedCount(db,Count("2026-08-31",5));
            var frozen=await FGFrozen(db); var units=await UnitSnapshot(db); var shortage=await OpenDiscrepancy(db,"Shortage");
            var v1=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG01-B",[Sale(p.Id,2)]));
            v1=await FGVerify(db,v1,[Link(shortage.Id,2)]); await FGInvariant(db);
            var v2=await Correct(db,v1,ReportFor(a.Id,"2026-08",2,"FG01-B",[Sale(p.Id,1)]));
            v2=await FGVerify(db,v2,[Link(shortage.Id,1,"Corrected dated receipt")],ReviewerUser);
            Assert.Equal((5,0,1,4,0,10,true),await Ledger(db)); await FGInvariant(db);
            var history=(await DiscrepancyById(db,shortage.Id)).Resolutions;
            Assert.Equal(3,history.Count); Assert.Single(history.Where(x=>x.ReversesResolutionId!=null));
            Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,v2,null,ReviewerUser))).StatusCode);
            var v3=await Correct(db,v2,ReportFor(a.Id,"2026-08",2,"FG01-B",[Refund(p.Id,1,AugustFirst)]));
            await FGVerify(db,v3,null,ReviewerUser);
            Assert.Equal((5,0,2,3,0,10,true),await Ledger(db)); await FGInvariant(db);
            Assert.Equal(2,(await DiscrepancyById(db,shortage.Id)).OpenQuantity);
            Assert.Equal(frozen,await FGFrozen(db)); Assert.Equal(units,await UnitSnapshot(db)); await AssertNoFinancialRecords(db);
        } finally { MigratedSchema.Value=false; }
    }

    [Fact]
    public async Task FG02_CorrectionsAfterTwoLaterClosesAndRenewalPreserveEachObligation()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
            var (a,p,_)=await Month(db,"fg02"); await ClosedCount(db,Count("2026-08-31",4));
            var origin=await OpenDiscrepancy(db,"Shortage");
            await Resolve(db,origin,"Found",1);
            origin=await DiscrepancyById(db,origin.Id); Assert.Equal(2,origin.OpenQuantity);
            var late=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG02-B",[Sale(p.Id,2)]));
            late=await FGVerify(db,late,[Link(origin.Id,2)],clock:ReportClock);
            Assert.Equal((5,0,0,5,0,10,true),await Ledger(db));
            var september=await ClosedCount(db,Count("2026-09-15",4),LateClock);
            await ClosedCount(db,Count("2026-09-30",4),LateClock);
            await AgreementFrom(db,CountTime("2026-10-01",0),supersedes:a.Id);
            var frozen=await FGFrozen(db); var units=await UnitSnapshot(db);
            var correction=await Correct(db,late,ReportFor(a.Id,"2026-08",2,"FG02-B",[Sale(p.Id,1)]));
            await FGVerify(db,correction,[Link(origin.Id,1,"Corrected August receipt after renewal")],ReviewerUser);
            Assert.Equal((4,0,2,4,0,10,true),await Ledger(db)); await FGInvariant(db);
            Assert.Equal(1,(await DiscrepancyById(db,origin.Id)).OpenQuantity);
            var other=(await Later(db).DiscrepanciesAsync(BranchId,"Open",default)).Single(d=>d.OriginStocktakeId==september.Id);
            Assert.Equal(1,other.OpenQuantity); Assert.Empty(other.Resolutions);
            Assert.Equal(frozen,await FGFrozen(db)); Assert.Equal(units,await UnitSnapshot(db)); await AssertNoFinancialRecords(db);
        } finally { MigratedSchema.Value=false; }
    }

    [Fact]
    public async Task FG03_SurplusWithdrawalAfterLaterRecountDoesNotInventStockOrDoubleNotes()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"fg03"); await ClosedCount(db,Count("2026-08-31",9));
        var note=await OpenDiscrepancy(db,"Surplus");
        var late=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG03-B",[Refund(p.Id,1,AugustFirst,restock:1)]));
        late=await FGVerify(db,late,[Link(note.Id,1,"Dated sealed return slip")],clock:ReportClock);
        Assert.Equal(1,(await Position(db)).OpenSurplus);
        await ClosedCount(db,Count("2026-09-15",8),LateClock); // Remaining unverified extra is no longer present.
        await ClosedCount(db,Count("2026-09-30",8),LateClock);
        Assert.Equal(0,(await Position(db)).OpenSurplus); var frozen=await FGFrozen(db);
        var v2=await Correct(db,late,ReportFor(a.Id,"2026-08",2,"FG03-B",[Refund(p.Id,1,AugustFirst)]));
        await FGVerify(db,v2,null,ReviewerUser);
        Assert.Equal((7,0,0,3,0,10,true),await Ledger(db)); Assert.Equal(1,(await Position(db)).OpenSurplus); await FGInvariant(db);
        Assert.Equal(frozen,await FGFrozen(db));
        var next=await ClosedCount(db,Count("2026-12-31",8),CountTime("2027-01-01",10));
        Assert.Equal((7,1,8,0),(next.Lines.Single().BookSellable,next.Lines.Single().OpenSurplusBefore,next.Lines.Single().ExpectedSellable,next.Lines.Single().Surplus));
        Assert.Equal(1,(await Position(db)).OpenSurplus);
    }

    [Fact]
    public async Task FG04_OriginalRefundOnlyCorrectionAfterLaterShortageHasNoUnhandledException()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"fg04"); await ClosedCount(db,Count("2026-08-31",9));
        var note=await OpenDiscrepancy(db,"Surplus");
        var late=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG04-B",[Refund(p.Id,2,AugustFirst,restock:2)]));
        late=await FGVerify(db,late,[Link(note.Id,2,"Two refund slips in August")],clock:ReportClock);
        await ClosedCount(db,Count("2026-09-15",8),LateClock); var frozen=await FGFrozen(db);
        var v2=await Correct(db,late,ReportFor(a.Id,"2026-08",2,"FG04-B",[Refund(p.Id,1,AugustFirst,restock:1)]));
        await FGVerify(db,v2,[Link(note.Id,1,"Corrected refund slip in August")],ReviewerUser);
        Assert.Equal((7,0,1,2,0,10,true),await Ledger(db)); Assert.Equal(1,(await Position(db)).OpenSurplus); await FGInvariant(db);
        Assert.Equal(frozen,await FGFrozen(db));
    }

    [Fact]
    public async Task FG05_OriginalB2PeriodsAndUnallocatedVerificationRemainSeparate()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext();
        var (a,p,_)=await Month(db,"fg05"); var early=await ClosedCount(db,Count("2026-08-15",6));
        await ClosedCount(db,Count("2026-08-31",5));
        var ds=await Later(db).DiscrepanciesAsync(BranchId,"Open",default);
        var first=ds.Single(d=>d.OriginStocktakeId==early.Id); var eligible=ds.Single(d=>d.Id!=first.Id);
        var r=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG05-B",[Sale(p.Id,1)]));
        Assert.Equal(eligible.Id,r.LateReport!.Skus.Single().Candidates.Single().DiscrepancyId);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,r,[Link(first.Id,1)]))).StatusCode);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,r,[Link(eligible.Id,1),Link(eligible.Id,1)]))).StatusCode);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,r,[Link(eligible.Id,1,"Count sheet photo 2026-08-31")]))).StatusCode);
        await FGVerify(db,r); // No evidence => no automatic settlement.
        Assert.Equal(2,(await Later(db).DiscrepanciesAsync(BranchId,"Open",default)).Sum(d=>d.OpenQuantity));
        Assert.Equal((4,0,2,4,0,10,true),await Ledger(db)); await FGInvariant(db);
    }

    [Fact]
    public async Task FG06_OriginalThreeAdminBypassIsRefusedAndBothSubjectsGetReviewHistory()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        await Month(db,"fg06"); await ClosedCount(db,Count("2026-08-15",5));
        var shortfall=await OpenDiscrepancy(db,"Shortage"); var svc=Later(db);
        var next=await svc.CreateStocktakeAsync(ReviewerUser,Count("2026-08-31",7),default);
        next=await svc.RecordStocktakeAsync(ReviewerUser,next.Id,new(next.ConcurrencyToken),default);
        await svc.ApproveStocktakeAsync(OwnerAccountId,next.Id,Close(next),default);
        var surplus=await OpenDiscrepancy(db,"Surplus");
        var request=new ResolveConsignmentDiscrepancyRequest(surplus.ConcurrencyToken,"EarlierShortageFound",2,"New picture of found packages","Owner located packages behind the counter",shortfall.Id);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>svc.ResolveDiscrepancyAsync(AdminAccountId,surplus.Id,request,default))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>svc.ResolveDiscrepancyAsync(ReviewerUser,surplus.Id,request,default))).StatusCode);
        await svc.ResolveDiscrepancyAsync(OwnerAccountId,surplus.Id,request,default); await FGInvariant(db);
        var subjects=await db.ConsignmentReviewEvents.Where(e=>e.SubjectType=="ConsignmentStockDiscrepancy").Select(e=>e.SubjectId).ToListAsync();
        Assert.Contains(shortfall.Id,subjects); Assert.Contains(surplus.Id,subjects);
    }

    [Fact]
    public async Task FG07_OriginalEvidenceReuseAndFabricatedReturnAreRefused()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext();
        await Month(db,"fg07"); var count=await ClosedCount(db,Count("2026-08-31",5,1));
        var damaged=await OpenDiscrepancy(db,"UnsellableFound");
        Assert.DoesNotContain("ReturnedToMyPetLink",damaged.AllowedOutcomes);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>Resolve(db,damaged,"ReturnedToMyPetLink",1))).StatusCode);
        var d=await OpenDiscrepancy(db,"Shortage"); await SoloAccess(db); await SetMode(db);
        var original=count.EvidenceReference;
        var bad=new ResolveConsignmentDiscrepancyRequest(d.ConcurrencyToken,"Found",1," "+original.ToUpperInvariant()+" ","Confirmed that a missing package was found",SelfReview:Attest(original));
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>SoloLater(db).ResolveDiscrepancyAsync(AdminAccountId,d.Id,bad,default))).StatusCode);
        var good=bad with { EvidenceReference="New photo of located package",SelfReview=Attest("New photo of located package") };
        await SoloLater(db).ResolveDiscrepancyAsync(AdminAccountId,d.Id,good,default); await FGInvariant(db);
    }

    [Theory]
    [InlineData("2027-02-28","2027-03-01")]
    [InlineData("2028-02-29","2028-03-01")]
    public async Task FG08_RealCountAndCutoffRemainSeparateAtFebruaryBoundaries(string end,string next)
    {
        await using var scope=await Database(10); await using var db=scope.NewContext();
        await Month(db,"fg08"+end); var now=CountTime(next,10); var svc=At(db,now);
        foreach(var at in new[]{CountTime(end,21),CountTime(next,0).AddSeconds(1),CountTime(next,8)}) {
            var input=Count(end,7) with { CountedAt=at,CountedAfterCutoffNote=at>=CountTime(next,0)?"Shop was shut; no receipts sales or returns occurred before count":null };
            var draft=await svc.CreateStocktakeAsync(AdminAccountId,input,default);
            Assert.Equal(at,draft.CountedAt); Assert.Equal(CountTime(next,0),draft.CutoffAt);
            var recorded=await svc.RecordStocktakeAsync(AdminAccountId,draft.Id,new(draft.ConcurrencyToken),default);
            Assert.Equal(now,recorded.RecordedAt); Assert.NotEqual(recorded.CountedAt,recorded.RecordedAt);
            await svc.VoidStocktakeAsync(AdminAccountId,recorded.Id,new(recorded.ConcurrencyToken,"Testing next legitimate physical count time"),default);
        }
        var tooLate=Count(end,7) with { CountedAt=CountTime(next,0).AddHours(24).AddSeconds(1),CountedAfterCutoffNote="Shop has not reopened and stock has not moved" };
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>At(db,CountTime(next,0).AddHours(25)).CreateStocktakeAsync(AdminAccountId,tooLate,default))).StatusCode);
    }

    [Fact]
    public async Task FG09_DiscoveredMorningSaleNeedsExplicitLaterReconciliationWithoutBackdatingCount()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext();
        var (a,p,_)=await Month(db,"fg09");
        var morning=CountTime("2026-09-01",8);
        var count=await ClosedCount(db,Count("2026-08-31",6) with { CountedAt=morning,CountedAfterCutoffNote="Shop owner believed no sales or deliveries occurred before counting" },ReportClock);
        Assert.Equal(morning,count.CountedAt); var shortfall=await OpenDiscrepancy(db,"Shortage");
        // A sale actually made on Sep 1 is subsequently reported in its real September period.
        await Verified(db,ReportFor(a.Id,"2026-09",1,"FG09-C",[Sale(p.Id,1)]),LateClock);
        Assert.Equal(1,(await DiscrepancyById(db,shortfall.Id)).OpenQuantity); await FGInvariant(db);
        // Fresh count/evidence reconciles the false no-movement assumption, preserving the frozen August count.
        await ClosedCount(db,Count("2026-09-15",6),LateClock); var note=await OpenDiscrepancy(db,"Surplus");
        await Resolve(db,note,"EarlierShortageFound",1,shortfall.Id,clock:LateClock);
        Assert.Equal((6,0,0,4,0,10,true),await Ledger(db)); await FGInvariant(db);
        Assert.Equal(morning,(await Later(db).GetStocktakeAsync(count.Id,default)).CountedAt);
    }

    // Snapshot every stored column, including rowversions, for the business subjects and audit.
    private static async Task<string> FGAllState(MyPetLinkDbContext db)
    {
        var tables=db.Model.GetEntityTypes().Select(t=>t.GetTableName()!).Distinct()
            .Where(t=>t.StartsWith("Consignment") || t.Contains("SmartTag") || t.Contains("Inventory") || t=="AuditLogs").OrderBy(t=>t).ToArray();
        var result=new SortedDictionary<string,string[]>(); var conn=db.Database.GetDbConnection();
        if(conn.State!=System.Data.ConnectionState.Open) await conn.OpenAsync();
        foreach(var table in tables) {
            using var command=conn.CreateCommand(); command.CommandText="SELECT * FROM [dbo].["+table.Replace("]","]]")+"]";
            await using var reader=await command.ExecuteReaderAsync(); var rows=new List<string>();
            while(await reader.ReadAsync()) {
                var values=new object?[reader.FieldCount]; for(int i=0;i<values.Length;i++) values[i]=reader.IsDBNull(i)?null:reader.GetValue(i);
                rows.Add(System.Text.Json.JsonSerializer.Serialize(values));
            }
            result[table]=rows.OrderBy(x=>x,StringComparer.Ordinal).ToArray();
        }
        return System.Text.Json.JsonSerializer.Serialize(result);
    }
    private static Task FGSave(string name,object value) => System.IO.File.WriteAllTextAsync(
        "C:/Project/MyPetLink/artifacts/consignment-phase1b-go-no-go/"+name+".json",
        System.Text.Json.JsonSerializer.Serialize(value,new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy=System.Text.Json.JsonNamingPolicy.CamelCase,WriteIndented=true }));

    [Fact]
    public async Task FG10_IntendedSoldOutReportRefusesBadLinksThenVerifiesExactlyOnce()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext();
            var (a,p,_)=await Month(db,"fg10-final"); await ClosedCount(db,Count("2026-08-31",0));
            var shortage=await OpenDiscrepancy(db,"Shortage"); var units=await UnitSnapshot(db);
            var report=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG10-FINAL-B",[Sale(p.Id,7)]));
            Assert.Equal(report.Issues,report.LinkResolvableIssues);
            Assert.Single(report.Issues); Assert.Equal(7,report.LateReport!.Skus.Single().RequiredLinks);
            Assert.Equal(7,report.LateReport.Skus.Single().Candidates.Single().OpenQuantity);
            await FGSave("sold-out-report",report);
            var state=await FGAllState(db);
            foreach(var links in new IReadOnlyList<ConsignmentLateAllocationRequest>?[] {
                null,[Link(shortage.Id,6)],[Link(shortage.Id,8)],[Link(Guid.NewGuid(),7)],
                [Link(shortage.Id,4),Link(shortage.Id,3)] }) {
                Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,report,links))).StatusCode);
                Assert.Equal(state,await FGAllState(db));
            }
            var error=await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,report,[Link(shortage.Id,7,"Count sheet photo 2026-08-31")]));
            Assert.Equal(400,error.StatusCode); Assert.Equal(state,await FGAllState(db));
            await FGSave("invalid-link-error",new { error.StatusCode,error.Code,error.Message });
            var verified=await FGVerify(db,report,[Link(shortage.Id,7,"Seven dated sale receipts before count")]);
            await FGSave("sold-out-verified",verified);
            Assert.Equal((0,0,0,10,0,10,true),await Ledger(db)); Assert.Equal("Resolved",(await DiscrepancyById(db,shortage.Id)).Status);
            await FGInvariant(db); Assert.Equal(units,await UnitSnapshot(db)); await AssertNoFinancialRecords(db);
            var completed=await FGAllState(db);
            Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,verified,[Link(shortage.Id,7)]))).StatusCode);
            Assert.Equal(completed,await FGAllState(db));
        } finally { MigratedSchema.Value=false; }
    }

    [Fact]
    public async Task FG11_IntendedExactChronologyRefusesWithoutAnyStoredMutationThenCarriesNoteOnce()
    {
        MigratedSchema.Value=true;
        try {
            await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
            var (a,p,_)=await Month(db,"fg11-final"); await ClosedCount(db,Count("2026-08-31",9));
            var note=await OpenDiscrepancy(db,"Surplus");
            var v1=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG11-FINAL-B",[Refund(p.Id,1,AugustFirst,restock:1)]));
            v1=await FGVerify(db,v1,[Link(note.Id,1,"Original dated refund slip")],clock:ReportClock);
            await ClosedCount(db,Count("2026-09-15",8),CountTime("2026-09-16",10));
            await ClosedCount(db,Count("2026-09-30",8),CountTime("2026-10-01",10));
            Assert.Equal((8,0,0,2,0,10,true),await Ledger(db)); Assert.Equal(0,(await Position(db)).OpenSurplus);
            var svc=At(db,CountTime("2026-10-20",10));
            var v2=await svc.CorrectSalesReportAsync(OwnerAccountId,v1.Id,new(v1.ConcurrencyToken,"Refund record confirms no physical sealed return"),default);
            v2=await svc.UpdateSalesReportAsync(AdminAccountId,v2.Id,v2.ConcurrencyToken,ReportFor(a.Id,"2026-08",2,"FG11-FINAL-B",[Refund(p.Id,1,AugustFirst)]),default);
            v2=await svc.RecordSalesReportAsync(AdminAccountId,v2.Id,new(v2.ConcurrencyToken),default);
            v2=await FGVerify(db,v2,null,ReviewerUser,CountTime("2026-10-20",10));
            Assert.Equal((7,0,0,3,0,10,true),await Ledger(db)); Assert.Equal(1,(await Position(db)).OpenSurplus);
            var units=await UnitSnapshot(db); var frozen=await FGFrozen(db);
            var october21=CountTime("2026-10-21",10); var current=At(db,october21);
            var preview=await current.StocktakeExpectationAsync(BranchId,"2026-10-15",default);
            Assert.Equal((8,0,8),(preview.Lines.Single().BookSellable,preview.Lines.Single().OpenSurplusBefore,preview.Lines.Single().ExpectedSellable));
            Assert.NotEmpty(preview.Issues);
            var count=await RecordedCount(db,Count("2026-10-15",8),october21);
            Assert.Equal(preview.Issues,count.Issues);
            var before=await FGAllState(db);
            var error=await Assert.ThrowsAsync<ApiException>(()=>current.ApproveStocktakeAsync(OwnerAccountId,count.Id,Close(count),default));
            Assert.Equal((409,"historical_count_incompatible"),(error.StatusCode,error.Code));
            Assert.Equal(before,await FGAllState(db));
            var kept=await current.GetStocktakeAsync(count.Id,default);
            Assert.Equal(("Recorded",CountTime("2026-10-15",21),CountTime("2026-10-16",0)),(kept.Status,kept.CountedAt,kept.CutoffAt));
            await FGSave("historical-close-refused",new { preview,count,error=new { error.StatusCode,error.Code,error.Message },unchanged=true });
            await current.VoidStocktakeAsync(AdminAccountId,count.Id,new(kept.ConcurrencyToken,"Count predates the October correction; recount next cutoff"),default);
            var next=await ClosedCount(db,Count("2026-10-31",8),CountTime("2026-11-01",10));
            Assert.Equal((7,1,8,0,0,1),(next.Lines.Single().BookSellable,next.Lines.Single().OpenSurplusBefore,next.Lines.Single().ExpectedSellable,
                next.Lines.Single().Shortage+next.Lines.Single().Surplus,next.Lines.Single().SurplusNoLongerPresent,next.Lines.Single().OpenSurplusAfter));
            Assert.Equal(1,(await Position(db)).OpenSurplus);
            var oldIds=System.Text.Json.JsonDocument.Parse(frozen).RootElement.EnumerateArray().Select(x=>x.GetProperty("Id").GetGuid()).ToHashSet();
            var all=System.Text.Json.JsonDocument.Parse(await FGFrozen(db)).RootElement.EnumerateArray().Where(x=>oldIds.Contains(x.GetProperty("Id").GetGuid())).Select(x=>x.GetRawText());
            Assert.Equal(frozen,"["+string.Join(",",all)+"]");
            Assert.Equal((7,0,0,3,0,10,true),await Ledger(db)); await FGInvariant(db); Assert.Equal(units,await UnitSnapshot(db)); await AssertNoFinancialRecords(db);
            await FGSave("historical-next-valid-count",next);
        } finally { MigratedSchema.Value=false; }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FG12_ActualMixedAndUncoverableAssessmentsRemainStructural(bool tooMany)
    {
        await using var scope=await Database(10); await using var db=scope.NewContext();
        var (a,p,_)=await Month(db,"fg12-final"+tooMany); await ClosedCount(db,Count("2026-08-31",0));
        var d=await OpenDiscrepancy(db,"Shortage");
        var report=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG12-FINAL-B",[tooMany?Sale(p.Id,8):Sale(null,7,35m)]));
        if(tooMany) { Assert.Empty(report.LinkResolvableIssues); Assert.Equal(0,report.LateReport!.Skus.Single().RequiredLinks); }
        else { Assert.Single(report.LinkResolvableIssues); Assert.Contains(report.Issues,i=>i.Contains("approved price")&&!report.LinkResolvableIssues.Contains(i)); }
        await FGSave(tooMany?"uncoverable-report":"mixed-structural-report",report);
        var before=await FGAllState(db);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>FGVerify(db,report,[Link(d.Id,7,"Seven dated sale receipts")]))).StatusCode);
        Assert.Equal(before,await FGAllState(db)); Assert.Equal((0,0,7,3,0,10,true),await Ledger(db)); await FGInvariant(db);
    }

    [Fact]
    public async Task FG13_ConcurrentCorrectionAndCountCannotConsumeReopenedSurplus()
    {
        await using var scope=await Database(10); await using var db=scope.NewContext(); await AddReviewer(db);
        var (a,p,_)=await Month(db,"fg13-final"); await ClosedCount(db,Count("2026-08-31",9));
        var note=await OpenDiscrepancy(db,"Surplus");
        var v1=await Recorded(db,ReportFor(a.Id,"2026-08",2,"FG13-FINAL-B",[Refund(p.Id,1,AugustFirst,restock:1)]));
        v1=await FGVerify(db,v1,[Link(note.Id,1,"Original dated refund slip")],clock:ReportClock);
        var recorded=await RecordedCount(db,Count("2026-09-15",9),CountTime("2026-09-16",10)); Assert.Empty(recorded.Issues);
        var correction=Task.Run(async()=> {
            await using var c=scope.NewContext();
            var v2=await CorrectAt(c,v1,ReportFor(a.Id,"2026-08",2,"FG13-FINAL-B",[Refund(p.Id,1,AugustFirst)]),CountTime("2026-09-17",10));
            return await FGVerify(c,v2,null,ReviewerUser,CountTime("2026-09-17",10));
        });
        var closing=Task.Run(async()=> {
            await using var c=scope.NewContext();
            try { await At(c,CountTime("2026-09-18",10)).ApproveStocktakeAsync(OwnerAccountId,recorded.Id,Close(recorded),default); return 200; }
            catch(ApiException e) { Assert.Contains(e.StatusCode,new[]{400,409}); return e.StatusCode; }
        });
        await Task.WhenAll(correction,closing);
        Assert.Equal("Verified",correction.Result.Status); Assert.Equal(2,(await Position(db)).OpenSurplus);
        Assert.Equal((7,0,0,3,0,10,true),await Ledger(db)); await FGInvariant(db);
        Assert.False(await db.ConsignmentDiscrepancyResolutions.AnyAsync(r=>r.Outcome=="NoLongerPresent"));
        if(closing.Result!=200) {
            var before=await FGAllState(db);
            var error=await Assert.ThrowsAsync<ApiException>(()=>At(db,CountTime("2026-09-18",10)).ApproveStocktakeAsync(OwnerAccountId,recorded.Id,Close(recorded),default));
            Assert.Equal((409,"historical_count_incompatible"),(error.StatusCode,error.Code)); Assert.Equal(before,await FGAllState(db));
        }
        await AssertNoFinancialRecords(db);
    }
}
