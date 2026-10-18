using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

public sealed partial class ConsignmentRelationalTests
{
    private static readonly Guid BranchId=Guid.Parse("f9000000-0000-0000-0000-000000000001");
    private static readonly Guid CheckerAdminId=Guid.Parse("f9000000-0000-0000-0000-000000000002");
    private static MerchantBranch TestBranch() => new() { Id=BranchId,MerchantId=MerchantId,Name="QA branch",
        AddressLine1="Test partner delivery address",Postcode="50000",City="Kuala Lumpur",State="Kuala Lumpur",Country="Malaysia",IsActive=true };
    private static ConsignmentReceiptEvidence Receipt(ConsignmentDispatchResponse d) => new("Synthetic shop recipient",Now,d.Units.Count,0,0,"SIGNED-TEST-RECEIPT");
    private static ConsignmentHandoverEvidence Handover(string reference="SALE-TEST-1",Guid? original=null,bool sale=false) =>
        new(reference,Now,sale,sale?34.90m:null,sale?5m:null,sale?"External approved promotion":null,original);
    private static ConsignmentDocumentService Documents(MyPetLinkDbContext db) => new(db,Custody(db),new AuditLogService(db,new HttpContextAccessor()));
    private static async Task InspectReturn(MyPetLinkDbContext db,SmartTag tag,bool pass=true)
    {
        var qa=PhysicalQaTests.Service(db,new FixedClock(Now.AddMinutes(1)));
        var qr=await qa.CaptureAsync(AdminAccountId,new(tag.TagCode,tag.QaVersion,QaCaptureSource.Camera,$"https://mypetlink.example/q/{tag.TagCode}",null),default);
        var nfc=await qa.CaptureAsync(AdminAccountId,new(tag.TagCode,tag.QaVersion,QaCaptureSource.WebNfc,$"https://mypetlink.example/n/{tag.TagCode}",tag.QaNfcSerialNumber??"04A1B2C3D4E5F6"),default);
        Assert.True(qr.Matches);Assert.True(nfc.Matches);
        var result=await qa.SaveAsync(AdminAccountId,tag.Id,new(Guid.NewGuid(),tag.QaVersion,pass?PhysicalQaStatus.Passed:PhysicalQaStatus.Failed,
            pass?PhysicalTagCondition.Good:PhysicalTagCondition.Damaged,qr.Evidence,nfc.Evidence,"Synthetic return inspection"),default);
        Assert.NotNull(result.QrVerifiedAt);Assert.NotNull(result.NfcVerifiedAt);
    }
    private static async Task<Guid> RetailReservation(MyPetLinkDbContext db,int quantity,OrderStatus status=OrderStatus.PaymentConfirmed)
    {
        var retail=await SeedRetailOrderAsync(db);
        var item=await db.TagOrderItems.Include(x=>x.Order).SingleAsync(x=>x.Id==retail.OrderItemId);
        item.ProductVariantId=NfcVariantId;item.Quantity=quantity;item.Order.Status=status;await db.SaveChangesAsync();
        return retail.OrderId;
    }

