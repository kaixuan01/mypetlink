using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// A QA decision and a shipment racing on SQL Server. Shipping re-reads the tag
/// and writes it (its fulfilment step), and a QA save writes the same row under
/// the tag's rowversion and QA-version tokens, so one of the two must lose. The
/// invariant is the one that matters: nothing ever leaves the warehouse with a
/// tag that has not passed inspection.
/// </summary>
public sealed partial class PhysicalQaReleaseGateRelationalTests
{
    [RelationalTheory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task ARetailShipmentRacingAQaFailureNeverShipsAFailedTag(int round)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, tagId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 1);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, $"ORD-RACE-{round}");
        }
        await EnrollAsync(scope, [Code(0)], acknowledge: true, shipment: $"SHIP-RACE-{round}");
        await PassAsync(scope, Code(0));
        tagId = await TagIdAsync(scope, Code(0));
        await using (var db = scope.NewContext())
        {
            await Admin(db).AssignInventoryTagAsync(AdminId, orderId, tagId);
            await Admin(db).MarkOrderPreparingAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            await Admin(db).MarkOrderReadyToShipAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
        }

        PhysicalQaItem item;
        string orderVersion;
        await using (var db = scope.NewContext())
        {
            item = await QaService(db).LookupAsync(Code(0), default);
            orderVersion = await OrderVersionAsync(db, orderId);
        }

        var ship = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try
            {
                await Admin(db).MarkOrderShippedAsync(AdminId, orderId,
                    new MarkOrderShippedRequest("Test Courier", "Standard", $"RACE-{round}", null, null, orderVersion));
                return true;
            }
            catch (Exception) { return false; }
        });
        var fail = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try
            {
                await QaService(db).SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version,
                    PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "Cracked on re-check"), default);
                return true;
            }
            catch (Exception) { return false; }
        });
        var (shipped, failed) = (await ship, await fail);

        await using var check = scope.NewContext();
        var order = await check.TagOrders.AsNoTracking().SingleAsync(o => o.Id == orderId);
        var tag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == tagId);
        // Never shipped with a tag that is not Passed.
        Assert.False(order.Status == OrderStatus.Shipped && tag.QaStatus != PhysicalQaStatus.Passed,
            $"Round {round}: order {order.Status} with tag QA {tag.QaStatus}");
        // Exactly one of the two changed the world; the stored state says which.
        Assert.True(shipped ^ failed, $"Round {round}: shipped={shipped}, failed={failed}");
        Assert.Equal(shipped, order.Status == OrderStatus.Shipped);
        Assert.Equal(failed, tag.QaStatus == PhysicalQaStatus.Failed);
    }

    [RelationalFact]
    public async Task AMerchantShipmentRacingAQaFailureNeverShipsAFailedTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var db = scope.NewContext())
        {
            await SeedAsync(db, nfcStock: 6);
            await UseInspectableCodesAsync(db);
            foreach (var stock in await db.SmartTags.Where(t => t.ProductVariantId == NfcVariantId).ToListAsync())
            {
                stock.QaShipmentReference = "MERCHANT-RACE";
                stock.QaVersion = 1;
            }
            await db.SaveChangesAsync();
            await IssueInvoiceAsync(db);
            var service = Service(db);
            await service.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
            await service.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
            await service.MarkReadyToShipAsync(AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        }

        string allocatedCode;
        PhysicalQaItem item;
        await using (var db = scope.NewContext())
        {
            allocatedCode = await db.MerchantOrderAllocatedTags
                .Where(a => a.MerchantOrderItemId == NfcItemId && a.ReleasedAt == null)
                .Select(a => a.SmartTag!.TagCode).OrderBy(code => code).FirstAsync();
            item = await QaService(db).LookupAsync(allocatedCode, default);
        }

        var ship = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try
            {
                await Service(db).MarkShippedAsync(AdminAccountId, OrderId,
                    new MarkMerchantOrderShippedRequest(null, "Test Courier", "Next day", "TRK-RACE-1", 18.50m, null));
                return true;
            }
            catch (Exception) { return false; }
        });
        var fail = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try
            {
                await QaService(db).SaveAsync(AdminAccountId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version,
                    PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "Chip unreadable on re-check"), default);
                return true;
            }
            catch (Exception) { return false; }
        });
        var (shipped, failed) = (await ship, await fail);

        await using var check = scope.NewContext();
        var fulfilment = (await check.MerchantOrders.AsNoTracking().SingleAsync(o => o.Id == OrderId)).FulfilmentStatus;
        var tag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.TagCode == allocatedCode);
        Assert.False(fulfilment == MerchantOrderFulfilmentStatus.Shipped && tag.QaStatus != PhysicalQaStatus.Passed,
            $"Merchant order {fulfilment} with tag QA {tag.QaStatus}");
        Assert.True(shipped ^ failed, $"shipped={shipped}, failed={failed}");
        Assert.Equal(shipped, fulfilment == MerchantOrderFulfilmentStatus.Shipped);
        Assert.Equal(failed, tag.QaStatus == PhysicalQaStatus.Failed);
    }
}
