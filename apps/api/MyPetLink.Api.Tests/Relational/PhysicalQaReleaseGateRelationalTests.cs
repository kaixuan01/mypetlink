using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Physical QA release gates exercised through the real services on SQL
/// Server: stock counts, checkout, assignment, shipping, claim, transfer,
/// bulk outbound actions, public activation, merchant allocation and
/// fulfilment, quotations, generation, and manifest enrollment.
/// </summary>
public sealed partial class PhysicalQaReleaseGateRelationalTests
{
    private static readonly Guid AdminId = Guid.Parse("c7111111-1111-4111-8111-111111111111");
    private static readonly Guid OwnerId = Guid.Parse("c7222222-2222-4222-8222-222222222222");
    private static readonly Guid PetId = Guid.Parse("c7333333-3333-4333-8333-333333333333");
    private static readonly Guid OtherOwnerId = Guid.Parse("c7444444-4444-4444-8444-444444444444");
    private static readonly Guid OtherPetId = Guid.Parse("c7555555-5555-4555-8555-555555555555");
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const string Site = "https://mypetlink.example";

    private static string Code(int index) =>
        $"MPL-QAGT-{Alphabet[index / 32768 % 32]}{Alphabet[index / 1024 % 32]}{Alphabet[index / 32 % 32]}{Alphabet[index % 32]}";

    // --- Checkout -------------------------------------------------------------

