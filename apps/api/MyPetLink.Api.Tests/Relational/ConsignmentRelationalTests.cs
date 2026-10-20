using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Deliberately ordinary Facts: missing SQL Server FAILS this release gate.
[Collection("PDF document rendering")]
public sealed partial class ConsignmentRelationalTests
{
    // Set by a migrated-schema test to run the same scenarios on a database built by the real
    // migration chain (with its SQL triggers) instead of EnsureCreated.
    private static readonly AsyncLocal<bool> MigratedSchema=new();
    private static async Task<RelationalScope> Database(int stock=100)
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server must run for the consignment release gate; skipping is not acceptable.");
        var scope=await RelationalDatabase.CreateAsync(enableRetryOnFailure:true,createSchema:!MigratedSchema.Value);
        await using var db=scope.NewContext();
        if(MigratedSchema.Value) await db.Database.MigrateAsync();
        await SeedConsignment(db,stock);
        return scope;
    }
    /// <summary>The consignment fixture's data, for a schema created any way (EnsureCreated or a migration target).</summary>
    private static async Task SeedConsignment(MyPetLinkDbContext db,int stock)
    {
        await SeedAsync(db,qrStock:0,nfcStock:stock);
        await ReceivedStockFixture.ReceiveAllAsync(db,NfcVariantId);
        db.AdminUsers.Add(new AdminUser { Id=CheckerAdminId,UserId=OwnerAccountId,IsActive=true });
        db.MerchantBranches.Add(TestBranch());
        var tags=await db.SmartTags.OrderBy(t=>t.Id).ToListAsync();
        const string alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for(var i=0;i<tags.Count;i++) tags[i].TagCode="MPL-TEST-"+new string(new[]{alphabet[(i/32768)%32],alphabet[(i/1024)%32],alphabet[(i/32)%32],alphabet[i%32]});
        var identity=await db.BusinessIdentitySettings.SingleAsync();
        identity.LegalBusinessName="Test Seller"; identity.BrandName="MyPetLink";identity.BusinessRegistrationNumber="TEST-REG";
        identity.RegisteredAddressLine1="Test address";identity.RegisteredPostcode="50000";identity.RegisteredCity="Kuala Lumpur";
        identity.RegisteredState="Kuala Lumpur";identity.RegisteredCountry="Malaysia";identity.SupportEmail="test@example.com";
        await db.SaveChangesAsync();
    }
    private static ConsignmentService Custody(MyPetLinkDbContext db) {
        var audit=new AuditLogService(db,new HttpContextAccessor());
        return new(db,audit,new BusinessIdentityService(db,audit,new FixedClock(Now)),new DocumentNumberService(db),new FixedClock(Now));
    }
    private static SaveConsignmentAgreementRequest Terms(string? reference=null) => new(MerchantId,reference,35m,Now.AddDays(-1),null,
        "Test-only duration subject to signed schedule","Test-only settlement schedule",14,"Test-only discounts","Test-only returns",
        "Test-only loss allocation","TEST-SIGNED","TEST-TRACKER");
    private static async Task<ConsignmentAgreementResponse> Agreement(MyPetLinkDbContext db) {
        var s=Custody(db);var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        return await s.AgreementActionAsync(OwnerAccountId,a.Id,"approve",new(a.ConcurrencyToken,"Test approval"),default);
    }
    private static ReserveConsignmentRequest Reserve(Guid agreement,int quantity=100,string key="first-100") =>
        new(agreement,ConsignmentService.BranchDestination(TestBranch()),"TEST-TRACKER",key,[new(NfcVariantId,quantity)],BranchId);
    private static ConsignmentActionRequest Action(ConsignmentDispatchResponse d,string reference="Test evidence",IReadOnlyList<Guid>? units=null) => new(d.ConcurrencyToken,reference,units);

    [Fact]
    public async Task PendingTermsPreventApprovalAndNeverInventBindingDefaults()
    {
        await using var scope=await Database();await using var db=scope.NewContext();var s=Custody(db);
        await Assert.ThrowsAsync<ApiException>(()=>s.SaveAgreementAsync(AdminAccountId,null,Terms() with { PartnerCommissionPercentage=null },null,default));
        var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms() with { DurationTerms=null,PaymentDeadlineDays=null },null,default);
        Assert.Contains("Duration",a.PendingTerms);Assert.Contains("Payment deadline",a.PendingTerms);
        await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(OwnerAccountId,a.Id,"approve",new(a.ConcurrencyToken,"approval"),default));
        Assert.Empty(db.ConsignmentDispatches);
    }
    [Fact]
    public async Task Exactly100TagsRemainExclusiveWithoutAnyFinancialRecordsAndManifestIsControlled()
    {
        await using var scope=await Database();await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id),default);
        Assert.Equal(100,d.Reserved);Assert.Equal(100,d.Units.Select(u=>u.Id).Distinct().Count());Assert.All(d.Units,u=>Assert.Null(u.TagCode));
        Assert.Equal(0,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
        var retry=await s.ReserveAsync(AdminAccountId,Reserve(a.Id),default);Assert.Equal(d.Id,retry.Id);
        await Assert.ThrowsAsync<ApiException>(()=>s.ReserveAsync(AdminAccountId,Reserve(a.Id,99),default));
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d,"TRACK-100"),default);
        Assert.Equal(100,d.PartnerHeld);Assert.Equal("Dispatched",d.Status);
        d=await s.ActionAsync(OwnerAccountId,d.Id,"receive",Action(d,"Signed delivery acknowledgment") with { Receipt=Receipt(d) },default);
        Assert.Equal("Received",d.Status);
        Assert.Empty(db.MerchantPayments);Assert.Empty(db.MerchantInvoices);Assert.Empty(db.MerchantReceipts);
        Assert.Empty(db.SalesCommissions);Assert.Empty(db.TagOrders);
        Assert.All(await db.SmartTags.ToListAsync(),t=> { Assert.Null(t.OwnerUserId);Assert.Null(t.PetId); });
        var docs=new ConsignmentDocumentService(db,s,new AuditLogService(db,new HttpContextAccessor()));
        var manifest=await docs.ManifestAsync(AdminAccountId,d.Id,default);Assert.All(manifest.Units,u=>Assert.NotNull(u.TagCode));
        var pdf=await docs.PdfAsync(AdminAccountId,d.Id,default);
        if (Environment.GetEnvironmentVariable("MYPETLINK_CONSIGNMENT_PDF_QA") is { Length: > 0 } samplePath)
            await File.WriteAllBytesAsync(samplePath,pdf.Content);
        var text=MerchantDocumentServiceTests.Squash(MerchantDocumentServiceTests.ExtractText(pdf.Content));
        Assert.Contains("ConsignmentDispatchNote",text);Assert.Contains("Noupfrontstockpayment",text);
        Assert.DoesNotContain("Amountdue",text);Assert.DoesNotContain("35%",text);
        Assert.True(await db.AuditLogs.AnyAsync(x=>x.Action=="consignment.document-downloaded"));
        await Assert.ThrowsAsync<ApiException>(()=>Service(db).AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,1)));
        var petId=Guid.NewGuid();
        db.Pets.Add(new Pet { Id=petId,OwnerUserId=OwnerAccountId,Slug="consignment-activation",Name="Buddy",Species="Dog",LifecycleStatus=PetLifecycleStatus.Active });
        await db.SaveChangesAsync();
        var activation=new SmartTagService(db,new AuditLogService(db,new HttpContextAccessor()));
        await activation.ActivateAsync(OwnerAccountId,manifest.Units[0].TagCode!,new(petId));
        var afterActivation=await s.GetAsync(d.Id,false,default);
        Assert.Equal(1,afterActivation.ActivatedWithoutExternalReference);Assert.Equal(0,afterActivation.ExternalHandovers);
        Assert.Empty(db.SalesCommissions);Assert.Empty(db.MerchantPayments);Assert.Empty(db.TagOrders);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"return",Action(afterActivation,"Invalid owner return",[manifest.Units[0].Id]),default));
    }
    [Fact]
    public async Task ExistingRetailReservationCannotBeConsumedByWholesaleOrConsignment()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);
        var retail=await SeedRetailOrderAsync(db);
        var item=await db.TagOrderItems.SingleAsync(x=>x.Id==retail.OrderItemId);
        item.ProductVariantId=NfcVariantId;item.Quantity=4;await db.SaveChangesAsync();
        var error=await Assert.ThrowsAsync<ApiException>(()=>Service(db).AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,4)));
        Assert.Equal("inventory_reserved",error.Code);
        await Assert.ThrowsAsync<ApiException>(()=>Custody(db).ReserveAsync(AdminAccountId,Reserve(a.Id,4),default));
        Assert.Empty(db.MerchantOrderAllocatedTags);Assert.Empty(db.ConsignmentUnits);
    }
    [Fact]
    public async Task ReturnsStayQuarantinedUntilFreshInspectionThenReleaseRestoresAvailability()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"RETURN-1",[d.Units[0].Id]),default);
        Assert.Equal(1,d.ReturnedQuarantine);Assert.Equal("Pending",d.Units[0].QaStatus);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"release",Action(d,"release",[d.Units[0].Id]),default));
        Assert.Equal(0,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
        var unit=await db.ConsignmentUnits.Include(x=>x.SmartTag).SingleAsync(x=>x.Id==d.Units[0].Id);
        await InspectReturn(db,unit.SmartTag);
        db.ChangeTracker.Clear();
        d=await s.GetAsync(d.Id,false,default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"release",Action(d,"Reinspection passed",[unit.Id]),default);
        Assert.Equal(1,d.Released);Assert.Equal(1,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
    }
    [Fact]
    public async Task FailedQaStaleTokensAndOwnerAssignmentCannotBypassCustody()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        var unit=await db.ConsignmentUnits.Include(u=>u.SmartTag).FirstAsync();unit.SmartTag.QaStatus=PhysicalQaStatus.Failed;await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default));
        db.ChangeTracker.Clear();unit=await db.ConsignmentUnits.Include(u=>u.SmartTag).FirstAsync();unit.SmartTag.QaStatus=PhysicalQaStatus.Passed;await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(()=>InventoryCustodyRules.RequireNoCustodyMutationAsync(db,unit.SmartTagId,default));
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"dispatch",new(Convert.ToBase64String([1,2,3]),"bad token"),default));
        Assert.All(await db.ConsignmentUnits.ToListAsync(),u=>Assert.Equal(ConsignmentUnitStatus.Reserved,u.Status));
    }
    [Fact]
    public async Task ConcurrentWholesaleAndConsignmentClaimsNeverOverlap()
    {
        await using var scope=await Database(4);Guid a;
        await using(var db=scope.NewContext()) a=(await Agreement(db)).Id;
        var start=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<string> Claim(bool consignment) { await start.Task;await using var db=scope.NewContext();try {
            if(consignment) await Custody(db).ReserveAsync(AdminAccountId,Reserve(a,4),default);
            else await Service(db).AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,4));
            return "won";
        }catch(ApiException){return "conflict";} }
        var left=Claim(true);var right=Claim(false);start.SetResult();var results=await Task.WhenAll(left,right);
        Assert.Single(results.Where(x=>x=="won"));
        await using var check=scope.NewContext();
        Assert.Equal(4,await check.ConsignmentUnits.CountAsync()+await check.MerchantOrderAllocatedTags.CountAsync());
    }
    [Fact]
    public async Task CancelAndAgreementRevisionPreserveHistoryAndCloseOldVersion()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();var a=await Agreement(db);var s=Custody(db);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"cancel",Action(d,"Cancelled before dispatch"),default);
        Assert.Equal(4,d.Released);Assert.Equal(4,await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(NfcVariantId));
        var revision=await s.SaveAgreementAsync(AdminAccountId,null,Terms() with { SupersedesAgreementId=a.Id,PartnerCommissionPercentage=30 },null,default);
        Assert.Equal(2,revision.Version);
        await s.AgreementActionAsync(OwnerAccountId,revision.Id,"approve",new(revision.ConcurrencyToken,"new signed terms"),default);
        Assert.Equal(ConsignmentAgreementStatus.Closed,(await db.ConsignmentAgreements.SingleAsync(x=>x.Id==a.Id)).Status);
        Assert.Equal(35,(await db.ConsignmentDispatches.SingleAsync()).CommissionPercentageSnapshot);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ConcurrentRetailWholesaleAndConsignmentClaimsProtectCommittedInspectedStock(bool mixedQa)
    {
        await using var scope=await Database(mixedQa?6:4);Guid agreementId;var petId=Guid.NewGuid();
        await using(var setup=scope.NewContext())
        {
            agreementId=(await Agreement(setup)).Id;
            if(mixedQa) {
                foreach(var t in await setup.SmartTags.OrderBy(t=>t.Id).Take(2).ToListAsync())t.QaStatus=PhysicalQaStatus.Pending;
                await setup.SaveChangesAsync();await RetailReservation(setup,2);
            }
            setup.Pets.Add(new Pet { Id=petId,OwnerUserId=OwnerAccountId,Slug="checkout-race",Name="Buddy",Species="Dog",LifecycleStatus=PetLifecycleStatus.Active });
            setup.DeliveryRates.Add(new DeliveryRate { Name="Test delivery",ZoneCode="PEN",ApplicableStateCodesJson="[\"KUL\"]",Fee=0,Currency="MYR",IsActive=true });
            (await setup.TagProductVariants.SingleAsync(x=>x.Id==NfcVariantId)).WeightGrams=12;
            await setup.SaveChangesAsync();
        }
        var start=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<string> Claim(int channel) {
            await start.Task;await using var db=scope.NewContext();
            try {
                if(channel==0) {
                    var audit=new AuditLogService(db,new HttpContextAccessor());var pricing=new TagPricingService(db);
                    var checkout=new OrderService(db,Microsoft.Extensions.Options.Options.Create(new FeatureOptions { SmartTagOrderingEnabled=true }),
                        pricing,new DeliveryService(db,pricing,audit),new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),TimeProvider.System,
                        inventoryAvailability:new TagOrderInventoryAvailabilityService(db));
                    await checkout.CreateAsync(OwnerAccountId,new(petId,"ws-nfc-0001",mixedQa?2:4,new("Owner","+60123456789","1 Test Street",null,"50000","Kuala Lumpur","KUL",null),null,"triple-race"));
                }
                else if(channel==1) await Service(db).AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,mixedQa?2:4));
                else await Custody(db).ReserveAsync(AdminAccountId,Reserve(agreementId,mixedQa?2:4),default);
                return "won";
            }catch(ApiException e){Assert.Contains(e.Code,new[]{"out_of_stock","inventory_reserved","inspected_inventory_reserved","insufficient_inventory","consignment_conflict","inventory_busy"});return e.Code;}
        }
        var workers=Enumerable.Range(0,3).Select(Claim).ToArray();start.SetResult();
        var outcomes=await Task.WhenAll(workers);
        await using var check=scope.NewContext();
        var committed=(await check.TagOrderItems.SumAsync(x=>(int?)x.Quantity)??0)+await check.MerchantOrderAllocatedTags.CountAsync()+await check.ConsignmentUnits.CountAsync();
        if(mixedQa) {
            Assert.InRange(outcomes.Count(x=>x=="won"),1,2);Assert.InRange(committed,2,6);
            Assert.True(await check.SmartTags.Where(SellableInventoryRules.OrderableUnitOf(check,NfcVariantId)).CountAsync(t=>t.QaStatus==PhysicalQaStatus.Passed)>=2);
        }else {
            Assert.Single(outcomes.Where(x=>x=="won"));Assert.Equal(4,committed);
            Assert.Equal(0,await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(NfcVariantId));
        }
    }

    [Fact]
    public async Task DeliveryOrderChangesAreVoidedAndFinalShipmentFreezesActualBatchesAndTracking()
    {
        await using var scope=await Database(8);await using var db=scope.NewContext();
        db.MerchantOrderItems.Remove(await db.MerchantOrderItems.SingleAsync(x=>x.Id==QrItemId));await db.SaveChangesAsync();
        var order=await db.MerchantOrders.SingleAsync(x=>x.Id==OrderId);
        order.MerchandiseSubtotal=(await db.MerchantOrderItems.SingleAsync(x=>x.Id==NfcItemId)).LineSubtotal;
        order.DiscountTotal=0;order.DeliveryFee=0;order.GrandTotal=order.MerchandiseSubtotal;
        await db.SaveChangesAsync();await IssueInvoiceAsync(db);
        var s=Service(db);await s.AutoAllocateAsync(AdminAccountId,OrderId,new(NfcItemId,4));
        await s.MarkReadyToShipAsync(AdminAccountId,OrderId,new());var old=await s.IssueDeliveryOrderAsync(AdminAccountId,OrderId);
        var allocation=await db.MerchantOrderAllocatedTags.FirstAsync();
        await s.ReleaseAsync(AdminAccountId,OrderId,new([allocation.Id],"Change production batch"));
        Assert.NotNull((await db.MerchantDeliveryOrders.SingleAsync(x=>x.Id==old.Id)).CancelledAt);
        var replacement=await db.SmartTags.Where(t=>t.ProductVariantId==NfcVariantId&&t.BatchId==BatchTwoId).Select(t=>t.Id).FirstAsync();
        await s.AllocateAsync(AdminAccountId,OrderId,new(NfcItemId,[replacement]));
        await s.MarkReadyToShipAsync(AdminAccountId,OrderId,new());
        var issued=await s.IssueDeliveryOrderAsync(AdminAccountId,OrderId);
        await s.MarkShippedAsync(AdminAccountId,OrderId,new(null,"Test Courier",null,"TRACK-FINAL",0,null));
        var final=await db.MerchantDeliveryOrders.Include(x=>x.Items).SingleAsync(x=>x.MerchantOrderId==OrderId&&x.CancelledAt==null);
        Assert.NotEqual(old.Id,final.Id);Assert.Equal(issued.Id,final.Id);Assert.Equal("TRACK-FINAL",(await db.MerchantOrders.SingleAsync(x=>x.Id==OrderId)).TrackingNumber);
        Assert.Contains("B-2602",final.Items.Single().BatchSummarySnapshot);
        var oldPdf=await new MerchantDocumentService(db).GetDeliveryOrderAsync(old.Id);
        Assert.Contains("VOID",MerchantDocumentServiceTests.ExtractText(oldPdf.Content));
    }

    [Fact]
    public async Task FreshMigrationAndIdempotentDeploymentScriptCanReplayWithoutBusinessChanges()
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server is mandatory for migration verification.");
        await using var scope=await RelationalDatabase.CreateAsync(createSchema:false);await using var db=scope.NewContext();
        await db.Database.MigrateAsync();
        var root=System.IO.Path.GetFullPath(System.IO.Path.Combine(AppContext.BaseDirectory,"../../../../../.."));
        var script=await System.IO.File.ReadAllTextAsync(System.IO.Path.Combine(root,"migration.sql"));
        Assert.Contains("AddConsignmentAgreementAndCustody",script);
        await db.Database.OpenConnectionAsync();
        try {
            foreach(var batch in System.Text.RegularExpressions.Regex.Split(script,@"^GO\s*$",System.Text.RegularExpressions.RegexOptions.Multiline|System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                if(!string.IsNullOrWhiteSpace(batch)) await db.Database.ExecuteSqlRawAsync(batch);
        }
        finally { await db.Database.CloseConnectionAsync(); }
        Assert.Empty(db.ConsignmentAgreements);Assert.Empty(db.ConsignmentDispatches);Assert.Empty(db.ConsignmentUnits);
    }

}
