using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// B2B Sales and Consignment Delivery Orders share one number series. A number is taken only by a
// document that is actually saved: a failed issue must leave the series where it was.
public sealed partial class ConsignmentRelationalTests
{
    /// <summary>A paid, fully allocated B2B order that is Ready to Ship, so its Delivery Order can be issued.</summary>
    private static async Task ReadyB2BOrder(MyPetLinkDbContext db)
    {
        db.MerchantOrderItems.Remove(await db.MerchantOrderItems.SingleAsync(i => i.Id == QrItemId)); await db.SaveChangesAsync();
        await IssueInvoiceAsync(db);
        var s = Service(db, withEmails: false);
        await s.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await s.MarkReadyToShipAsync(AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
    }

    private static async Task<string> B2BFootprint(MyPetLinkDbContext db) => string.Join("|",
        await db.MerchantInvoices.CountAsync(), await db.MerchantPayments.CountAsync(), await db.MerchantReceipts.CountAsync(),
        await db.SalesCommissions.CountAsync(), await db.TagOrders.CountAsync(),
        string.Join(",", await db.MerchantOrderAllocatedTags.AsNoTracking().OrderBy(a => a.SmartTagId).Select(a => a.SmartTagId + ":" + a.Status).ToListAsync()),
        string.Join(",", await db.MerchantOrders.AsNoTracking().Select(o => o.FulfilmentStatus + ":" + o.PaymentStatus).ToListAsync()));

    [Fact]
    public async Task DeliveryOrderSharedSeriesFailedB2BIssueTakesNoNumberAndRetrySucceeds()
    {
        await using var scope = await Database(10); await using var db = scope.NewContext();
        await ReadyB2BOrder(db);
        var footprint = await B2BFootprint(db);
        Assert.Equal(0, await DeliveryOrderCounter(db));
        // Fail the save after the number is allocated: the issue audit is written in the same save.
        await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER SyntheticFailB2BIssue ON AuditLogs AFTER INSERT AS BEGIN "
            + "IF EXISTS(SELECT 1 FROM inserted WHERE Action='merchant-delivery-order.issued') THROW 51997, 'Synthetic delivery order save failure', 1; END");
        var error = await Assert.ThrowsAnyAsync<Exception>(() => Service(db, withEmails: false).IssueDeliveryOrderAsync(AdminAccountId, OrderId));
        Assert.Contains("51997", error.ToString());
        db.ChangeTracker.Clear();
        Assert.Equal(0, await DeliveryOrderCounter(db));
        Assert.Empty(db.MerchantDeliveryOrders);
        Assert.Equal(0, await db.AuditLogs.CountAsync(a => a.Action == "merchant-delivery-order.issued"));
        Assert.Equal(footprint, await B2BFootprint(db));

        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER SyntheticFailB2BIssue");
        var issued = await Service(db, withEmails: false).IssueDeliveryOrderAsync(AdminAccountId, OrderId);
        Assert.EndsWith("-0001", issued.DeliveryOrderNumber);
        Assert.Equal(issued.DeliveryOrderNumber, (await Service(db, withEmails: false).IssueDeliveryOrderAsync(AdminAccountId, OrderId)).DeliveryOrderNumber);
        Assert.Equal(1, await DeliveryOrderCounter(db));
        Assert.Single(db.MerchantDeliveryOrders);
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "merchant-delivery-order.issued"));
        Assert.Equal(footprint, await B2BFootprint(db));
    }

    [Fact]
    public async Task DeliveryOrderSharedSeriesConcurrentB2BAndConsignmentIssuesNumberEachOnce()
    {
        await using var scope = await Database(20); Guid first, second;
        await using (var db = scope.NewContext())
        {
            var a = await Agreement(db);
            first = (await Dispatched(db, a.Id, 2, "do-shared-1")).Id;
            second = (await Dispatched(db, a.Id, 2, "do-shared-2")).Id;
            await ReadyB2BOrder(db);
        }
        var work = new List<Task>();
        foreach (var id in new[] { first, second, first, second })
            work.Add(Task.Run(async () => { await using var c = scope.NewContext(); await Custody(c).IssueDeliveryOrderAsync(AdminAccountId, id, default); }));
        foreach (var _ in Enumerable.Range(0, 3))
            work.Add(Task.Run(async () => { await using var c = scope.NewContext(); await Service(c, withEmails: false).IssueDeliveryOrderAsync(AdminAccountId, OrderId); }));
        await Task.WhenAll(work);

        await using var check = scope.NewContext();
        var numbers = await check.ConsignmentDeliveryOrders.Select(x => x.DeliveryOrderNumber).ToListAsync();
        numbers.AddRange(await check.MerchantDeliveryOrders.Select(x => x.DeliveryOrderNumber).ToListAsync());
        Assert.Equal(3, numbers.Count); Assert.Equal(3, numbers.Distinct().Count());
        // Concurrent B2B attempts that lose to the first issue release their numbers: no gaps in the series.
        Assert.Equal(3, await DeliveryOrderCounter(check));
        Assert.Equal(new[] { 1, 2, 3 }, numbers.Select(n => int.Parse(n[^4..])).Order().ToArray());
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == "merchant-delivery-order.issued"));
        Assert.Equal(2, await check.AuditLogs.CountAsync(a => a.Action == "consignment.delivery-order-issued"));
    }
}
