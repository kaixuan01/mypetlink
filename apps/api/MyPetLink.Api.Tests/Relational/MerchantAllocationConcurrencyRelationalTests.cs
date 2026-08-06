using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The races that decide whether a physical tag can be sold twice. Each test
/// starts every worker from one gate, so they contend inside the same instant
/// rather than politely queuing.
/// </summary>
public sealed class MerchantAllocationConcurrencyRelationalTests
{
    private static async Task<T[]> RaceAsync<T>(int workers, Func<int, Task<T>> work)
    {
        using var gate = new SemaphoreSlim(0, workers);
        var results = new T[workers];
        var running = Enumerable.Range(0, workers).Select(async index =>
        {
            await gate.WaitAsync();
            results[index] = await work(index);
        }).ToArray();

        gate.Release(workers);
        await Task.WhenAll(running);
        return results;
    }

    [RelationalFact]
    public async Task TwoAdminsAutoAllocatingTheLastUnitsCannotBothWin()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            // Exactly ten QR units for a line that needs ten: there is no slack.
            await SeedAsync(setup, qrStock: 10);
        }

        var outcomes = await RaceAsync(6, async _ =>
        {
            await using var db = scope.NewContext();
            try
            {
                await Service(db).AutoAllocateAsync(
                    AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
                return "won";
            }
            catch (ApiException failure)
            {
                return failure.Code;
            }
        });

        await using var check = scope.NewContext();
        Assert.Single(outcomes.Where(outcome => outcome == "won"));
        Assert.All(
            outcomes.Where(outcome => outcome != "won"),
            code => Assert.Contains(
                code,
                new[] { "insufficient_inventory", "allocation_exceeds_order_quantity",
                    "inventory_already_allocated", "concurrency_conflict", "inventory_busy" }));

        // Ten units allocated once, with no residue from the losers.
        Assert.Equal(10, await check.MerchantOrderAllocatedTags.CountAsync());
        Assert.Equal(
            10, await check.MerchantOrderAllocatedTags.Select(a => a.SmartTagId).Distinct().CountAsync());
    }

    [RelationalFact]
    public async Task TwoMerchantOrdersCompetingForOneSkuNeverShareATag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            // Twelve units, two orders wanting ten each: one must fall short.
            await SeedAsync(setup, qrStock: 12);
        }

        var outcomes = await RaceAsync(2, async index =>
        {
            await using var db = scope.NewContext();
            var (orderId, itemId) = index == 0
                ? (OrderId, QrItemId)
                : (SecondOrderId, SecondOrderItemId);
            try
            {
                await Service(db).AutoAllocateAsync(
                    AdminAccountId, orderId, new AutoAllocateMerchantInventoryRequest(itemId, 10));
                return "won";
            }
            catch (ApiException failure)
            {
                return failure.Code;
            }
        });

        await using var check = scope.NewContext();
        var allocations = await check.MerchantOrderAllocatedTags.ToListAsync();

        Assert.Single(outcomes.Where(outcome => outcome == "won"));
        Assert.Equal(10, allocations.Count);
        Assert.Equal(allocations.Count, allocations.Select(a => a.SmartTagId).Distinct().Count());
        // Everything that was taken belongs to exactly one order.
        Assert.Single(allocations.Select(a => a.MerchantOrderId).Distinct());
    }

    [RelationalFact]
    public async Task ManualAndAutomaticAllocationCannotTakeTheSameTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid[] contested;
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, qrStock: 10);
            contested = TagIds(setup, QrVariantId, 10);
        }

        var outcomes = await RaceAsync(2, async index =>
        {
            await using var db = scope.NewContext();
            try
            {
                if (index == 0)
                {
                    await Service(db).AllocateAsync(
                        AdminAccountId, OrderId,
                        new AllocateMerchantInventoryRequest(QrItemId, contested));
                }
                else
                {
                    await Service(db).AutoAllocateAsync(
                        AdminAccountId, SecondOrderId,
                        new AutoAllocateMerchantInventoryRequest(SecondOrderItemId, 10));
                }

                return "won";
            }
            catch (ApiException failure)
            {
                return failure.Code;
            }
        });

        await using var check = scope.NewContext();
        var allocations = await check.MerchantOrderAllocatedTags.ToListAsync();

        Assert.Single(outcomes.Where(outcome => outcome == "won"));
        Assert.Equal(10, allocations.Count);
        Assert.Equal(allocations.Count, allocations.Select(a => a.SmartTagId).Distinct().Count());
    }

    [RelationalFact]
    public async Task ReleaseAndAllocateRacingLeaveNoDoubleClaim()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid allocationId;
        Guid tagId;
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, qrStock: 10);
            var chosen = TagIds(setup, QrVariantId, 1);
            await Service(setup).AllocateAsync(
                AdminAccountId, OrderId, new AllocateMerchantInventoryRequest(QrItemId, chosen));
            var row = await setup.MerchantOrderAllocatedTags.SingleAsync();
            allocationId = row.Id;
            tagId = row.SmartTagId;
        }

        var outcomes = await RaceAsync(2, async index =>
        {
            await using var db = scope.NewContext();
            try
            {
                if (index == 0)
                {
                    await Service(db).ReleaseAsync(
                        AdminAccountId, OrderId,
                        new ReleaseMerchantInventoryRequest([allocationId], "Recount."));
                }
                else
                {
                    await Service(db).AllocateAsync(
                        AdminAccountId, SecondOrderId,
                        new AllocateMerchantInventoryRequest(SecondOrderItemId, [tagId]));
                }

                return "won";
            }
            catch (ApiException failure)
            {
                return failure.Code;
            }
        });

        await using var check = scope.NewContext();
        var live = await check.MerchantOrderAllocatedTags
            .Where(allocation => allocation.ReleasedAt == null)
            .ToListAsync();

        // Whichever order the two land in, the tag is never held twice at once.
        Assert.True(live.Count <= 1, $"live allocations: {live.Count}");
        Assert.All(live, allocation => Assert.Equal(tagId, allocation.SmartTagId));
        Assert.NotEmpty(outcomes);
    }

    [RelationalFact]
    public async Task RetailCheckoutAndMerchantAllocationDrawOnOnePool()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, qrStock: 10);
        }

        // Merchant allocation takes every unit; retail must then see none.
        await using (var db = scope.NewContext())
        {
            await Service(db).AutoAllocateAsync(
                AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        }

        await using var check = scope.NewContext();
        var availability = new TagOrderInventoryAvailabilityService(check);

        Assert.Equal(0, await availability.GetAvailableUnitsAsync(QrVariantId));
        var refusal = await Assert.ThrowsAsync<ApiException>(() =>
            availability.EnsureAvailableAsync(new Dictionary<Guid, int> { [QrVariantId] = 1 }));
        Assert.NotNull(refusal.Code);
    }

    [RelationalFact]
    public async Task ReadyToShipRacingAllocationNeverShipsAnIncompleteOrder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup);
            var service = Service(setup);
            await service.AutoAllocateAsync(
                AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
            await service.AutoAllocateAsync(
                AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        }

        Guid firstAllocation;
        await using (var setup = scope.NewContext())
        {
            firstAllocation = await setup.MerchantOrderAllocatedTags
                .Select(allocation => allocation.Id).FirstAsync();
        }

        await RaceAsync(2, async index =>
        {
            await using var db = scope.NewContext();
            try
            {
                if (index == 0)
                {
                    await Service(db).MarkReadyToShipAsync(
                        AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
                }
                else
                {
                    await Service(db).ReleaseAsync(
                        AdminAccountId, OrderId,
                        new ReleaseMerchantInventoryRequest([firstAllocation], "Damaged."));
                }

                return "ok";
            }
            catch (ApiException failure)
            {
                return failure.Code;
            }
        });

        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        var allocated = await check.MerchantOrderAllocatedTags
            .CountAsync(allocation => allocation.ReleasedAt == null);

        // The two operations may interleave either way, but the order can only
        // be ready to ship if every ordered unit is still held.
        if (order.FulfilmentStatus == MerchantOrderFulfilmentStatus.ReadyToShip)
        {
            Assert.Equal(14, allocated);
        }
        else
        {
            Assert.Equal(13, allocated);
        }
    }
}
