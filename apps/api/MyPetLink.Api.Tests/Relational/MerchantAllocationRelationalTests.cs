using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Allocation runs against real SQL Server because the guarantees under test —
/// a filtered unique index, an application lock, and a transaction that revalidates
/// what it is about to take — do not exist in the InMemory provider.
/// </summary>
public sealed class MerchantAllocationRelationalTests
{
    // =====================================================================
    // Eligibility
    // =====================================================================

    [RelationalFact]
    public async Task OnlyUnclaimedUnitsOfTheOrderedSkuAreEligible()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);

        // Every way a tag can stop being sellable, one tag at a time.
        var tags = await db.SmartTags
            .Where(tag => tag.ProductVariantId == QrVariantId)
            .OrderBy(tag => tag.TagCode)
            .ToListAsync();

        tags[0].OwnerUserId = OwnerAccountId;
        tags[1].Status = SmartTagStatus.Active;
        tags[2].Status = SmartTagStatus.Disabled;
        tags[3].Status = SmartTagStatus.Lost;
        tags[4].Status = SmartTagStatus.Replaced;
        tags[5].ArchivedAt = Now;
        tags[6].FulfilmentStatus = TagFulfilmentStatus.SentToReseller;
        tags[7].DeletedAt = Now;
        await db.SaveChangesAsync();

        var eligible = await db.SmartTags
            .Where(MerchantInventoryEligibility.For(db, QrVariantId))
            .Select(tag => tag.TagCode)
            .ToListAsync();

        Assert.Equal(6, eligible.Count);
        Assert.DoesNotContain("TAGQ0000", eligible);
        Assert.DoesNotContain("TAGQ0006", eligible);
        // A different SKU's stock never counts towards this line.
        Assert.All(eligible, code => Assert.StartsWith("TAGQ", code));
    }

    [RelationalFact]
    public async Task ATagAlreadyAssignedToARetailOrderIsNotMerchantStock()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);

        var before = await db.SmartTags
            .CountAsync(MerchantInventoryEligibility.For(db, QrVariantId));

        // A real retail order and line, so the foreign keys are genuine and the
        // exclusion is proved against the shape production actually stores.
        var retail = await SeedRetailOrderAsync(db);
        var tag = await db.SmartTags.FirstAsync(item => item.TagCode == "TAGQ0000");
        tag.OrderId = retail.OrderId;
        tag.OrderItemId = retail.OrderItemId;
        await db.SaveChangesAsync();

        var after = await db.SmartTags
            .CountAsync(MerchantInventoryEligibility.For(db, QrVariantId));

        Assert.Equal(before - 1, after);

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, [tag.Id])));
        Assert.Equal("inventory_not_eligible", failure.Code);
    }

    [RelationalFact]
    public async Task AnAllocatedTagIsNoLongerRetailStock()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var availability = new TagOrderInventoryAvailabilityService(db);

        var before = await availability.GetAvailableUnitsAsync(QrVariantId);
        await Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 4));
        var after = await availability.GetAvailableUnitsAsync(QrVariantId);

        // Retail and merchant demand draw on one pool, not two.
        Assert.Equal(before - 4, after);
    }

    // =====================================================================
    // Allocation
    // =====================================================================

    [RelationalFact]
    public async Task ManualAllocationTakesExactlyTheChosenTags()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var chosen = TagIds(db, QrVariantId, 3);

        var summary = await Service(db).AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, chosen));

        var line = summary.Items.Single(item => item.MerchantOrderItemId == QrItemId);
        Assert.Equal(10, line.RequiredUnits);
        Assert.Equal(3, line.AllocatedUnits);
        Assert.Equal(7, line.RemainingUnits);
        Assert.False(line.IsFullyAllocated);
        Assert.False(summary.IsFullyAllocated);
        Assert.Equal(14, summary.RequiredUnits);
        Assert.Equal(3, summary.AllocatedUnits);

        var stored = await db.MerchantOrderAllocatedTags
            .Where(allocation => allocation.MerchantOrderItemId == QrItemId)
            .Select(allocation => allocation.SmartTagId)
            .ToListAsync();
        Assert.Equal(chosen.OrderBy(id => id), stored.OrderBy(id => id));
    }

    [RelationalFact]
    public async Task ManualAllocationRefusesAnotherSkusTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var wrongSku = TagIds(db, NfcVariantId, 1);

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, wrongSku)));

        Assert.Equal("sku_mismatch", failure.Code);
        Assert.Empty(await db.MerchantOrderAllocatedTags.ToListAsync());
    }

    [RelationalFact]
    public async Task OverAllocatingALineIsRefusedBeforeAnythingIsWritten()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var tooMany = TagIds(db, QrVariantId, 11);

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, tooMany)));

        Assert.Equal("allocation_exceeds_order_quantity", failure.Code);
        Assert.Empty(await db.MerchantOrderAllocatedTags.ToListAsync());
    }

    [RelationalFact]
    public async Task AutomaticAllocationTakesTheOldestBatchFirst()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);

        var summary = await Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));

        var line = summary.Items.Single(item => item.MerchantOrderItemId == QrItemId);
        Assert.True(line.IsFullyAllocated);

        // Ten units were needed and the older batch holds exactly ten.
        var batches = line.Batches.ToDictionary(batch => batch.BatchNo, batch => batch.Quantity);
        Assert.Equal(10, batches["B-2601"]);
        Assert.False(batches.ContainsKey("B-2602"));
    }

    [RelationalFact]
    public async Task AutomaticAllocationSpansBatchesWhenOneIsNotEnough()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);

        var summary = await Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));

        var line = summary.Items.Single(item => item.MerchantOrderItemId == NfcItemId);
        Assert.True(line.IsFullyAllocated);
        Assert.Equal(4, line.Batches.Sum(batch => batch.Quantity));
        Assert.Equal(2, line.Batches.Count);
        Assert.Equal(3, line.Batches.Single(batch => batch.BatchNo == "B-2601").Quantity);
    }

    [RelationalFact]
    public async Task AutomaticAllocationIsDeterministic()
    {
        var firstPick = await PickAsync();
        var secondPick = await PickAsync();

        Assert.Equal(firstPick, secondPick);

        static async Task<string[]> PickAsync()
        {
            await using var scope = await RelationalDatabase.CreateAsync();
            await using var db = scope.NewContext();
            await SeedAsync(db);
            await Service(db).AutoAllocateAsync(
                AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 6));

            return await db.MerchantOrderAllocatedTags
                .OrderBy(allocation => allocation.TagCodeSnapshot)
                .Select(allocation => allocation.TagCodeSnapshot)
                .ToArrayAsync();
        }
    }

    [RelationalFact]
    public async Task AutomaticAllocationReportsInsufficientStockRatherThanPartiallyFilling()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db, qrStock: 3);

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10)));

        Assert.Equal("insufficient_inventory", failure.Code);
        Assert.Contains("3 eligible unit", failure.Message);
        Assert.Empty(await db.MerchantOrderAllocatedTags.ToListAsync());
    }

    [RelationalFact]
    public async Task ATagAllocatedToOneOrderCannotBeAllocatedToAnother()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var chosen = TagIds(db, QrVariantId, 2);

        await Service(db).AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, chosen));

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AllocateAsync(
            AdminAccountId,
            SecondOrderId,
            new AllocateMerchantInventoryRequest(SecondOrderItemId, chosen)));

        Assert.Equal("inventory_already_allocated", failure.Code);
        Assert.Equal(2, await db.MerchantOrderAllocatedTags.CountAsync());
    }

    [RelationalFact]
    public async Task AllocationMovesTheOrderIntoPreparation()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);

        await Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1));

        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderFulfilmentStatus.Preparing, order.FulfilmentStatus);
        Assert.Equal(Now, order.PreparingAt);
    }

    /// <summary>
    /// Preparation normally begins implicitly, on the first allocation rather
    /// than through the explicit button. If only the button were audited, the
    /// step that actually happens would leave no trail at all.
    /// </summary>
    [RelationalFact]
    public async Task EnteringPreparationIsAuditedHoweverItHappens()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1));

        var entries = await db.AuditLogs
            .Where(log => log.Action == "merchant-order.preparing")
            .ToListAsync();
        Assert.Single(entries);
        Assert.Contains("MPL-B2B-ORD-260806-0001", entries[0].NewValue);

        // Allocating again does not re-enter preparation, so it is not
        // announced a second time.
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1));
        Assert.Equal(
            1, await db.AuditLogs.CountAsync(log => log.Action == "merchant-order.preparing"));
    }

    [RelationalFact]
    public async Task TheExplicitPreparingActionIsAuditedOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);

        await service.MarkPreparingAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkPreparingAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        Assert.Equal(
            1, await db.AuditLogs.CountAsync(log => log.Action == "merchant-order.preparing"));
        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderFulfilmentStatus.Preparing, order.FulfilmentStatus);
    }

    // =====================================================================
    // Release
    // =====================================================================

    [RelationalFact]
    public async Task ReleasingReturnsTheTagToStockAndKeepsTheRowForAudit()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var availability = new TagOrderInventoryAvailabilityService(db);
        var service = Service(db);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 4));
        var allocated = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id)
            .Take(2)
            .ToListAsync();
        var reduced = await availability.GetAvailableUnitsAsync(QrVariantId);

        var summary = await service.ReleaseAsync(
            AdminAccountId,
            OrderId,
            new ReleaseMerchantInventoryRequest(allocated, "Damaged in the picking bay."));

        var line = summary.Items.Single(item => item.MerchantOrderItemId == QrItemId);
        Assert.Equal(2, line.AllocatedUnits);
        Assert.Equal(8, line.RemainingUnits);
        Assert.Equal(reduced + 2, await availability.GetAvailableUnitsAsync(QrVariantId));

        // The row survives so the decision can be explained later.
        var released = await db.MerchantOrderAllocatedTags
            .AsNoTracking()
            .Where(allocation => allocation.ReleasedAt != null)
            .ToListAsync();
        Assert.Equal(2, released.Count);
        Assert.All(released, allocation =>
        {
            Assert.Equal("Damaged in the picking bay.", allocation.ReleasedReason);
            Assert.Equal(AdminRecordId, allocation.ReleasedByAdminUserId);
        });
    }

    [RelationalFact]
    public async Task AReleasedTagCanBeAllocatedAgain()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        var chosen = TagIds(db, QrVariantId, 1);

        await service.AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, chosen));
        var allocationId = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).SingleAsync();
        await service.ReleaseAsync(
            AdminAccountId, OrderId,
            new ReleaseMerchantInventoryRequest([allocationId], "Wrong carton."));

        var summary = await service.AllocateAsync(
            AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, chosen));

        Assert.Equal(1, summary.Items.Single(item => item.MerchantOrderItemId == QrItemId)
            .AllocatedUnits);
        Assert.Equal(2, await db.MerchantOrderAllocatedTags.CountAsync());
    }

    [RelationalFact]
    public async Task ReleasingBelowTheRequiredCountWithdrawsReadiness()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var one = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).FirstAsync();
        await service.ReleaseAsync(
            AdminAccountId, OrderId, new ReleaseMerchantInventoryRequest([one], "Recount."));

        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderFulfilmentStatus.Preparing, order.FulfilmentStatus);
        Assert.Null(order.ReadyToShipAt);
    }

    // =====================================================================
    // Payment gate
    // =====================================================================

    [RelationalFact]
    public async Task AnUnpaidOrderCannotAllocateInventory()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db, paymentStatus: MerchantOrderPaymentStatus.AwaitingPayment);

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1)));

        Assert.Equal("payment_not_confirmed", failure.Code);
        Assert.Empty(await db.MerchantOrderAllocatedTags.ToListAsync());
    }

    [RelationalFact]
    public async Task ACancelledOrderCannotAllocateInventory()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db, paymentStatus: MerchantOrderPaymentStatus.Cancelled);

        var failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1)));

        Assert.Equal("order_cancelled", failure.Code);
    }

    [RelationalFact]
    public async Task TheSummaryExplainsWhyAllocationIsClosed()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db, paymentStatus: MerchantOrderPaymentStatus.AwaitingPayment);

        var summary = await Service(db).GetAllocationSummaryAsync(OrderId);

        Assert.False(summary.AllocationAllowed);
        Assert.Contains("payment is confirmed", summary.AllocationBlockedReason);
        Assert.False(summary.CanMarkReadyToShip);
    }

    // =====================================================================
    // Authorization
    // =====================================================================

    [RelationalFact]
    public async Task AllocationRequiresAnAuthenticatedAdmin()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);

        var anonymous = await Assert.ThrowsAsync<ApiException>(() => Service(db).AutoAllocateAsync(
            null, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1)));
        Assert.Equal(401, anonymous.StatusCode);

        var owner = await Assert.ThrowsAsync<ApiException>(() => Service(db).AutoAllocateAsync(
            OwnerAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1)));
        Assert.Equal(403, owner.StatusCode);

        Assert.Empty(await db.MerchantOrderAllocatedTags.ToListAsync());
    }

    // =====================================================================
    // Audit
    // =====================================================================

    [RelationalFact]
    public async Task EveryAllocationStepIsAudited()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);

        await service.AllocateAsync(
            AdminAccountId, OrderId,
            new AllocateMerchantInventoryRequest(QrItemId, TagIds(db, QrVariantId, 2)));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 2));
        var one = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).FirstAsync();
        await service.ReleaseAsync(
            AdminAccountId, OrderId, new ReleaseMerchantInventoryRequest([one], "Recount."));

        var actions = await db.AuditLogs.Select(log => log.Action).ToListAsync();
        Assert.Contains("merchant-inventory.allocated", actions);
        Assert.Contains("merchant-inventory.auto-allocated", actions);
        Assert.Contains("merchant-inventory.released", actions);

        // Audit payloads carry counts and identifiers, never tag codes in bulk
        // or anything resembling a secret.
        var payloads = await db.AuditLogs
            .Where(log => log.NewValue != null)
            .Select(log => log.NewValue!)
            .ToListAsync();
        Assert.All(payloads, payload =>
        {
            Assert.DoesNotContain("password", payload, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Server=", payload, StringComparison.OrdinalIgnoreCase);
        });

        // Each allocation event names the order it belongs to, so the trail can
        // be read without joining back to another table.
        var allocationPayloads = await db.AuditLogs
            .Where(log => log.Action.StartsWith("merchant-inventory.") && log.NewValue != null)
            .Select(log => log.NewValue!)
            .ToListAsync();
        Assert.Equal(3, allocationPayloads.Count);
        Assert.All(allocationPayloads, payload =>
            Assert.Contains("MPL-B2B-ORD-260806-0001", payload));
    }
}
