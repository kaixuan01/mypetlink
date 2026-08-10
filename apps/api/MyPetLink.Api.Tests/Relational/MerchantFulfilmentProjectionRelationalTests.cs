using System.Data.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The Admin listing and dashboard read allocation progress from the same rows
/// the allocation service writes. These tests hold that projection to the same
/// numbers the order pages show, and prove the page costs a fixed number of
/// queries rather than one per row.
/// </summary>
public sealed class MerchantFulfilmentProjectionRelationalTests
{
    private static MerchantSalesService SalesService(MyPetLinkDbContext db) =>
        new(
            db,
            new DocumentNumberService(db),
            new BusinessIdentityService(
                db, new AuditLogService(db, new HttpContextAccessor()), new FixedClock(Now)),
            new AuditLogService(db, new HttpContextAccessor()),
            new FixedClock(Now));

    private static MerchantSalesOverviewService OverviewService(MyPetLinkDbContext db) => new(db);

    // =====================================================================
    // List projection
    // =====================================================================

    [RelationalFact]
    public async Task TheListCarriesAllocationProgressForEveryRow()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await Service(db).AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 6));

        var (items, total) = await SalesService(db).ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, null, null, default);

        Assert.Equal(2, total);
        var order = items.Single(row => row.Id == OrderId);
        Assert.Equal(14, order.RequiredUnits);
        Assert.Equal(6, order.AllocatedUnits);

        // The untouched order reports zero rather than nothing at all.
        var other = items.Single(row => row.Id == SecondOrderId);
        Assert.Equal(10, other.RequiredUnits);
        Assert.Equal(0, other.AllocatedUnits);
    }

    [RelationalFact]
    public async Task ReleasedAllocationsAreNotCountedAsProgress()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 4));
        var one = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).FirstAsync();
        await service.ReleaseAsync(
            AdminAccountId, OrderId, new ReleaseMerchantInventoryRequest([one], "Recount."));

        var (items, _) = await SalesService(db).ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, null, null, default);

        Assert.Equal(3, items.Single(row => row.Id == OrderId).AllocatedUnits);
    }

    [RelationalFact]
    public async Task TheListCostsAFixedNumberOfQueriesRegardlessOfRowCount()
    {
        var counter = new CountingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(counter);
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup);
            await Service(setup).AutoAllocateAsync(
                AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 3));
        }

        await using var db = scope.NewContext();
        counter.Reset();
        var (items, _) = await SalesService(db).ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, null, null, default);

        // One count, one page, one grouped allocation query. A per-row summary
        // call would scale with items.Count instead.
        Assert.Equal(2, items.Count);
        Assert.True(counter.Commands <= 4, $"{counter.Commands} commands for {items.Count} rows");
    }

    [RelationalFact]
    public async Task ShipmentDetailTravelsWithTheListRow()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(
            AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(
                null, "Test Courier", "Next day", "TRK-LIST-1", 19.9m, "Gate B."));

        var (items, _) = await SalesService(db).ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, null, null, default);
        var order = items.Single(row => row.Id == OrderId);

        Assert.Equal("Test Courier", order.CourierProvider);
        Assert.Equal("Next day", order.CourierService);
        Assert.Equal("TRK-LIST-1", order.TrackingNumber);
        Assert.NotNull(order.ShippedAt);
        Assert.Equal(MerchantOrderFulfilmentStatus.Shipped, order.FulfilmentStatus);
    }

    // =====================================================================
    // Filters
    // =====================================================================

    [RelationalFact]
    public async Task AllocationStateFiltersSeparateTheThreeShapes()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        var sales = SalesService(db);

        // Nothing allocated anywhere yet.
        var (none, _) = await sales.ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, "none", null, default);
        Assert.Equal(2, none.Count);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 4));

        var (incomplete, _) = await sales.ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, "incomplete", null, default);
        Assert.Contains(incomplete, row => row.Id == OrderId);

        var (complete, _) = await sales.ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, "complete", null, default);
        Assert.Empty(complete);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 6));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));

        var (nowComplete, _) = await sales.ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null, null, "complete", null, default);
        Assert.Single(nowComplete);
        Assert.Equal(OrderId, nowComplete.Single().Id);
    }

    [RelationalFact]
    public async Task FulfilmentStatusAndCourierFilterIndependently()
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
        var sales = SalesService(db);

        var (ready, _) = await sales.ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null,
            MerchantOrderFulfilmentStatus.ReadyToShip, null, null, default);
        Assert.Single(ready);

        var (shipped, _) = await sales.ListMerchantOrdersAsync(
            1, 20, null, null, null, null, null, null,
            MerchantOrderFulfilmentStatus.Shipped, null, null, default);
        Assert.Empty(shipped);
    }

    [RelationalFact]
    public async Task SearchFindsAnOrderByItsTrackingNumber()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(
            AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(null, "Test Courier", null, "TRK-FIND-77", null, null));

        var (found, total) = await SalesService(db).ListMerchantOrdersAsync(
            1, 20, "TRK-FIND-77", null, null, null, null, null, null, null, null, default);

        Assert.Equal(1, total);
        Assert.Equal(OrderId, found.Single().Id);
    }

    // =====================================================================
    // Overview
    // =====================================================================

    [RelationalFact]
    public async Task TheOverviewSeparatesAwaitingPartialAndFullAllocation()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        var overview = OverviewService(db);

        var before = await overview.GetOverviewAsync();
        Assert.Equal(2, before.PaidOrdersAwaitingAllocation);
        Assert.Equal(0, before.PartiallyAllocatedOrders);
        Assert.Equal(0, before.FullyAllocatedOrders);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 4));

        var partial = await overview.GetOverviewAsync();
        Assert.Equal(1, partial.PaidOrdersAwaitingAllocation);
        Assert.Equal(1, partial.PartiallyAllocatedOrders);
        // A partially allocated order is never counted as fully allocated.
        Assert.Equal(0, partial.FullyAllocatedOrders);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 6));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));

        var full = await overview.GetOverviewAsync();
        Assert.Equal(0, full.PartiallyAllocatedOrders);
        Assert.Equal(1, full.FullyAllocatedOrders);
    }

    [RelationalFact]
    public async Task TheOverviewCountsEachFulfilmentStageOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var ready = await OverviewService(db).GetOverviewAsync();
        Assert.Equal(1, ready.OrdersReadyToShip);
        Assert.Equal(0, ready.OrdersShipped);

        await service.MarkShippedAsync(
            AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(null, "Test Courier", null, "TRK-1", null, null));
        await service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var delivered = await OverviewService(db).GetOverviewAsync();
        Assert.Equal(0, delivered.OrdersReadyToShip);
        Assert.Equal(0, delivered.OrdersShipped);
        Assert.Equal(1, delivered.OrdersDelivered);
        // A shipped order has left allocation behind entirely.
        Assert.Equal(1, delivered.PaidOrdersAwaitingAllocation);
    }

    // =====================================================================
    // Timeline
    // =====================================================================

    [RelationalFact]
    public async Task TheTimelineReadsAsSentencesWithNoCodesOrPayloads()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await service.AllocateAsync(
            AdminAccountId, OrderId,
            new AllocateMerchantInventoryRequest(QrItemId, TagIds(db, QrVariantId, 3)));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 7));
        var one = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).FirstAsync();
        await service.ReleaseAsync(
            AdminAccountId, OrderId, new ReleaseMerchantInventoryRequest([one], "Recount."));

        var timeline = await SalesService(db).GetMerchantOrderTimelineAsync(OrderId, default);
        var summaries = timeline.Select(entry => entry.Summary).ToList();

        Assert.Contains("3 tag(s) allocated by hand.", summaries);
        Assert.Contains("7 tag(s) allocated automatically.", summaries);
        Assert.Contains("1 tag(s) released back to stock.", summaries);
        Assert.Contains("Preparation started.", summaries);

        // No enum name, no action code, no payload, no id.
        Assert.All(summaries, summary =>
        {
            Assert.DoesNotContain("merchant-inventory", summary);
            Assert.DoesNotContain("{", summary);
            Assert.DoesNotContain("Guid", summary);
            Assert.DoesNotContain("NotStarted", summary);
        });
        // The release reason is internal and never reaches a summary.
        Assert.All(summaries, summary => Assert.DoesNotContain("Recount", summary));
    }

    [RelationalFact]
    public async Task TheTimelineNamesTheCourierOnShipment()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(
            AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(
                null, "Rocket Courier", null, "TRK-9", 21m, "Gate B, ask for Sam."));
        await service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var summaries = (await SalesService(db).GetMerchantOrderTimelineAsync(OrderId, default))
            .Select(entry => entry.Summary).ToList();

        Assert.Contains("Marked ready to ship.", summaries);
        Assert.Contains("Shipped via Rocket Courier.", summaries);
        Assert.Contains("Delivered.", summaries);
        // Internal notes and cost stay out of the timeline entirely.
        Assert.All(summaries, summary =>
        {
            Assert.DoesNotContain("Gate B", summary);
            Assert.DoesNotContain("21", summary);
        });
    }

    /// <summary>
    /// Counts reader round trips so an N+1 listing fails the test rather than
    /// quietly costing one query per row in production.
    /// </summary>
    private sealed class CountingCommandInterceptor : DbCommandInterceptor
    {
        public int Commands { get; private set; }

        public void Reset() => Commands = 0;

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result)
        {
            Commands += 1;
            return result;
        }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Commands += 1;
            return ValueTask.FromResult(result);
        }
    }
}
