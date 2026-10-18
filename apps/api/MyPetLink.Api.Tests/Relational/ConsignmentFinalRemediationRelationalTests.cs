using System.Data.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

public sealed partial class ConsignmentRelationalTests
{
    private static readonly Guid ReviewerUser=Guid.Parse("f9000000-0000-0000-0000-000000000003");
    private static readonly Guid ReviewerAdmin=Guid.Parse("f9000000-0000-0000-0000-000000000004");
    private static async Task AddReviewer(MyPetLinkDbContext db)
    {
        db.Users.Add(new User {Id=ReviewerUser,Email="synthetic-reviewer@example.invalid",NormalizedEmail="SYNTHETIC-REVIEWER@EXAMPLE.INVALID",DisplayName="Synthetic reviewer",Status=UserStatus.Active});
        db.AdminUsers.Add(new AdminUser {Id=ReviewerAdmin,UserId=ReviewerUser,IsActive=true});await db.SaveChangesAsync();
    }
    private static async Task<ConsignmentDispatchResponse> ShippedConsignment(MyPetLinkDbContext db,int quantity)
    {
        var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,quantity),default);
        return await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d,"SYN-SHIP"),default);
    }
    private static ConsignmentReceiptEvidence Findings(Guid[] good,Guid[]? damaged=null,Guid[]? missing=null,Guid[]? returned=null) =>
        new("Synthetic recipient",Now,good.Length+(damaged?.Length??0),damaged?.Length??0,missing?.Length??0,"SIGNED-SYNTHETIC-EVIDENCE",good,damaged??[],missing??[],returned??[]);

    [Fact]
    public async Task N1HeldConsignmentShipsDespiteLaterRetailPendingBacklog()
    {
        await using var scope=await Database(8);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);var ids=d.Units.Select(u=>u.Id).ToArray();
        foreach(var t in await db.SmartTags.Where(SellableInventoryRules.OnShelf(db)).Take(3).ToListAsync())t.QaStatus=PhysicalQaStatus.Pending;
        await db.SaveChangesAsync();await RetailReservation(db,2);
        Assert.Equal(1,await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db,NfcVariantId)).CountAsync());
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d,"SYN-HELD-DISPATCH"),default);
        Assert.Equal("Dispatched",d.Status);Assert.Equal(ids,d.Units.Select(u=>u.Id));
        Assert.Equal(1,await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db,NfcVariantId)).CountAsync());
    }
    [Fact]
    public async Task N1WholesaleReadyAndShipmentDoNotReconsumeShelfStock()
    {
        await using var scope=await Database(8);await using var db=scope.NewContext();
        db.MerchantOrderItems.Remove(await db.MerchantOrderItems.SingleAsync(x=>x.Id==QrItemId));
        var o=await db.MerchantOrders.SingleAsync(x=>x.Id==OrderId);
        o.MerchandiseSubtotal=(await db.MerchantOrderItems.SingleAsync(x=>x.Id==NfcItemId)).LineSubtotal;o.DiscountTotal=0;o.DeliveryFee=0;o.GrandTotal=o.MerchandiseSubtotal;
        await db.SaveChangesAsync();await IssueInvoiceAsync(db);var s=Service(db);await s.AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,4));
        var assigned=await db.MerchantOrderAllocatedTags.Select(x=>x.SmartTagId).OrderBy(x=>x).ToArrayAsync();
        foreach(var t in await db.SmartTags.Where(SellableInventoryRules.OnShelf(db)).Take(3).ToListAsync())t.QaStatus=PhysicalQaStatus.Pending;
        await db.SaveChangesAsync();await RetailReservation(db,2);
        await s.MarkReadyToShipAsync(AdminAccountId,OrderId,new());
        await s.MarkShippedAsync(AdminAccountId,OrderId,new(null,"Synthetic courier",null,"SYN-TRACK",null,null));
        Assert.Equal(assigned,await db.MerchantOrderAllocatedTags.Where(x=>x.ReleasedAt==null).Select(x=>x.SmartTagId).OrderBy(x=>x).ToArrayAsync());
        Assert.Equal(1,await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db,NfcVariantId)).CountAsync());
    }
    [Fact]
    public async Task N1ConcurrentPhysicalQaDowngradeAndDispatchCannotShipFailedStock()
    {
        await using var scope=await Database(2);ConsignmentDispatchResponse d;Guid tagId;int version;
        await using(var db=scope.NewContext()) {var agreement=await Agreement(db);d=await Custody(db).ReserveAsync(AdminAccountId,Reserve(agreement.Id,2),default);var t=await db.SmartTags.FirstAsync();tagId=t.Id;version=t.QaVersion;}
        var start=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<bool> Run(bool dispatch) {
            await start.Task;await using var db=scope.NewContext();try {
                if(dispatch)await Custody(db).ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d,"SYN-QA-RACE"),default);
                else await PhysicalQaTests.Service(db,new FixedClock(Now)).SaveAsync(AdminAccountId,tagId,new(Guid.NewGuid(),version,PhysicalQaStatus.Failed,PhysicalTagCondition.Damaged,null,null,"Synthetic damaged package"),default);
                return true;
            }catch(ApiException e){Assert.Contains(e.StatusCode,new[]{400,409});return false;}
        }
        var a=Run(true);var b=Run(false);start.SetResult();var wins=await Task.WhenAll(a,b);
        Assert.Contains(true,wins);await using var check=scope.NewContext();var tag=await check.SmartTags.SingleAsync(x=>x.Id==tagId);
        var sent=(await check.ConsignmentDispatches.SingleAsync()).DispatchedAt!=null;
        Assert.False(sent&&tag.QaStatus==PhysicalQaStatus.Failed);
    }
    [Fact]
    public async Task N2ActualHundredUnitPartialReceiptAllowsGoodStockAndPreservesEveryHold()
    {
        await using var scope=await Database(100);await using var db=scope.NewContext();await AddReviewer(db);var s=Custody(db);var d=await ShippedConsignment(db,100);
        var good=d.Units.Take(98).Select(u=>u.Id).ToArray();var damaged=d.Units[98].Id;var missing=d.Units[99].Id;
        var request=Action(d,"SYN-PARTIAL-99-COUNTED") with {Receipt=Findings(good,[damaged],[missing])};
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",request,default);
        Assert.True(d.HasOpenDiscrepancy);Assert.Equal(99,d.ReceivedQuantity);Assert.Equal(98,d.Units.Count(u=>u.Status=="Received"));
        var events=await db.ConsignmentMovements.CountAsync();var replay=await s.ActionAsync(OwnerAccountId,d.Id,"receive",request,default);
        Assert.Equal(d.ConcurrencyToken,replay.ConcurrencyToken);Assert.Equal(events,await db.ConsignmentMovements.CountAsync());
        d=await s.ActionAsync(OwnerAccountId,d.Id,"external-handover",Action(d,"SYN-GOOD-SALE",[good[0]]) with {Handover=Handover("PARTIAL-GOOD")},default);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(OwnerAccountId,d.Id,"external-handover",Action(d,"SYN-MISSING-SALE",[missing]) with {Handover=Handover("PARTIAL-MISSING")},default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"SYN-ACTUAL-DAMAGED-RETURN",[damaged]),default);
        var t=await db.ConsignmentUnits.Where(u=>u.Id==damaged).Select(u=>u.SmartTag).SingleAsync();await InspectReturn(db,t,pass:false);
        d=await s.GetAsync(d.Id,false,default);d=await s.ActionAsync(AdminAccountId,d.Id,"write-off",Action(d,"SYN-FAILED-RETURN-WRITEOFF",[damaged]),default);
        var review=Action(d,"SYN-REVIEW-ACTUAL-RETURN") with {Receipt=Findings([],returned:[damaged]) with {Recipient="Independent return reviewer",ReceivedAt=Now.AddMinutes(1)}};
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(OwnerAccountId,d.Id,"resolve-discrepancy",review,default))).StatusCode);
        d=await s.ActionAsync(ReviewerUser,d.Id,"resolve-discrepancy",review,default);
        Assert.Equal(99,d.ReceivedQuantity);Assert.Equal("Synthetic recipient",d.RecipientName);Assert.Equal(Now,d.PartnerReceivedAt);
        Assert.Equal(98,d.Units.Count(u=>u.ReceivingState=="Good"));
        Assert.True(d.HasOpenDiscrepancy);Assert.Equal("Missing",d.Units.Single(u=>u.Id==missing).ReceivingState);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"write-off",Action(d,"NO-FABRICATED-RETURN",[missing]),default));
        Assert.Equal("Dispatched",d.Units.Single(u=>u.Id==missing).Status);
        Assert.Equal(100,await db.ConsignmentUnits.CountAsync(u=>u.ReleasedAt==null));
        Assert.Empty(db.MerchantPayments);Assert.Empty(db.MerchantInvoices);Assert.Empty(db.MerchantReceipts);Assert.Empty(db.SalesCommissions);Assert.Empty(db.TagOrders);Assert.Empty(db.CommissionPayouts);
        var pdf=await Documents(db).PdfAsync(AdminAccountId,d.Id,default);Assert.Equal((await db.ConsignmentDispatches.SingleAsync()).IssuedDocumentContent,pdf.Content);
    }
    [Fact]
    public async Task N2LocatedMissingAndReviewedReturnedDamageCompleteWithoutFalseRecount()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();await AddReviewer(db);var s=Custody(db);var d=await ShippedConsignment(db,4);
        var good=d.Units.Take(2).Select(u=>u.Id).ToArray();var damaged=d.Units[2].Id;var missing=d.Units[3].Id;
        d=await s.ActionAsync(OwnerAccountId,d.Id,"record-discrepancy",Action(d,"SYN-MIXED") with {Receipt=Findings(good,[damaged],[missing])},default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"SYN-PHYSICAL-RETURN",[damaged]),default);
        d=await s.ActionAsync(ReviewerUser,d.Id,"resolve-discrepancy",Action(d,"SYN-LOCATED-AND-RETURN-REVIEW") with {Receipt=Findings([missing],returned:[damaged])},default);
        Assert.False(d.HasOpenDiscrepancy);Assert.Equal("Received",d.Status);Assert.Equal(1,d.ReceivedQuantity);Assert.Equal(3,d.Units.Count(u=>u.ReceivingState=="Good"));Assert.Equal(1,d.ReturnedQuarantine);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"external-handover",Action(d,"SYN-LOCATED-HANDOVER",[missing]) with {Handover=Handover("LOCATED-GOOD")},default);
        Assert.Equal(1,d.ExternalHandovers);Assert.Equal("Returned",d.Units.Single(u=>u.Id==damaged).ReceivingState);
    }
    [Fact]
    public async Task N2MissingLocatedCentrallyNeedsActualReturnAndIndependentReviewNotPartnerReceipt()
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();await AddReviewer(db);var s=Custody(db);var d=await ShippedConsignment(db,1);var unit=d.Units[0].Id;
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"SYN-MISSING") with {Receipt=Findings([],missing:[unit])},default);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(ReviewerUser,d.Id,"resolve-discrepancy",Action(d,"NO-ACTUAL-RETURN") with {Receipt=Findings([],returned:[unit])},default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"SYN-FOUND-CENTRALLY-PHYSICAL-RETURN",[unit]),default);
        Assert.Null(d.ReceivedQuantity);Assert.True(d.HasOpenDiscrepancy);Assert.Equal(1,d.ReturnedQuarantine);
        d=await s.ActionAsync(ReviewerUser,d.Id,"resolve-discrepancy",Action(d,"SYN-INDEPENDENT-RETURN-REVIEW") with {Receipt=Findings([],returned:[unit])},default);
        Assert.False(d.HasOpenDiscrepancy);Assert.Null(d.ReceivedQuantity);Assert.Null(d.PartnerReceivedAt);Assert.Null(d.ReceiptAcknowledgment);Assert.Equal("Returned",d.Units[0].ReceivingState);
        Assert.Equal(0,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
    }
    [Fact]
    public async Task N2ConcurrentConflictingReceivingFindingsHaveExactlyOneWinner()
    {
        await using var scope=await Database(2);ConsignmentDispatchResponse d;
        await using(var db=scope.NewContext())d=await ShippedConsignment(db,2);
        var start=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<bool> Receive(bool missing) {await start.Task;await using var db=scope.NewContext();try {
            await Custody(db).ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,missing?"SYN-SHORT":"SYN-FULL") with {Receipt=missing?Findings([d.Units[0].Id],missing:[d.Units[1].Id]):Findings(d.Units.Select(u=>u.Id).ToArray())},default);return true;
        }catch(ApiException e){Assert.Equal(409,e.StatusCode);return false;}}
        var a=Receive(true);var b=Receive(false);start.SetResult();Assert.Single((await Task.WhenAll(a,b)).Where(x=>x));
        await using var check=scope.NewContext();Assert.Equal(2,await check.ConsignmentUnits.CountAsync(u=>u.ReleasedAt==null));
        Assert.Equal(1,await check.ConsignmentMovements.CountAsync(m=>m.Action=="receive"));
    }
    [Fact]
    public async Task N3AllSubstantiveContributorsRemainIneligibleAfterNoOpAndRepeatedSaves()
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();await AddReviewer(db);var s=Custody(db);
        var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        a=await s.SaveAgreementAsync(OwnerAccountId,a.Id,Terms(),a.ConcurrencyToken,default);
        Assert.Single(await db.ConsignmentDraftContributors.ToListAsync());
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"SELF"),default))).StatusCode);
        a=await s.SaveAgreementAsync(OwnerAccountId,a.Id,Terms() with {ReturnTerms="Substantive edited return terms"},a.ConcurrencyToken,default);
        a=await s.SaveAgreementAsync(AdminAccountId,a.Id,Terms(),a.ConcurrencyToken,default);
        a=await s.SaveAgreementAsync(ReviewerUser,a.Id,Terms(),a.ConcurrencyToken,default);
        Assert.Equal(2,await db.ConsignmentDraftContributors.CountAsync());
        foreach(var user in new[]{AdminAccountId,OwnerAccountId}) Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(user,a.Id,"approve",new(a.ConcurrencyToken,"SELF"),default))).StatusCode);
        a=await s.AgreementActionAsync(ReviewerUser,a.Id,"approve",new(a.ConcurrencyToken,"INDEPENDENT"),default);
        Assert.Equal(ReviewerAdmin,(await db.ConsignmentAgreements.SingleAsync()).ApprovedByAdminUserId);
        Assert.True((await db.ConsignmentDraftContributors.SingleAsync(c=>c.AdminUserId==AdminRecordId)).IsCreator);
    }
    [Theory]
    [InlineData("1000000000000000",false)]
    [InlineData("1000000",false)]
    [InlineData("999999.99",true)]
    [InlineData("49.90",true)]
    public async Task N7ReportedPriceUsesExistingB2bAmountLimitWithoutCatalogueCap(string price,bool allowed)
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();var s=Custody(db);var d=await ShippedConsignment(db,1);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"SYN-RX") with {Receipt=Receipt(d)},default);
        var request=Action(d,"SYN-PRICE",[d.Units[0].Id]) with {Handover=Handover(sale:true) with {SellingPrice=decimal.Parse(price,System.Globalization.CultureInfo.InvariantCulture)}};
        if(allowed) Assert.Equal(1,(await s.ActionAsync(OwnerAccountId,d.Id,"external-handover",request,default)).ExternalHandovers);
        else Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(OwnerAccountId,d.Id,"external-handover",request,default))).StatusCode);
    }
    private sealed class CaptureReadSql : DbCommandInterceptor
    {
        public List<string> Queries {get;}=[];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,CommandEventData data,InterceptionResult<DbDataReader> result,CancellationToken ct=default) {Queries.Add(command.CommandText);return ValueTask.FromResult(result);}
    }
    [Fact]
    public async Task N2PassedDamagedReturnCannotReenterStockBeforeIndependentReview()
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();await AddReviewer(db);var s=Custody(db);var d=await ShippedConsignment(db,1);var unit=d.Units[0].Id;
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"SYN-DAMAGED") with {Receipt=Findings([],damaged:[unit])},default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"SYN-ACTUAL-RETURN",[unit]),default);
        var tag=await db.ConsignmentUnits.Where(u=>u.Id==unit).Select(u=>u.SmartTag).SingleAsync();await InspectReturn(db,tag);
        d=await s.GetAsync(d.Id,false,default);
        Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"release",Action(d,"SYN-PREMATURE-RELEASE",[unit]),default))).StatusCode);
        Assert.Equal(0,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
        d=await s.ActionAsync(ReviewerUser,d.Id,"resolve-discrepancy",Action(d,"SYN-INDEPENDENT-REVIEW") with {Receipt=Findings([],returned:[unit])},default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"release",Action(d,"SYN-REVIEWED-PASSED-RELEASE",[unit]),default);
        Assert.Equal(1,d.Released);Assert.Equal(1,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
    }
    [Fact]
    public async Task N2MissingAndDamagedCannotActivateWhileConfirmedGoodRemainsUsable()
    {
        await using var scope=await Database(3);await using var db=scope.NewContext();var s=Custody(db);var d=await ShippedConsignment(db,3);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"SYN-PARTIAL-ACTIVATION-GATE") with {Receipt=Findings([d.Units[0].Id],[d.Units[1].Id],[d.Units[2].Id])},default);
        var manifest=await Documents(db).ManifestAsync(AdminAccountId,d.Id,default);var pet=Guid.NewGuid();
        db.Pets.Add(new Pet {Id=pet,OwnerUserId=OwnerAccountId,Name="Synthetic pet",Slug="synthetic-activation-gate",Species="Dog",LifecycleStatus=PetLifecycleStatus.Active});await db.SaveChangesAsync();
        var tags=new SmartTagService(db,new AuditLogService(db,new HttpContextAccessor()));
        foreach(var blocked in manifest.Units.Where(u=>u.ReceivingState is "Missing" or "Damaged"))
            Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>tags.ActivateAsync(OwnerAccountId,blocked.TagCode!,new(pet)))).StatusCode);
        var good=manifest.Units.Single(u=>u.ReceivingState=="Good");await tags.ActivateAsync(OwnerAccountId,good.TagCode!,new(pet));
        Assert.Equal(1,await db.SmartTags.CountAsync(t=>t.OwnerUserId!=null));
        Assert.True((await s.GetAsync(d.Id,false,default)).HasOpenDiscrepancy);
    }
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task N2ExistingOwnerCannotBeReclassifiedAsMissingOrDamagedStock(bool missing)
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();var s=Custody(db);var d=await ShippedConsignment(db,1);
        var code=(await Documents(db).ManifestAsync(AdminAccountId,d.Id,default)).Units[0].TagCode!;var pet=Guid.NewGuid();
        db.Pets.Add(new Pet {Id=pet,OwnerUserId=OwnerAccountId,Name="Synthetic pet",Slug="synthetic-existing-owner",Species="Dog",LifecycleStatus=PetLifecycleStatus.Active});await db.SaveChangesAsync();
        await new SmartTagService(db,new AuditLogService(db,new HttpContextAccessor())).ActivateAsync(OwnerAccountId,code,new(pet));
        var request=Action(d,"SYN-INCORRECT-STOCK-REPORT") with {Receipt=missing?Findings([],missing:[d.Units[0].Id]):Findings([],damaged:[d.Units[0].Id])};
        Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(OwnerAccountId,d.Id,"receive",request,default))).StatusCode);
        Assert.Equal(OwnerAccountId,(await db.SmartTags.SingleAsync()).OwnerUserId);
        Assert.Equal(ConsignmentReceivingState.Unconfirmed,(await db.ConsignmentUnits.SingleAsync()).ReceivingState);
    }
    [Fact]
    public async Task N6ReadQueriesExcludePdfBytesAndN9ReferencesSurviveSortChanges()
    {
        await using var scope=await Database(2);await using var db=scope.NewContext();var d=await ShippedConsignment(db,2);
        var capture=new CaptureReadSql();await using var read=new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>().UseSqlServer(db.Database.GetConnectionString()).AddInterceptors(capture).Options);
        var list=await Custody(read).DispatchesAsync(1,20,null,default);var detail=await Custody(read).GetAsync(d.Id,false,default);
        Assert.Single(list.Items);Assert.True(detail.HasIssuedDocument);Assert.DoesNotContain("IssuedDocumentContent",string.Join('\n',capture.Queries));
        var references=detail.Units.ToDictionary(u=>u.Id,u=>u.UnitReference);
        var units=await db.ConsignmentUnits.OrderBy(u=>u.TagCodeSnapshot).ToListAsync();units[0].TagCodeSnapshot="ZZZ-SYNTHETIC";await db.SaveChangesAsync();
        var changed=await Custody(read).GetAsync(d.Id,false,default);
        Assert.All(changed.Units,u=>{Assert.Equal(references[u.Id],u.UnitReference);Assert.Null(u.TagCode);Assert.StartsWith("CU-",u.UnitReference);});
        Assert.NotEqual(detail.Units[0].Id,changed.Units[0].Id);
        Assert.NotEmpty((await Documents(db).PdfAsync(AdminAccountId,d.Id,default)).Content);
    }
}
