using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The stock-receipt guarantees that only a real database can prove: the
/// SKU-scoped application lock that stops two receipts claiming the same
/// serialized tags, and the native rowversion token that stops two
/// administrators correcting one receipt from the same stale view.
/// </summary>
public sealed class InventoryReceiptConcurrencyRelationalTests
{
    private static readonly Guid AdminUserId = Guid.Parse("c1111111-1111-1111-1111-111111111111");
    private static readonly Guid AdminId = Guid.Parse("c2222222-2222-2222-2222-222222222222");
    private static readonly Guid VariantId = Guid.Parse("c3333333-3333-3333-3333-333333333333");
    private static readonly Guid BatchId = Guid.Parse("c4444444-4444-4444-4444-444444444444");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-08T02:00:00Z");

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

    // Four physical tags, two receipts wanting two each. Both can be satisfied,
    // but only if the lock stops them selecting the same rows.
    [RelationalFact]
    public async Task ConcurrentReceiptsForOneSkuNeverClaimTheSameTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, tagCount: 4);
        }

        var outcomes = await RaceAsync(2, async _ =>
        {
            await using var db = scope.NewContext();
            try
            {
                var created = await Service(db).CreateAsync(AdminUserId, Request(quantity: 2));
                return created.ReceiptNumber;
            }
            catch (ApiException failure)
            {
                return failure.Code;
            }
        });

        await using var check = scope.NewContext();
        Assert.Equal(2, await check.InventoryReceipts.CountAsync());
        Assert.All(outcomes, outcome => Assert.StartsWith("MPL-STK-", outcome));

        // Every unit belongs to exactly one receipt, and each receipt owns
        // exactly what it says it received.
        var linked = await check.SmartTags
            .Where(tag => tag.InventoryReceiptId != null)
            .Select(tag => new { tag.Id, tag.InventoryReceiptId })
            .ToListAsync();
        Assert.Equal(4, linked.Count);
        Assert.Equal(4, linked.Select(row => row.Id).Distinct().Count());
        foreach (var receipt in await check.InventoryReceipts.ToListAsync())
        {
            Assert.Equal(
                receipt.QuantityReceived,
                linked.Count(row => row.InventoryReceiptId == receipt.Id));
        }
    }

    // Four physical tags, two receipts wanting three each. One must fall short
    // rather than both partially succeeding.
    [RelationalFact]
    public async Task ConcurrentReceiptsBeyondAvailableStockLeaveNoPartialReceipt()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, tagCount: 4);
        }

        var outcomes = await RaceAsync(2, async _ =>
        {
            await using var db = scope.NewContext();
            try
            {
                await Service(db).CreateAsync(AdminUserId, Request(quantity: 3));
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
            code => Assert.Contains(code, new[] { "receipt_inventory_shortfall", "inventory_busy" }));

        // The winner owns exactly three; the loser left nothing behind.
        var receipt = Assert.Single(await check.InventoryReceipts.ToListAsync());
        Assert.Equal(3, receipt.QuantityReceived);
        Assert.Equal(
            3, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId == receipt.Id));
        Assert.Equal(1, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId == null));
    }

    // Two administrators holding the same view of a receipt. The first
    // correction supersedes it; the second must be refused rather than
    // silently re-pointing units a second time.
    [RelationalFact]
    public async Task CorrectingFromAStaleViewIsRefused_AndTheUnitsStayWithTheFirstCorrection()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        string staleToken;
        Guid originalId;

        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, tagCount: 2);
        }

        await using (var db = scope.NewContext())
        {
            var original = await Service(db).CreateAsync(AdminUserId, Request(quantity: 2));
            originalId = original.Id;
            staleToken = original.RowVersion;
        }

        await using (var db = scope.NewContext())
        {
            await Service(db, Now.AddMinutes(1)).CreateAsync(
                AdminUserId,
                Request(quantity: 2, unitCost: 2.72m) with
                {
                    CorrectsReceiptId = originalId,
                    CorrectionReason = "Freight invoice restated",
                    CorrectsReceiptRowVersion = staleToken,
                });
        }

        await using (var db = scope.NewContext())
        {
            var refused = await Assert.ThrowsAsync<ApiException>(() =>
                Service(db, Now.AddMinutes(2)).CreateAsync(
                    AdminUserId,
                    Request(quantity: 2, unitCost: 9.99m) with
                    {
                        CorrectsReceiptId = originalId,
                        CorrectionReason = "Second opinion",
                        CorrectsReceiptRowVersion = staleToken,
                    }));
            Assert.Equal("receipt_already_superseded", refused.Code);
        }

        await using var check = scope.NewContext();
        // Two receipts for two tags: the original (superseded, still readable)
        // and the single correction that owns the units.
        Assert.Equal(2, await check.InventoryReceipts.CountAsync());
        var original2 = await check.InventoryReceipts.SingleAsync(row => row.Id == originalId);
        Assert.NotNull(original2.SupersededAt);
        Assert.Equal(3.04m, original2.UnitLandedCostMyr);
        var active = await check.InventoryReceipts
            .Where(row => row.SupersededAt == null).SingleAsync();
        Assert.Equal(2.72m, active.UnitLandedCostMyr);
        Assert.Equal(2, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId == active.Id));

        // Recorded quantity across active receipts still equals real stock.
        Assert.Equal(
            await check.SmartTags.CountAsync(),
            await check.InventoryReceipts.Where(row => row.SupersededAt == null)
                .SumAsync(row => row.QuantityReceived));
    }

    // A stale token that has not yet been superseded is rejected by the native
    // rowversion check rather than overwriting a newer edit.
    [RelationalFact]
    public async Task CorrectingWithATamperedTokenIsRefused()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid originalId;

        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, tagCount: 1);
        }

        await using (var db = scope.NewContext())
        {
            var original = await Service(db).CreateAsync(AdminUserId, Request(quantity: 1));
            originalId = original.Id;
        }

        await using (var db = scope.NewContext())
        {
            await Assert.ThrowsAnyAsync<Exception>(() =>
                Service(db, Now.AddMinutes(1)).CreateAsync(
                    AdminUserId,
                    Request(quantity: 1, unitCost: 2.72m) with
                    {
                        CorrectsReceiptId = originalId,
                        CorrectionReason = "Stale view",
                        CorrectsReceiptRowVersion = Convert.ToBase64String(new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 }),
                    }));
        }

        await using var check = scope.NewContext();
        var stored = await check.InventoryReceipts.SingleAsync(row => row.Id == originalId);
        Assert.Null(stored.SupersededAt);
        Assert.Equal(3.04m, stored.UnitLandedCostMyr);
        Assert.Equal(1, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId == originalId));
    }

    private static CreateInventoryReceiptRequest Request(int quantity, decimal unitCost = 3.04m) =>
        new(VariantId, BatchId, quantity, Now, "Tag Maker", "SUP-1", null, "MYR", 1m,
            InventoryReceiptCostMode.Simple, unitCost, null, null, null, null, null, null);

    private static InventoryReceiptService Service(
        MyPetLinkDbContext db, DateTimeOffset? at = null) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
        new FixedTimeProvider(at ?? Now));

    private static async Task SeedAsync(MyPetLinkDbContext db, int tagCount)
    {
        var user = new User
        {
            Id = AdminUserId,
            Email = "stock-admin@example.com",
            NormalizedEmail = "STOCK-ADMIN@EXAMPLE.COM",
            DisplayName = "Stock Admin",
            Status = UserStatus.Active,
            AdminUser = new AdminUser
            {
                Id = AdminId, UserId = AdminUserId, Role = AdminRole.Admin, IsActive = true,
            },
        };
        var product = new TagProduct
        {
            Name = "QR + NFC Smart Tag", Slug = "qr-nfc-smart-tag", IsPublished = true,
        };
        var variant = new TagProductVariant
        {
            Id = VariantId, TagProduct = product, Sku = "MPL-NFC-STANDARD-V1",
            PublicKey = "STOCKVARIANT0001", DisplayName = "Standard", SupportsQr = true,
            SupportsNfc = true, TagVariant = "Standard", BasePrice = 39.90m, Currency = "MYR",
            IsActive = true,
        };
        var batch = new SmartTagBatch
        {
            Id = BatchId, BatchNo = "MPL-BAT-260908000000-0001", Quantity = tagCount,
            HasNfc = true, Variant = "Standard", ProductVariantId = VariantId,
            ProductVariant = variant, GeneratedAt = Now.AddDays(-3),
        };

        db.Users.Add(user);
        db.TagProducts.Add(product);
        db.SmartTagBatches.Add(batch);
        for (var index = 0; index < tagCount; index++)
        {
            db.SmartTags.Add(new SmartTag
            {
                TagCode = $"MPL-STK{index:0000}", ProductVariantId = VariantId,
                ProductVariant = variant, Batch = batch, HasNfc = true, Variant = "Standard",
                Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Generated,
            });
        }

        await db.SaveChangesAsync();
    }
}