    [Theory]
    [InlineData(OrderStatus.PaymentConfirmed)]
    [InlineData(OrderStatus.PendingPayment)]
    public async Task P01PendingStockNeverReplacesPassedStockNeededByCommittedRetail(OrderStatus status)
    {
        await using var scope=await Database(6);await using var db=scope.NewContext();var a=await Agreement(db);
        foreach(var t in await db.SmartTags.OrderBy(t=>t.Id).Take(2).ToListAsync())t.QaStatus=PhysicalQaStatus.Pending;
        await db.SaveChangesAsync();var orderId=await RetailReservation(db,2,status);
        Assert.Equal(4,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
        var failure=await Assert.ThrowsAsync<ApiException>(()=>Custody(db).ReserveAsync(AdminAccountId,Reserve(a.Id,4),default));
        Assert.Equal("inspected_inventory_reserved",failure.Code);
        Assert.Equal("inspected_inventory_reserved",(await Assert.ThrowsAsync<ApiException>(()=>Service(db).AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,4)))).Code);
        var d=await Custody(db).ReserveAsync(AdminAccountId,Reserve(a.Id,2),default);
        Assert.Equal(2,await db.SmartTags.Where(SellableInventoryRules.OrderableUnitOf(db,NfcVariantId)).CountAsync(t=>t.QaStatus==PhysicalQaStatus.Passed));
        (await db.TagOrders.SingleAsync(o=>o.Id==orderId)).Status=OrderStatus.Cancelled;await db.SaveChangesAsync();
        d=await Custody(db).ActionAsync(AdminAccountId,d.Id,"cancel",Action(d),default);
        Assert.Equal(6,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
    }
    [Fact]
    public async Task ShelfQaFailureAfterReservationDoesNotReconsumeHeldUnits()
    {
        await using var scope=await Database(6);await using var db=scope.NewContext();var a=await Agreement(db);
        var orderId=await RetailReservation(db,2);
        var d=await Custody(db).ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        foreach(var t in await db.SmartTags.Where(SellableInventoryRules.OnShelf(db)).ToListAsync())t.QaStatus=PhysicalQaStatus.Failed;
        await db.SaveChangesAsync();
        d=await Custody(db).ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);Assert.Equal("Dispatched",d.Status);
        Assert.Equal(2,(await db.TagOrderItems.SingleAsync(x=>x.OrderId==orderId)).Quantity);
    }
    [Fact]
    public async Task MakerCheckerAppliesEvenWhenBothActorsAreAdministrators()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var s=Custody(db);
        var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"SIGNED-REF"),default))).StatusCode);
        a=await s.AgreementActionAsync(OwnerAccountId,a.Id,"approve",new(a.ConcurrencyToken,"SIGNED-REF"),default);
        var row=await db.ConsignmentAgreements.SingleAsync();Assert.Equal(CheckerAdminId,row.ApprovedByAdminUserId);Assert.NotNull(row.ApprovedAt);
    }
    [Fact]
    public async Task P06ReceiptRequiresIndependentStructuredEvidenceAndDiscrepancyResolution()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"receive",Action(d) with {Receipt=Receipt(d)},default))).StatusCode);
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"x"),default))).StatusCode);
        await AddReviewer(db);
        var missing=d.Units[3].Id;
        var shortage=Findings(d.Units.Take(3).Select(u=>u.Id).ToArray(),missing:[missing]);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"record-discrepancy",Action(d,"SHORT-TEST-EVIDENCE") with {Receipt=shortage},default);
        Assert.True(d.HasOpenDiscrepancy);Assert.Equal("Dispatched",d.Status);Assert.Equal(3,d.ReceivedQuantity);
        var resolution=Action(d,"FOUND-AND-RECOUNTED") with {Receipt=Findings([missing])};
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(OwnerAccountId,d.Id,"resolve-discrepancy",resolution,default))).StatusCode);
        d=await s.ActionAsync(ReviewerUser,d.Id,"resolve-discrepancy",resolution,default);
        Assert.Equal(1,d.ReceivedQuantity);Assert.Equal(4,d.Units.Count(u=>u.ReceivingState=="Good"));Assert.Equal("Synthetic recipient",d.RecipientName);Assert.False(d.HasOpenDiscrepancy);
        var received=await db.ConsignmentMovements.SingleAsync(m=>m.Action=="record-discrepancy");Assert.Equal(CheckerAdminId,received.ActorAdminUserId);Assert.NotNull(received.EvidenceJson);
    }
    [Fact]
    public async Task P04HandoverReferencesAreUniqueAndCorrectionsAndReversalsRetainOriginals()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"SIGNED-RX") with {Receipt=Receipt(d)},default);
        var unit=d.Units[0].Id;
        d=await s.ActionAsync(AdminAccountId,d.Id,"external-handover",Action(d,"EXTERNAL-TEST-EVIDENCE",[unit]) with {Handover=Handover(sale:true)},default);
        var original=Assert.Single(d.Reconciliation);Assert.Equal(34.90m,original.SellingPrice);Assert.Equal("Unverified external report",original.VerificationStatus);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"external-handover",Action(d,"DUPLICATE",[d.Units[1].Id]) with {Handover=Handover(" sale-test-1 ")},default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"correct-handover",Action(d,"PRICE-CORRECTION",[unit]) with {Handover=Handover("CORRECTION-1",original.Id,true) with {SellingPrice=33.90m}},default);
        var correction=d.Reconciliation.Single(h=>h.Kind=="Correction");
        d=await s.ActionAsync(AdminAccountId,d.Id,"reverse-handover",Action(d,"ENTRY-WAS-WRONG",[unit]) with {Handover=Handover("REVERSAL-1",correction.Id)},default);
        Assert.Equal(0,d.ExternalHandovers);Assert.Equal(3,d.Reconciliation.Count);
        Assert.Equal(34.90m,(await db.ConsignmentHandoverRecords.SingleAsync(h=>h.Id==original.Id)).SellingPrice);
        var csv=System.Text.Encoding.UTF8.GetString(await Documents(db).ReconciliationCsvAsync(AdminAccountId,Now.AddDays(-1),Now.AddDays(1),default));
        Assert.Contains("Merchant",csv);Assert.Contains("Event UTC",csv);Assert.Contains("Actor admin ID",csv);Assert.Contains("Unverified external report",csv);Assert.Contains("CORRECTION-1",csv);
        Assert.Empty(db.MerchantPayments);Assert.Empty(db.MerchantInvoices);Assert.Empty(db.MerchantReceipts);Assert.Empty(db.SalesCommissions);Assert.Empty(db.TagOrders);
    }
    [Fact]
    public async Task P02AndP03AgreementChangesCannotSilentlyStrandOpenCustody()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        var revision=await s.SaveAgreementAsync(AdminAccountId,null,Terms() with {SupersedesAgreementId=a.Id},null,default);
        await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(OwnerAccountId,revision.Id,"approve",new(revision.ConcurrencyToken,"SIGNED-REVISION"),default));
        await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(OwnerAccountId,a.Id,"close",new(a.ConcurrencyToken,"closure"),default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);
        await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(OwnerAccountId,a.Id,"close",new(a.ConcurrencyToken,"closure"),default));
        Assert.Equal("Dispatched",d.Status);
    }
    [Fact]
    public async Task P07RefreshWithDifferentKeyFindsTheSameActiveReservationAndBranchIsValidated()
    {
        await using var scope=await Database(8);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        Assert.Equal(d.Id,(await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4,"REFRESHED-KEY"),default)).Id);Assert.Single(db.ConsignmentDispatches);
        await Assert.ThrowsAsync<ApiException>(()=>s.ReserveAsync(AdminAccountId,Reserve(a.Id,4,"OTHER") with {MerchantBranchId=Guid.NewGuid()},default));
        await Assert.ThrowsAsync<ApiException>(()=>s.ReserveAsync(AdminAccountId,Reserve(a.Id,4,"OTHER") with {Destination="An unrelated address"},default));
    }
    [Fact]
    public async Task P10RealFailedInspectionCanBeWrittenOffWithoutReleasingOrResellingStock()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);
        var uid=d.Units[0].Id;d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"PHYSICALLY-RETURNED",[uid]),default);
        var tag=await db.ConsignmentUnits.Where(u=>u.Id==uid).Select(u=>u.SmartTag).SingleAsync();await InspectReturn(db,tag,pass:false);
        var fail=await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"release",Action(d,"too-early",[uid]),default));Assert.DoesNotContain(tag.TagCode,fail.Message);
        d=await s.ActionAsync(AdminAccountId,d.Id,"write-off",Action(d,"FAILED-RETURN-SCRAP-EVIDENCE",[uid]),default);
        Assert.Equal("WrittenOff",d.Units.Single(u=>u.Id==uid).Status);Assert.Equal(0,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
        Assert.Equal(SmartTagStatus.Disabled,(await db.SmartTags.SingleAsync(t=>t.Id==tag.Id)).Status);
    }
    [Fact]
    public async Task IssuedPdfIsUnavailableBeforeDispatchThenByteIdenticalAfterReceiptAndReturn()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        await Assert.ThrowsAsync<ApiException>(()=>Documents(db).PdfAsync(AdminAccountId,d.Id,default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);var original=(await Documents(db).PdfAsync(AdminAccountId,d.Id,default)).Content;
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d) with {Receipt=Receipt(d)},default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"RETURN-EVIDENCE",[d.Units[0].Id]),default);
        Assert.Equal(original,(await Documents(db).PdfAsync(AdminAccountId,d.Id,default)).Content);
        var text=MerchantDocumentServiceTests.ExtractText(original);Assert.Contains("Dispatched",text);Assert.DoesNotContain("does not require a signature",text);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task P13DestructiveRollbackIsBlockedForHistoricalAndActiveCustody(bool active)
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server rollback test must not skip.");
        await using var scope=await RelationalDatabase.CreateAsync(createSchema:false);await using var db=scope.NewContext();await db.Database.MigrateAsync();
        await SeedAsync(db,qrStock:0,nfcStock:active?1:0);
        var agreement=new ConsignmentAgreement {MerchantId=MerchantId,Reference="ROLLBACK-HISTORY",UpdatedByAdminUserId=AdminRecordId};
        db.ConsignmentAgreements.Add(agreement);await db.SaveChangesAsync();
        if(active)
        {
            var tag=await db.SmartTags.SingleAsync();tag.FulfilmentStatus=TagFulfilmentStatus.SentToReseller;
            var dispatch=new ConsignmentDispatch {AgreementId=agreement.Id,AgreementVersionSnapshot=1,CommissionPercentageSnapshot=35,DispatchNumber="ROLLBACK-ACTIVE",IdempotencyKey="ROLLBACK-KEY",RequestFingerprint="ROLLBACK-FINGERPRINT",UpdatedByAdminUserId=AdminRecordId,Status=ConsignmentDispatchStatus.Dispatched};
            dispatch.Units.Add(new ConsignmentUnit {SmartTagId=tag.Id,ProductVariantId=NfcVariantId,TagCodeSnapshot=tag.TagCode,Status=ConsignmentUnitStatus.Dispatched});
            db.ConsignmentDispatches.Add(dispatch);await db.SaveChangesAsync();
        }
        var error=await Assert.ThrowsAnyAsync<Exception>(()=>db.GetService<IMigrator>().MigrateAsync("20261015032111_AddMerchantMainLogo"));
        Assert.Contains("rollback",error.ToString(),StringComparison.OrdinalIgnoreCase);Assert.Single(await db.ConsignmentAgreements.ToListAsync());
        Assert.Contains("Consignment",string.Join(',',await db.Database.GetAppliedMigrationsAsync()));
        Assert.Equal(active?1:0,await db.ConsignmentUnits.CountAsync());
    }
}
