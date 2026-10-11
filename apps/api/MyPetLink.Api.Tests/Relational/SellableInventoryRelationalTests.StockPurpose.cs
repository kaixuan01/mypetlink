using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Stock purpose on SQL Server: a unit may be sold only when it is commercial
/// stock (Sale) AND passed physical QA. Testing samples and unclassified stock
/// are never counted, reserved, assigned, allocated or sent onward, whatever
/// their QA result, while units already in someone's hands keep working.
/// </summary>
public sealed partial class SellableInventoryRelationalTests
{
    // Orderable: Sale, received, enrolled and not failed (Pending or Passed).
    // Fulfillable (assignment, merchant allocation, shipping): Sale and Passed.
    [RelationalTheory]
    [InlineData(SmartTagStockPurpose.Sale, null, true, false, false)]
    [InlineData(SmartTagStockPurpose.Sale, PhysicalQaStatus.Pending, true, true, false)]
    [InlineData(SmartTagStockPurpose.Sale, PhysicalQaStatus.Passed, true, true, true)]
    [InlineData(SmartTagStockPurpose.Sale, PhysicalQaStatus.Failed, true, false, false)]
    [InlineData(SmartTagStockPurpose.Sale, PhysicalQaStatus.NeedsReview, true, false, false)]
    [InlineData(SmartTagStockPurpose.Sale, PhysicalQaStatus.Pending, false, false, false)]
    [InlineData(SmartTagStockPurpose.Sale, PhysicalQaStatus.Passed, false, false, true)]
    [InlineData(SmartTagStockPurpose.Test, PhysicalQaStatus.Passed, true, false, false)]
    [InlineData(SmartTagStockPurpose.Test, PhysicalQaStatus.Pending, true, false, false)]
    [InlineData(SmartTagStockPurpose.Test, null, true, false, false)]
    [InlineData(SmartTagStockPurpose.Unclassified, PhysicalQaStatus.Passed, true, false, false)]
    [InlineData(SmartTagStockPurpose.Unclassified, PhysicalQaStatus.Pending, true, false, false)]
    [InlineData(SmartTagStockPurpose.Unclassified, null, true, false, false)]
    public async Task PurposeReceiptAndPhysicalQaDecideWhatIsOrderableAndWhatIsFulfillable(
        SmartTagStockPurpose purpose, PhysicalQaStatus? qa, bool received, bool orderable, bool fulfillable)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, tagId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "PURP");
            tagId = AddShelfTag(seed, variantId, "MPL-PURP-0001", qa, purpose: purpose, received: received);
            await seed.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
        {
            Assert.Equal(orderable ? 1 : 0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
            Assert.Equal(orderable, await InStockAsync(db, variantId));
            Assert.Equal(fulfillable ? 1 : 0, await db.SmartTags.Where(MerchantInventoryEligibility.For(db, variantId)).CountAsync());
            var tag = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == tagId);
            var commitment = Record.Exception(() => SellableInventoryRules.RequireSellableForNewCommitment([tag]));
            if (fulfillable) Assert.Null(commitment);
            else Assert.IsType<ApiException>(commitment);
        }

        await using (var db = scope.NewContext())
        {
            var checkout = await Record.ExceptionAsync(() => Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "purpose")));
            if (orderable) Assert.Null(checkout);
            else Assert.Equal("out_of_stock", Assert.IsType<ApiException>(checkout).Code);
        }
    }

    [RelationalFact]
    public async Task TestingAndUnclassifiedStockIsNeverReservedAssignedOrSentOnward()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, sampleId, unclassifiedId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "SMPL");
            // Both passed inspection; neither is commercial stock.
            sampleId = AddShelfTag(seed, variantId, "MPL-SMPL-0001", PhysicalQaStatus.Passed,
                fulfilment: TagFulfilmentStatus.Printed, purpose: SmartTagStockPurpose.Test);
            unclassifiedId = AddShelfTag(seed, variantId, "MPL-SMPL-0002", PhysicalQaStatus.Passed,
                fulfilment: TagFulfilmentStatus.Printed, purpose: SmartTagStockPurpose.Unclassified);
            await seed.SaveChangesAsync();
            var order = AddOrder(seed, variantId, "ORD-SMPL", OrderStatus.PaymentConfirmed, quantity: 1);
            order.PaymentStatus = PaymentStatus.Confirmed;
            await seed.SaveChangesAsync();
            orderId = order.Id;
        }

        await using (var db = scope.NewContext())
        {
            Assert.Equal(0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
            Assert.Equal("out_of_stock", (await Assert.ThrowsAsync<ApiException>(() =>
                Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "sample")))).Code);
        }

        await using (var db = scope.NewContext())
        {
            var sample = await Assert.ThrowsAsync<ApiException>(() => Admin(db).AssignInventoryTagAsync(AdminId, orderId, sampleId));
            Assert.Equal("stock_not_for_sale", sample.Code);
            Assert.Contains("testing sample", sample.Message);
        }

        await using (var db = scope.NewContext())
        {
            var unclassified = await Assert.ThrowsAsync<ApiException>(() => Admin(db).AssignInventoryTagAsync(AdminId, orderId, unclassifiedId));
            Assert.Equal("stock_not_for_sale", unclassified.Code);
            Assert.Contains("not been classified as commercial stock", unclassified.Message);
        }

        await using (var db = scope.NewContext())
        {
            foreach (var action in new[] { "send-to-reseller", "send-to-owner" })
            {
                var bulk = await Inventory(db).BulkUpdateFulfilmentAsync(AdminId, new AdminTagInventoryBulkActionRequest(action, [sampleId, unclassifiedId]));
                Assert.Equal(0, bulk.UpdatedCount);
                Assert.Equal(2, bulk.Failures.Count);
            }
        }

        // Nothing was written: both units and the order are exactly as they were.
        await using var check = scope.NewContext();
        foreach (var id in new[] { sampleId, unclassifiedId })
        {
            var tag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == id);
            Assert.Equal((SmartTagStatus.Unclaimed, TagFulfilmentStatus.Printed, PhysicalQaStatus.Passed, (Guid?)null),
                (tag.Status, tag.FulfilmentStatus, tag.QaStatus!.Value, tag.OrderId));
        }
        Assert.Null((await check.TagOrders.AsNoTracking().SingleAsync(o => o.Id == orderId)).SmartTagId);
    }

    [RelationalFact]
    public async Task TestingSamplesAreNeverAllocatedToAMerchant()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid sampleId;
        await using (var db = scope.NewContext())
        {
            await SeedAsync(db);
            await IssueInvoiceAsync(db);
            // Every QR unit on the shelf is a testing sample.
            var stock = await db.SmartTags.Where(t => t.ProductVariantId == QrVariantId).ToListAsync();
            stock.ForEach(t => t.StockPurpose = SmartTagStockPurpose.Test);
            await db.SaveChangesAsync();
            sampleId = stock[0].Id;
        }

        await using (var db = scope.NewContext())
        {
            Assert.Empty(await db.SmartTags.Where(MerchantInventoryEligibility.For(db, QrVariantId)).ToListAsync());
            var manual = await Assert.ThrowsAsync<ApiException>(() =>
                Service(db).AllocateAsync(AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, [sampleId])));
            Assert.Equal("stock_not_for_sale", manual.Code);
        }

        await using (var db = scope.NewContext())
            Assert.Equal("insufficient_inventory", (await Assert.ThrowsAsync<ApiException>(() =>
                Service(db).AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1)))).Code);

        await using var check = scope.NewContext();
        Assert.False(await check.MerchantOrderAllocatedTags.AnyAsync(a => a.MerchantOrderItemId == QrItemId));
    }

    [RelationalFact]
    public async Task TestingSamplesInInternalHandsKeepActivationScanningAndTransfer()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, ownedSampleId, shelfSampleId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "TSTO");
            // A manufacturer sample already issued to an internal tester (QA NULL).
            ownedSampleId = AddShelfTag(seed, variantId, "MPL-TSTO-0001", null, purpose: SmartTagStockPurpose.Test, configure: t =>
            {
                t.Status = SmartTagStatus.Preparing; t.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
                t.OwnerUserId = OwnerId; t.PetId = PetId;
            });
            // A sample that passed inspection, still on our shelf.
            shelfSampleId = AddShelfTag(seed, variantId, "MPL-TSTO-0002", PhysicalQaStatus.Passed, purpose: SmartTagStockPurpose.Test);
            // A commercial tag in the same owned, active state, to compare scanning with.
            AddShelfTag(seed, variantId, "MPL-TSTO-0003", PhysicalQaStatus.Passed, configure: t =>
            {
                t.Status = SmartTagStatus.Active; t.OwnerUserId = OwnerId; t.PetId = PetId;
                t.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
            });
            await seed.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
            Assert.Equal(SmartTagStatus.Active, (await Activation(db).ActivateAsync(OwnerId, "MPL-TSTO-0001", new ActivateTagRequest(null))).Status);

        await using (var db = scope.NewContext())
        {
            var scans = new TagScanService(db, Options.Create(new CloudflareR2Options()));
            // Scanning does not look at stock purpose: the sample resolves like commercial stock.
            var sampleScan = await scans.ResolveAsync("MPL-TSTO-0001", TagScanSource.Qr, new TagScanContext("127.0.0.1", "test-agent", null));
            var commercialScan = await scans.ResolveAsync("MPL-TSTO-0003", TagScanSource.Qr, new TagScanContext("127.0.0.1", "test-agent", null));
            Assert.Equal(commercialScan.State, sampleScan.State);
        }

        await using (var db = scope.NewContext())
        {
            var tag = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == ownedSampleId);
            await SmartTags(db).TransferOwnershipAsync(AdminId, ownedSampleId, new AdminSmartTagTransferRequest
            {
                NewOwnerUserId = OtherOwnerId, NewPetId = OtherPetId,
                ExpectedAssignmentVersion = tag.AssignmentVersion, Reason = "Handed to another tester",
            });
        }

        // A tester can still take a passed sample off the shelf and activate it:
        // a first hand-over is not a sale.
        await using (var db = scope.NewContext())
            Assert.Equal(SmartTagStatus.Active, (await Activation(db).ActivateAsync(OwnerId, "MPL-TSTO-0002", new ActivateTagRequest(PetId))).Status);

        await using var check = scope.NewContext();
        var owned = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == ownedSampleId);
        Assert.Equal((OtherOwnerId, SmartTagStockPurpose.Test), (owned.OwnerUserId!.Value, owned.StockPurpose));
        var shelf = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == shelfSampleId);
        Assert.Equal((SmartTagStatus.Active, SmartTagStockPurpose.Test), (shelf.Status, shelf.StockPurpose));
        Assert.Equal(0, await check.TagOrders.CountAsync());
    }

    [RelationalFact]
    public async Task TheLastCommercialUnitSellsExactlyOnceWithPassedSamplesBesideIt()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "LSTS");
            AddShelfTag(seed, variantId, "MPL-LSTS-0001", PhysicalQaStatus.Pending);
            AddShelfTag(seed, variantId, "MPL-LSTS-0002", PhysicalQaStatus.Passed, purpose: SmartTagStockPurpose.Test);
            AddShelfTag(seed, variantId, "MPL-LSTS-0003", PhysicalQaStatus.Passed, purpose: SmartTagStockPurpose.Test);
            AddShelfTag(seed, variantId, "MPL-LSTS-0004", PhysicalQaStatus.Passed, purpose: SmartTagStockPurpose.Unclassified);
            await seed.SaveChangesAsync();
        }

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 6).Select(async attempt =>
        {
            await using var db = scope.NewContext();
            try
            {
                await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"last-sample-{attempt}"));
                return "ok";
            }
            catch (ApiException error)
            {
                return error.Code;
            }
        }));

        Assert.Equal(1, outcomes.Count(outcome => outcome == "ok"));
        Assert.All(outcomes.Where(outcome => outcome != "ok"), code => Assert.Equal("out_of_stock", code));
        await using var check = scope.NewContext();
        Assert.Equal(1, await check.TagOrders.CountAsync());
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        Assert.False(await InStockAsync(check, variantId));
    }
}