    [RelationalFact]
    public async Task CheckoutRefusesHeldStockAndSellsItOncePassed()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 1);
            seed.DeliveryRates.Add(new DeliveryRate
            {
                Name = "Peninsular Standard Delivery", ZoneCode = "PEN", ApplicableStateCodesJson = "[\"KUL\"]",
                Fee = 0m, Currency = "MYR", IsActive = true,
            });
            await seed.SaveChangesAsync();
        }
        await EnrollAsync(scope, [Code(0)]);

        await using (var db = scope.NewContext())
        {
            Assert.Equal(0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
            var refused = await Assert.ThrowsAsync<ApiException>(() => Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "held")));
            Assert.Equal("out_of_stock", refused.Code);
            Assert.Equal(0, await db.TagOrders.CountAsync());
        }

        await PassAsync(scope, Code(0));
        await using (var db = scope.NewContext())
        {
            Assert.Equal(1, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
            Assert.Equal(1, (await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync([variantId]))[variantId]);
            await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "passed"));
            Assert.Equal(1, await db.TagOrders.CountAsync());
        }
    }

    // --- Retail assignment, change, downgrade and shipping ----------------------

    [RelationalFact]
    public async Task AssignmentChangeAndShippingFollowQaThroughTheRealServices()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 2);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-1");
        }
        // The paid order still waits for a tag, so enrollment needs acknowledging.
        await EnrollAsync(scope, [Code(0), Code(1)], acknowledge: true);
        var first = await TagIdAsync(scope, Code(0));
        var second = await TagIdAsync(scope, Code(1));

        await using (var db = scope.NewContext())
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Admin(db).AssignInventoryTagAsync(AdminId, orderId, first))).Code);

        await PassAsync(scope, Code(0));
        await using (var db = scope.NewContext()) await Admin(db).AssignInventoryTagAsync(AdminId, orderId, first);

        // A package found faulty after assignment can still be held back.
        await SaveAsync(scope, Code(0), PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, "Cracked epoxy found after assignment");
        await using (var db = scope.NewContext())
        {
            await Admin(db).MarkOrderPreparingAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(async () =>
                await Admin(db).MarkOrderReadyToShipAsync(AdminId, orderId, await OrderVersionAsync(db, orderId)))).Code);
        }

        // The replacement must itself be released.
        await using (var db = scope.NewContext())
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Admin(db).ChangeAssignedTagAsync(AdminId, orderId, second, "Failed inspection"))).Code);

        await PassAsync(scope, Code(1));
        await using (var db = scope.NewContext())
        {
            await Admin(db).ChangeAssignedTagAsync(AdminId, orderId, second, "Failed inspection");
            // The failed tag goes back to stock but stays held.
            var failed = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == first);
            Assert.Equal(SmartTagStatus.Unclaimed, failed.Status);
            Assert.Equal(PhysicalQaStatus.Failed, failed.QaStatus);
            Assert.Equal(0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
        }

        await using (var db = scope.NewContext())
        {
            var order = await db.TagOrders.AsNoTracking().SingleAsync(o => o.Id == orderId);
            if (order.Status == OrderStatus.PaymentConfirmed)
                await Admin(db).MarkOrderPreparingAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            await Admin(db).MarkOrderReadyToShipAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            await Admin(db).MarkOrderShippedAsync(AdminId, orderId, new MarkOrderShippedRequest(
                "Test Courier", "Standard", "QA-TRK-1", null, null, await OrderVersionAsync(db, orderId)));
        }

        await using (var db = scope.NewContext())
        {
            var shipped = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == second);
            Assert.Equal(TagFulfilmentStatus.SentToOwner, shipped.FulfilmentStatus);
            Assert.Equal(PhysicalQaStatus.Passed, shipped.QaStatus);
            // Shipped stock has left the inspection queue.
            Assert.False((await QaService(db).LookupAsync(Code(1), default)).CanInspect);
        }
    }

    [RelationalFact]
    public async Task ShippingRefusesATagDowngradedAfterReadyToShip()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 1);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-2");
        }
        await EnrollAsync(scope, [Code(0)], acknowledge: true);
        await PassAsync(scope, Code(0));
        var tagId = await TagIdAsync(scope, Code(0));
        await using (var db = scope.NewContext())
        {
            await Admin(db).AssignInventoryTagAsync(AdminId, orderId, tagId);
            await Admin(db).MarkOrderPreparingAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            await Admin(db).MarkOrderReadyToShipAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
        }

        await SaveAsync(scope, Code(0), PhysicalQaStatus.NeedsReview, PhysicalTagCondition.NeedsReview, "Second package with the same code");

        await using (var db = scope.NewContext())
        {
            var error = await Assert.ThrowsAsync<ApiException>(async () => await Admin(db).MarkOrderShippedAsync(AdminId, orderId,
                new MarkOrderShippedRequest("Test Courier", "Standard", "QA-TRK-2", null, null, await OrderVersionAsync(db, orderId))));
            Assert.Equal("physical_qa_required", error.Code);
        }
        await using (var check = scope.NewContext())
        {
            Assert.Equal(OrderStatus.ReadyToShip, (await check.TagOrders.SingleAsync(o => o.Id == orderId)).Status);
            Assert.Equal(TagFulfilmentStatus.Generated, (await check.SmartTags.SingleAsync(t => t.Id == tagId)).FulfilmentStatus);
        }
    }

    // --- Direct claim, transfer and bulk outbound actions -----------------------

    [RelationalFact]
    public async Task ClaimAndTransferRefuseHeldTags()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 2);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-3");
        }
        // The second tag is promised to an order before the shipment is enrolled.
        var committed = await TagIdAsync(scope, Code(1));
        await using (var db = scope.NewContext()) await Admin(db).AssignInventoryTagAsync(AdminId, orderId, committed);
        await EnrollAsync(scope, [Code(0), Code(1)], acknowledge: true);

        var unclaimed = await TagIdAsync(scope, Code(0));
        await using (var db = scope.NewContext())
        {
            var tag = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == unclaimed);
            var claim = await Assert.ThrowsAsync<ApiException>(() => SmartTags(db).ClaimAsync(AdminId, unclaimed,
                new AdminSmartTagClaimRequest { OwnerUserId = OwnerId, PetId = PetId, ExpectedAssignmentVersion = tag.AssignmentVersion }));
            Assert.Equal("physical_qa_required", claim.Code);
        }
        await using (var db = scope.NewContext())
        {
            var tag = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == committed);
            var transfer = await Assert.ThrowsAsync<ApiException>(() => SmartTags(db).TransferOwnershipAsync(AdminId, committed,
                new AdminSmartTagTransferRequest
                {
                    NewOwnerUserId = OtherOwnerId, NewPetId = OtherPetId,
                    ExpectedAssignmentVersion = tag.AssignmentVersion, Reason = "Owner moved household",
                }));
            Assert.Equal("physical_qa_required", transfer.Code);
        }
        await using (var check = scope.NewContext())
        {
            Assert.Null((await check.SmartTags.SingleAsync(t => t.Id == unclaimed)).OwnerUserId);
            Assert.Equal(OwnerId, (await check.SmartTags.SingleAsync(t => t.Id == committed)).OwnerUserId);
        }
    }

    [RelationalTheory]
    [InlineData("send-to-owner", TagFulfilmentStatus.SentToOwner)]
    [InlineData("send-to-reseller", TagFulfilmentStatus.SentToReseller)]
    public async Task BulkSendOnwardMovesOnlyReleasedTags(string action, TagFulfilmentStatus expected)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext())
        {
            await SeedRetailAsync(seed, tags: 3, fulfilment: TagFulfilmentStatus.Printed);
        }
        await EnrollAsync(scope, [Code(0), Code(1)]);
        await PassAsync(scope, Code(1));
        var held = await TagIdAsync(scope, Code(0));
        var passed = await TagIdAsync(scope, Code(1));
        var historical = await TagIdAsync(scope, Code(2));

        await using (var db = scope.NewContext())
        {
            var result = await Inventory(db).BulkUpdateFulfilmentAsync(AdminId, new AdminTagInventoryBulkActionRequest(action, [held, passed, historical]));
            var failure = Assert.Single(result.Failures);
            Assert.Equal(held, failure.TagId);
        }
        await using (var check = scope.NewContext())
        {
            Assert.Equal(TagFulfilmentStatus.Printed, (await check.SmartTags.SingleAsync(t => t.Id == held)).FulfilmentStatus);
            Assert.Equal(expected, (await check.SmartTags.SingleAsync(t => t.Id == passed)).FulfilmentStatus);
            Assert.Equal(expected, (await check.SmartTags.SingleAsync(t => t.Id == historical)).FulfilmentStatus);
        }
    }

    // --- Public activation --------------------------------------------------------

    [RelationalFact]
    public async Task PublicActivationRefusesHeldStockAndKeepsHistoricalBehaviour()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 5);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-4");
        }
        await using (var db = scope.NewContext()) await Admin(db).AssignInventoryTagAsync(AdminId, orderId, await TagIdAsync(scope, Code(3)));
        await EnrollAsync(scope, [Code(0), Code(1), Code(2), Code(3)], acknowledge: true);
        await SaveAsync(scope, Code(1), PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, "Chip unreadable");
        await PassAsync(scope, Code(2));

        foreach (var (code, why) in new[] { (Code(0), "Pending"), (Code(1), "Failed") })
        {
            await using var db = scope.NewContext();
            var error = await Assert.ThrowsAsync<ApiException>(() => Activation(db).ActivateAsync(OwnerId, code, new ActivateTagRequest(PetId)));
            Assert.True(error.Code == "tag_not_ready", $"{why}: {error.Code}");
        }
        // An unshipped order tag held for inspection cannot be activated either.
        await using (var db = scope.NewContext())
            Assert.Equal("tag_not_ready", (await Assert.ThrowsAsync<ApiException>(() =>
                Activation(db).ActivateAsync(OwnerId, Code(3), new ActivateTagRequest(null)))).Code);

        await using (var db = scope.NewContext()) await Activation(db).ActivateAsync(OwnerId, Code(2), new ActivateTagRequest(PetId));
        // Historical stock outside the QA cohort activates exactly as before.
        await using (var db = scope.NewContext()) await Activation(db).ActivateAsync(OwnerId, Code(4), new ActivateTagRequest(PetId));

        await using var check = scope.NewContext();
        var statuses = await check.SmartTags.ToDictionaryAsync(t => t.TagCode, t => t.Status);
        Assert.Equal(SmartTagStatus.Unclaimed, statuses[Code(0)]);
        Assert.Equal(SmartTagStatus.Unclaimed, statuses[Code(1)]);
        Assert.Equal(SmartTagStatus.Active, statuses[Code(2)]);
        Assert.NotEqual(SmartTagStatus.Active, statuses[Code(3)]);
        Assert.Equal(SmartTagStatus.Active, statuses[Code(4)]);
        Assert.Empty(await check.TagScans.ToListAsync());
    }

    // --- Merchant allocation and fulfilment ------------------------------------------

    [RelationalFact]
    public async Task MerchantCommitmentsEnrollHeldAndCannotBeReadiedOrManuallyAllocatedUntilPassed()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var db = scope.NewContext())
        {
            await SeedAsync(db, nfcStock: 6);
            await UseInspectableCodesAsync(db);
            await IssueInvoiceAsync(db);
            var service = Service(db);
            await service.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
            await service.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        }

        var nfcCodes = Enumerable.Range(0, 6).Select(Code).ToArray();
        await using (var db = scope.NewContext())
        {
            var preview = await QaService(db).PreviewAsync(new PhysicalQaCohortRequest("MERCHANT-SHIP", nfcCodes, 6), default);
            Assert.Empty(preview.Problems);
            Assert.Equal(4, preview.Commitments.Count);
            Assert.All(preview.Commitments, c => Assert.Equal(PhysicalQaCommitmentKind.MerchantOrder, c.Kind));
            Assert.True(preview.RequiresAcknowledgement);
            Assert.Equal("qa_commitments_require_review", (await Assert.ThrowsAsync<ApiException>(() =>
                QaService(db).EnrollAsync(AdminAccountId, new PhysicalQaCohortRequest("MERCHANT-SHIP", nfcCodes, 6), default))).Code);
            await QaService(db).EnrollAsync(AdminAccountId, new PhysicalQaCohortRequest("MERCHANT-SHIP", nfcCodes, 6, true), default);
        }

        await using (var db = scope.NewContext())
        {
            // The allocations are kept; only shipping readiness is refused.
            Assert.Equal(4, await db.MerchantOrderAllocatedTags.CountAsync(a => a.MerchantOrderItemId == NfcItemId && a.ReleasedAt == null));
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Service(db).MarkReadyToShipAsync(AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest()))).Code);
            // An unallocated held tag cannot be picked by hand for another order.
            var spare = await db.SmartTags.Where(t => t.ProductVariantId == NfcVariantId
                && !db.MerchantOrderAllocatedTags.Any(a => a.SmartTagId == t.Id && a.ReleasedAt == null)).Select(t => t.Id).FirstAsync();
            await Assert.ThrowsAsync<ApiException>(() => Service(db).AllocateAsync(AdminAccountId, SecondOrderId,
                new AllocateMerchantInventoryRequest(SecondOrderItemId, [spare])));
            Assert.False(await db.MerchantOrderAllocatedTags.AnyAsync(a => a.SmartTagId == spare));
        }

        await using (var db = scope.NewContext())
        {
            var allocated = await db.MerchantOrderAllocatedTags.Where(a => a.MerchantOrderItemId == NfcItemId && a.ReleasedAt == null)
                .Select(a => a.SmartTag!.TagCode).ToListAsync();
            foreach (var code in allocated) await PassAsync(scope, code, AdminAccountId);
        }
        await using (var db = scope.NewContext())
        {
            await Service(db).MarkReadyToShipAsync(AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
            await Service(db).MarkShippedAsync(AdminAccountId, OrderId,
                new MarkMerchantOrderShippedRequest(null, "Test Courier", "Next day", "TRK-QA-1", 18.50m, null));
        }
        await using (var check = scope.NewContext())
            Assert.Equal(MerchantOrderFulfilmentStatus.Shipped, (await check.MerchantOrders.SingleAsync(o => o.Id == OrderId)).FulfilmentStatus);
    }

    // --- Quotations ------------------------------------------------------------------

    [RelationalFact]
    public async Task QuotationSendAndConvertCountOnlyReleasedStockForEnrolledSkus()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid quotationId, variantId;
        await using (var db = scope.NewContext())
        {
            var sales = Sales(db);
            variantId = await SeedSalesCatalogAsync(db);
            for (var index = 0; index < 2; index++)
                db.SmartTags.Add(new SmartTag
                {
                    TagCode = Code(index), ProductVariantId = variantId, HasNfc = true, Status = SmartTagStatus.Unclaimed,
                    FulfilmentStatus = TagFulfilmentStatus.Printed, QaStatus = PhysicalQaStatus.Pending, QaShipmentReference = "QUOTE-SHIP", QaVersion = 1,
                });
            await db.SaveChangesAsync();
            var merchant = await sales.CreateMerchantAsync(null, new UpsertMerchantRequest($"QA Quote {Guid.NewGuid():N}"[..30], null, null, null, null,
                "Aina Rahman", "orders@example.com", "+60123456789",
                new MerchantAddressDto("12 Jalan Perdana", null, "68000", "Ampang", "Selangor", "Malaysia"), true, null, null, null), default);
            quotationId = (await sales.CreateQuotationAsync(null, new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(variantId, 2, 12.50m)]), default)).Id;
        }

        await using (var db = scope.NewContext())
            Assert.Equal("physical_qa_stock_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
                Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Sent, null, default))).Code);

        await SetQaAsync(scope, variantId, PhysicalQaStatus.Passed);
        await using (var db = scope.NewContext())
        {
            await Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Sent, null, default);
            await Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Accepted, null, default);
        }

        // One unit fails before conversion: the order would promise stock we no longer have.
        await using (var db = scope.NewContext())
        {
            var tag = await db.SmartTags.FirstAsync(t => t.ProductVariantId == variantId);
            tag.QaStatus = PhysicalQaStatus.Failed; await db.SaveChangesAsync();
        }
        await using (var db = scope.NewContext())
            Assert.Equal("physical_qa_stock_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
                Sales(db).ConvertQuotationAsync(null, quotationId, null, default))).Code);
        await using (var check = scope.NewContext())
            Assert.False(await check.MerchantOrders.AnyAsync(o => o.SourceQuotationId == quotationId));
    }

    // --- Generation ------------------------------------------------------------------

    [RelationalFact]
    public async Task NewlyGeneratedStockStartsPendingAndIsNotSellable()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext()) variantId = await SeedRetailAsync(seed, tags: 0);

        AdminGenerateTagsResponse response;
        await using (var db = scope.NewContext())
            response = await Inventory(db).GenerateAsync(AdminId, new AdminGenerateTagsRequest(5, variantId));

        await using var check = scope.NewContext();
        var tags = await check.SmartTags.Include(t => t.Batch).Where(t => t.ProductVariantId == variantId).ToListAsync();
        Assert.Equal(5, tags.Count);
        Assert.All(tags, tag =>
        {
            Assert.Equal(PhysicalQaStatus.Pending, tag.QaStatus);
            Assert.Equal(response.BatchNo, tag.QaShipmentReference);
            Assert.Equal(tag.Batch!.BatchNo, tag.QaShipmentReference);
            Assert.Equal(1, tag.QaVersion);
            Assert.Equal(PhysicalTagCondition.Unchecked, tag.QaPhysicalCondition);
        });
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        Assert.Empty(await check.SmartTags.Where(MerchantInventoryEligibility.For(check, variantId)).ToListAsync());
    }

    // --- Enrollment, reconciliation and the QA screens on SQL Server ------------------

    [RelationalFact]
    public async Task EnrollmentReconcilesTheManifestKeepsCommitmentsAndIsIdempotent()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, shippedOrderId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 6);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-5");
            shippedOrderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-6");
        }
        await using (var db = scope.NewContext())
        {
            await Admin(db).AssignInventoryTagAsync(AdminId, orderId, await TagIdAsync(scope, Code(1)));
            await Admin(db).AssignInventoryTagAsync(AdminId, shippedOrderId, await TagIdAsync(scope, Code(2)));
            await Admin(db).MarkOrderPreparingAsync(AdminId, shippedOrderId, await OrderVersionAsync(db, shippedOrderId));
            await Admin(db).MarkOrderReadyToShipAsync(AdminId, shippedOrderId, await OrderVersionAsync(db, shippedOrderId));
            await Admin(db).MarkOrderShippedAsync(AdminId, shippedOrderId, new MarkOrderShippedRequest(
                "Test Courier", "Standard", "QA-TRK-5", null, null, await OrderVersionAsync(db, shippedOrderId)));
        }

        // Codes 0-3 are the shipment; code 2 has already shipped, and the
        // manifest also carries a duplicate, a malformed entry and an unknown code.
        string[] messy = [Code(0), Code(1), Code(2), Code(3), Code(3), "not-a-code", "MPL-ZZZZ-ZZZZ"];
        await using (var db = scope.NewContext())
        {
            var preview = await QaService(db).PreviewAsync(new PhysicalQaCohortRequest("SHIP-1", messy, 4), default);
            Assert.Equal(7, preview.ManifestEntries);
            Assert.Equal(6, preview.UniqueCodes);
            Assert.Equal(4, preview.Found);
            Assert.Equal(Code(3), Assert.Single(preview.DuplicateCodes).TagCode);
            Assert.Equal("NOT-A-CODE", Assert.Single(preview.InvalidCodes));
            Assert.Equal("MPL-ZZZZ-ZZZZ", Assert.Single(preview.MissingCodes));
            Assert.Contains(preview.Problems, p => p.StartsWith(Code(2)) && p.Contains("sent onward"));
            await Assert.ThrowsAsync<ApiException>(() => QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-1", messy, 4, true), default));
            Assert.False(await db.SmartTags.AnyAsync(t => t.QaStatus != null));
        }

        string[] manifest = [Code(0), Code(1), Code(3)];
        PhysicalQaCohortPreview clean;
        await using (var db = scope.NewContext())
        {
            clean = await QaService(db).PreviewAsync(new PhysicalQaCohortRequest("SHIP-1", manifest, 3), default);
            Assert.Empty(clean.Problems);
            var commitment = Assert.Single(clean.Commitments);
            Assert.Equal((Code(1), PhysicalQaCommitmentKind.RetailOrder, "ORD-QA-5"), (commitment.TagCode, commitment.Kind, commitment.Reference));
            var sku = Assert.Single(clean.Skus);
            Assert.Equal(("MPL-QA-GATE", 3), (sku.Sku, sku.Count));
            var batch = Assert.Single(clean.Batches);
            Assert.Equal((3, 6, 3), (batch.InManifest, batch.BatchTotal, batch.NotInManifest));
            Assert.Equal([Code(2), Code(4), Code(5)], batch.NotInManifestCodes);
            Assert.True(clean.RequiresAcknowledgement);
        }

        await EnrollAsync(scope, manifest, acknowledge: true, shipment: "SHIP-1");
        await EnrollAsync(scope, manifest, acknowledge: true, shipment: "SHIP-1");

        await using (var db = scope.NewContext())
        {
            var committed = await db.SmartTags.SingleAsync(t => t.TagCode == Code(1));
            Assert.Equal((PhysicalQaStatus.Pending, orderId, OwnerId, SmartTagStatus.Preparing),
                (committed.QaStatus!.Value, committed.OrderId!.Value, committed.OwnerUserId!.Value, committed.Status));
            Assert.Null((await db.SmartTags.SingleAsync(t => t.TagCode == Code(4))).QaStatus);
            Assert.Equal(3, await db.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-enrolled"));
            Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-cohort-enrolled"));
            Assert.Contains("ORD-QA-5", (await db.AuditLogs.SingleAsync(a => a.Action == "tag-inventory.qa-enrolled" && a.EntityId == committed.Id)).NewValue);

            var qa = QaService(db);
            var summary = await qa.SummaryAsync(new PhysicalQaQuery { Shipment = "SHIP-1" }, default);
            Assert.Equal((3, 3, 0), (summary.TotalExpected, summary.Pending, summary.Inspected));
            var (items, total) = await qa.ListAsync(new PhysicalQaQuery { Shipment = "SHIP-1", QaStatus = "Pending", Sku = "QA-GATE", PageSize = 2 }, default);
            Assert.Equal(3, total);
            Assert.Equal([Code(0), Code(1)], items.Select(i => i.TagCode));
            Assert.All(items, i => Assert.True(i.CanInspect));
        }

        await SaveAsync(scope, Code(0), PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, "=HYPERLINK(\"x\")\nsecond line");
        await using (var db = scope.NewContext())
        {
            var export = await QaService(db).ExportAsync(AdminId, new PhysicalQaQuery { Shipment = "SHIP-1" }, default);
            var csv = Encoding.UTF8.GetString(export.Content);
            var records = csv.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
            Assert.Equal(4, records.Length);
            Assert.Contains("\"'=HYPERLINK(\"\"x\"\")\nsecond line\"", csv);
            Assert.DoesNotContain(csv.Replace("\r\n", "").Replace("\nsecond line", ""), c => c == '\n');
            Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-export"));
            Assert.Empty(await db.TagScans.ToListAsync());
        }
    }

    [RelationalFact]
    public async Task ConcurrentEnrollmentOfTheSameManifestEnrollsEachTagOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext()) await SeedRetailAsync(seed, tags: 20);
        var manifest = Enumerable.Range(0, 20).Select(Code).ToArray();

        var results = await Task.WhenAll(Enumerable.Range(0, 3).Select(async _ =>
        {
            await using var db = scope.NewContext();
            try { await QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-RACE", manifest, 20), default); return 200; }
            catch (ApiException e) { return e.StatusCode; }
        }));

        Assert.Contains(200, results);
        Assert.All(results, status => Assert.True(status is 200 or 409, $"Unexpected {status}"));
        await using var check = scope.NewContext();
        Assert.Equal(20, await check.SmartTags.CountAsync(t => t.QaStatus == PhysicalQaStatus.Pending && t.QaShipmentReference == "SHIP-RACE"));
        Assert.Equal(20, await check.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-enrolled"));
        Assert.All(await check.SmartTags.ToListAsync(), t => Assert.Equal(1, t.QaVersion));
    }

    [RelationalFact]
    public async Task ASecondPackageWithTheSameCodeCannotPassOnADifferentChip()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext()) variantId = await SeedRetailAsync(seed, tags: 1);
        await EnrollAsync(scope, [Code(0)]);
        await PassAsync(scope, Code(0), serial: "04:A1:B2:C3");

        await using (var db = scope.NewContext())
        {
            var qa = QaService(db);
            var item = await qa.LookupAsync(Code(0), default);
            var qr = await qa.CaptureAsync(AdminId, new(Code(0), item.Version, QaCaptureSource.Camera, $"{Site}/q/{Code(0)}", null), default);
            var nfc = await qa.CaptureAsync(AdminId, new(Code(0), item.Version, QaCaptureSource.WebNfc, $"{Site}/n/{Code(0)}", "04:FF:EE:DD"), default);
            var request = new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, PhysicalQaStatus.Passed, PhysicalTagCondition.Good, qr.Evidence, nfc.Evidence, "Repeat package");
            Assert.Equal("physical_qa_chip_mismatch", (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(AdminId, item.Id, request, default))).Code);
            await qa.SaveAsync(AdminId, item.Id, request with { Decision = PhysicalQaStatus.NeedsReview, PhysicalCondition = PhysicalTagCondition.NeedsReview, Remarks = "Two packages share this code" }, default);
            // A lost response retried with the same operation id is not saved twice.
            await qa.SaveAsync(AdminId, item.Id, request with { Decision = PhysicalQaStatus.NeedsReview, PhysicalCondition = PhysicalTagCondition.NeedsReview, Remarks = "Two packages share this code" }, default);
        }
        await using var check = scope.NewContext();
        var tag = await check.SmartTags.SingleAsync();
        Assert.Equal(PhysicalQaStatus.NeedsReview, tag.QaStatus);
        Assert.Equal("04A1B2C3", tag.QaNfcSerialNumber);
        Assert.Equal(2, await check.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-inspected"));
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
    }

    // --- Helpers -----------------------------------------------------------------------

    private static PhysicalQaService QaService(MyPetLinkDbContext db) => new(db,
        new AuditLogService(db, new HttpContextAccessor()), PhysicalQaTests.Protection,
        Options.Create(new PublicSiteOptions { BaseUrl = Site }), TimeProvider.System);

    private static AdminService Admin(MyPetLinkDbContext db) =>
        new(db, new AuditLogService(db, new HttpContextAccessor()), Options.Create(new FeatureOptions()));

    private static AdminSmartTagService SmartTags(MyPetLinkDbContext db) => new(db, new AuditLogService(db, new HttpContextAccessor()));

    private static SmartTagService Activation(MyPetLinkDbContext db) => new(db, new AuditLogService(db, new HttpContextAccessor()));

    private static AdminTagInventoryService Inventory(MyPetLinkDbContext db) => new(db,
        new AuditLogService(db, new HttpContextAccessor()), Options.Create(new PublicSiteOptions { BaseUrl = Site }));

    // The production shape: reservations are counted and the SKU lock is taken.
    private static OrderService Checkout(MyPetLinkDbContext db) => new(
        db, Options.Create(new FeatureOptions { SmartTagOrderingEnabled = true }), new TagPricingService(db),
        new DeliveryService(db, new TagPricingService(db), new AuditLogService(db, new HttpContextAccessor())),
        new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()), TimeProvider.System,
        inventoryAvailability: new TagOrderInventoryAvailabilityService(db));

    private static MerchantSalesService Sales(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new MerchantSalesService(db, new DocumentNumberService(db),
            new BusinessIdentityService(db, audit, TimeProvider.System), audit, TimeProvider.System);
    }

    private static CreateTagOrderRequest CheckoutRequest(MyPetLinkDbContext db, Guid variantId, string key) => new(
        PetId, db.TagProductVariants.AsNoTracking().Single(v => v.Id == variantId).PublicKey, 1,
        new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "KUL", null),
        null, key);

    private static async Task EnrollAsync(RelationalScope scope, string[] codes, bool acknowledge = false, string shipment = "SHIPMENT-900")
    {
        await using var db = scope.NewContext();
        await QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest(shipment, codes, codes.Length, acknowledge), default);
    }

    private static async Task PassAsync(RelationalScope scope, string code, Guid? adminUserId = null, string? serial = null)
    {
        await using var db = scope.NewContext();
        var qa = QaService(db);
        var actor = adminUserId ?? AdminId;
        var item = await qa.LookupAsync(code, default);
        var qr = await qa.CaptureAsync(actor, new(code, item.Version, QaCaptureSource.Camera, $"{Site}/q/{code}", null), default);
        var nfc = await qa.CaptureAsync(actor, new(code, item.Version, QaCaptureSource.WebNfc, $"{Site}/n/{code}", serial ?? ChipFor(code)), default);
        Assert.True(qr.Matches && nfc.Matches, $"{qr.Problem} {nfc.Problem}");
        await qa.SaveAsync(actor, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, PhysicalQaStatus.Passed,
            PhysicalTagCondition.Good, qr.Evidence, nfc.Evidence, item.InspectedAt is null ? null : "Repeat inspection"), default);
    }

    // A distinct, Web NFC-formatted 7-byte chip UID per tag code.
    private static string ChipFor(string code) =>
        "04:" + string.Join(":", System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(code)).Take(6).Select(b => b.ToString("x2")));

    private static async Task SaveAsync(RelationalScope scope, string code, PhysicalQaStatus decision, PhysicalTagCondition condition, string remarks)
    {
        await using var db = scope.NewContext();
        var qa = QaService(db);
        var item = await qa.LookupAsync(code, default);
        await qa.SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, decision, condition, null, null, remarks), default);
    }

    private static async Task SetQaAsync(RelationalScope scope, Guid variantId, PhysicalQaStatus status)
    {
        await using var db = scope.NewContext();
        foreach (var tag in await db.SmartTags.Where(t => t.ProductVariantId == variantId).ToListAsync()) tag.QaStatus = status;
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> TagIdAsync(RelationalScope scope, string code)
    {
        await using var db = scope.NewContext();
        return await db.SmartTags.Where(t => t.TagCode == code).Select(t => t.Id).SingleAsync();
    }

    private static async Task<string> OrderVersionAsync(MyPetLinkDbContext db, Guid orderId) =>
        Convert.ToBase64String(await db.TagOrders.AsNoTracking().Where(o => o.Id == orderId).Select(o => o.RowVersion).SingleAsync());

    private static async Task UseInspectableCodesAsync(MyPetLinkDbContext db)
    {
        var tags = await db.SmartTags.Where(t => t.ProductVariantId == NfcVariantId).OrderBy(t => t.TagCode).ToListAsync();
        for (var index = 0; index < tags.Count; index++) tags[index].TagCode = Code(index);
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedRetailAsync(MyPetLinkDbContext db, int tags,
        TagFulfilmentStatus fulfilment = TagFulfilmentStatus.Generated)
    {
        foreach (var (id, email, name) in new[] { (AdminId, "qa.admin@example.com", "QA Admin"), (OwnerId, "qa.owner@example.com", "QA Owner"),
            (OtherOwnerId, "qa.other@example.com", "Other Owner") })
            db.Users.Add(new User
            {
                Id = id, Email = email, NormalizedEmail = email.ToUpperInvariant(), DisplayName = name, Status = UserStatus.Active,
                AdminUser = id == AdminId ? new AdminUser { UserId = id, Role = AdminRole.Admin, IsActive = true } : null,
            });
        db.Pets.Add(new Pet { Id = PetId, OwnerUserId = OwnerId, Slug = "milo-qa1", Name = "Milo", Species = "Dog", LifecycleStatus = PetLifecycleStatus.Active });
        db.Pets.Add(new Pet { Id = OtherPetId, OwnerUserId = OtherOwnerId, Slug = "luna-qa2", Name = "Luna", Species = "Cat", LifecycleStatus = PetLifecycleStatus.Active });
        var product = new TagProduct { Name = "MyPetLink Smart Tag", Slug = "qa-gate-tag", IsPublished = true };
        var variant = new TagProductVariant
        {
            TagProduct = product, PublicKey = "QAGATEVARIANT001", Sku = "MPL-QA-GATE", DisplayName = "Standard",
            SupportsQr = true, SupportsNfc = true, TagVariant = "Standard", BasePrice = 39.90m, Currency = "MYR",
            WidthMm = 30, HeightMm = 30, WeightGrams = 6, Material = "Stainless steel", Shape = "Round", Colour = "Silver",
            PackagingType = "Retail card", PrintTemplateCode = "TPL-QA-GATE", IsActive = true, IsPurchasable = true,
        };
        var batch = new SmartTagBatch { BatchNo = "QA-B-0001", ProductVariant = variant, Quantity = tags, HasNfc = true, Variant = "Standard" };
        db.AddRange(product, variant, batch);
        for (var index = 0; index < tags; index++)
            db.SmartTags.Add(new SmartTag
            {
                TagCode = Code(index), ProductVariant = variant, Batch = batch, HasNfc = true, Variant = "Standard",
                Status = SmartTagStatus.Unclaimed, FulfilmentStatus = fulfilment,
            });
        await db.SaveChangesAsync();
        return variant.Id;
    }

    private static async Task<Guid> SeedConfirmedOrderAsync(MyPetLinkDbContext db, Guid variantId, string number)
    {
        var variant = await db.TagProductVariants.SingleAsync(v => v.Id == variantId);
        var order = new TagOrder
        {
            OrderNumber = number, OwnerUserId = OwnerId, PetId = PetId, TagType = TagType.QrNfcSmartTag, Variant = variant.TagVariant,
            Amount = 39.90m, Currency = "MYR", Status = OrderStatus.PaymentConfirmed, PaymentStatus = PaymentStatus.Confirmed,
            RecipientName = "Aina", DeliveryPhoneE164 = "+60123456789", AddressLine1 = "1 Jalan Pet", Postcode = "50000",
            City = "Kuala Lumpur", State = "WP",
            Items =
            {
                new TagOrderItem
                {
                    ProductVariant = variant, SkuSnapshot = variant.Sku, ProductNameSnapshot = "MyPetLink Smart Tag",
                    VariantNameSnapshot = variant.DisplayName, UnitBasePrice = 39.90m, Quantity = 1, Subtotal = 39.90m,
                    FinalUnitPrice = 39.90m, FinalAmount = 39.90m, Currency = "MYR",
                },
            },
        };
        db.TagOrders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
    }

    private static async Task<Guid> SeedSalesCatalogAsync(MyPetLinkDbContext db)
    {
        var product = new TagProduct { Name = "Wholesale Tag", Slug = "qa-wholesale", IsPublished = true };
        var variant = new TagProductVariant
        {
            TagProduct = product, PublicKey = "QAWHOLESALE00001", Sku = "WS-QA-0001", DisplayName = "Lightweight",
            SupportsQr = true, SupportsNfc = true, TagVariant = "Lightweight", BasePrice = 19.90m, Currency = "MYR",
            IsActive = true, IsPurchasable = true,
        };
        db.AddRange(product, variant);
        var identity = await db.BusinessIdentitySettings.SingleOrDefaultAsync();
        if (identity is null)
        {
            identity = new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId, BrandName = "MyPetLink", LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "202603141718 (AS0515813-P)", RegisteredCountry = "Malaysia", SupportEmail = "support@mypetlink.com.my",
            };
            db.BusinessIdentitySettings.Add(identity);
        }
        identity.RegisteredAddressLine1 = "12 Jalan Teknologi 3/1";
        identity.RegisteredPostcode = "57000";
        identity.RegisteredCity = "Kuala Lumpur";
        identity.RegisteredState = "Kuala Lumpur";
        await db.SaveChangesAsync();
        return variant.Id;
    }
}
