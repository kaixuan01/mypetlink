using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// SQL Server coverage for the constraints and transaction boundary behind
/// physical tag identity generation. In-memory tests cannot prove either.
/// </summary>
public sealed class AdminTagGenerationRelationalTests
{
    private static readonly Guid AdminUserId = Guid.Parse("d1111111-1111-4111-8111-111111111111");
    private static readonly Guid VariantId = Guid.Parse("d2222222-2222-4222-8222-222222222222");

    [RelationalFact]
    public async Task GenerationOfThreeHundredPersistsOneCompleteBatch()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup);
        }

        await using (var db = scope.NewContext())
        {
            var response = await Service(db).GenerateAsync(
                AdminUserId,
                new AdminGenerateTagsRequest(300, VariantId, SmartTagStockPurpose.Sale));

            Assert.Equal(300, response.RequestedQuantity);
            Assert.Equal(300, response.GeneratedQuantity);
            Assert.Equal(300, response.Tags.Count);
        }

        await using var check = scope.NewContext();
        var batch = await check.SmartTagBatches
            .Include(item => item.SmartTags)
            .SingleAsync(item => item.ProductVariantId == VariantId);
        Assert.Equal(300, batch.Quantity);
        Assert.Equal(300, batch.SmartTags.Count);
        Assert.Equal(300, batch.SmartTags.Select(tag => tag.TagCode).Distinct().Count());
        Assert.All(batch.SmartTags, tag =>
        {
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
            Assert.Equal(TagFulfilmentStatus.Generated, tag.FulfilmentStatus);
            Assert.Null(tag.OwnerUserId);
            Assert.Null(tag.PetId);
            Assert.Null(tag.ActivatedAt);
        });
    }

    [RelationalFact]
    public async Task BulkFulfilmentUpdatesThreeHundredFilteredTagsInBatches()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup);
        string batchNo;
        await using (var setup = scope.NewContext())
        {
            batchNo = (await Service(setup).GenerateAsync(AdminUserId,
                new AdminGenerateTagsRequest(300, VariantId, SmartTagStockPurpose.Sale))).BatchNo;
        }

        await using (var db = scope.NewContext())
        {
            var result = await Service(db).BulkUpdateFulfilmentAsync(AdminUserId,
                new AdminTagInventoryBulkActionRequest("mark-printed", null)
                {
                    SelectionMode = "matching", ExpectedCount = 300,
                    Filters = new AdminTagInventoryQuery
                    {
                        Batch = batchNo, Status = "Unclaimed", Fulfilment = "Generated",
                        StockPurpose = "Sale", Variant = "Lightweight", TagType = "QR_NFC"
                    }
                });
            Assert.Equal(300, result.UpdatedCount);
            Assert.Empty(result.Failures);
        }

        await using var check = scope.NewContext();
        var tags = await check.SmartTags.Where(tag => tag.Batch!.BatchNo == batchNo).ToArrayAsync();
        Assert.Equal(300, tags.Length);
        Assert.All(tags, tag =>
        {
            Assert.Equal(TagFulfilmentStatus.Printed, tag.FulfilmentStatus);
            Assert.Equal(PhysicalQaStatus.Pending, tag.QaStatus);
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
            Assert.Equal(SmartTagStockPurpose.Sale, tag.StockPurpose);
        });
        Assert.Equal(300, await check.AuditLogs.CountAsync(log => log.Action == "tag-inventory.mark-printed"));
    }

    [RelationalFact]
    public async Task ConcurrentGenerationForTheSameSkuCreatesTwoCompleteUniqueBatches()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup);
        }

        using var gate = new SemaphoreSlim(0, 2);
        var operations = Enumerable.Range(0, 2).Select(async _ =>
        {
            await gate.WaitAsync();
            await using var db = scope.NewContext();
            return await Service(db).GenerateAsync(
                AdminUserId,
                new AdminGenerateTagsRequest(51, VariantId, SmartTagStockPurpose.Sale));
        }).ToArray();

        gate.Release(2);
        var responses = await Task.WhenAll(operations);

        await using var check = scope.NewContext();
        var batches = await check.SmartTagBatches
            .Include(batch => batch.SmartTags)
            .Where(batch => batch.ProductVariantId == VariantId)
            .ToListAsync();

        Assert.Equal(2, batches.Count);
        Assert.Equal(2, batches.Select(batch => batch.BatchNo).Distinct().Count());
        Assert.All(batches, batch =>
        {
            Assert.Equal(51, batch.Quantity);
            Assert.Equal(51, batch.SmartTags.Count);
        });
        Assert.Equal(102, batches.SelectMany(batch => batch.SmartTags).Count());
        Assert.Equal(
            102,
            batches.SelectMany(batch => batch.SmartTags).Select(tag => tag.TagCode).Distinct().Count());
        Assert.All(responses, response =>
        {
            Assert.Equal(51, response.RequestedQuantity);
            Assert.Equal(51, response.GeneratedQuantity);
            Assert.Equal(51, response.Tags.Count);
        });
        Assert.Equal(
            2,
            await check.AuditLogs.CountAsync(log => log.Action == "tag-inventory.generate"));
    }

    [RelationalFact]
    public async Task BulkFulfilmentRetriesAConcurrentRowWithoutRepeatingItsAudit()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup);
        Guid[] ids;
        await using (var setup = scope.NewContext())
        {
            var generated = await Service(setup).GenerateAsync(AdminUserId,
                new AdminGenerateTagsRequest(2, VariantId, SmartTagStockPurpose.Sale));
            ids = generated.Tags.Select(tag => tag.Id).ToArray();
        }

        var clock = new OneShotTimeProvider(() =>
        {
            // Runs after the bulk service reads the rows but before it saves.
            using var concurrent = scope.NewContext();
            var tag = concurrent.SmartTags.Single(item => item.Id == ids[0]);
            tag.FulfilmentStatus = TagFulfilmentStatus.Printed;
            tag.PrintedAt = DateTimeOffset.UtcNow;
            concurrent.SaveChanges();
        });
        await using (var db = scope.NewContext())
        {
            var service = new AdminTagInventoryService(db,
                new AuditLogService(db, new HttpContextAccessor()),
                Options.Create(new PublicSiteOptions { BaseUrl = "https://tags.example" }),
                new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()), clock);
            var result = await service.BulkUpdateFulfilmentAsync(AdminUserId,
                new AdminTagInventoryBulkActionRequest("mark-printed", ids));
            Assert.Equal(1, result.UpdatedCount);
            Assert.Equal(1, result.SkippedCount);
            Assert.Empty(result.Failures);
        }

        await using var check = scope.NewContext();
        Assert.Equal(2, await check.SmartTags.CountAsync(tag => ids.Contains(tag.Id)
            && tag.FulfilmentStatus == TagFulfilmentStatus.Printed));
        Assert.Equal(1, await check.AuditLogs.CountAsync(log => log.Action == "tag-inventory.mark-printed"));
    }

    private sealed class OneShotTimeProvider(Action onFirstRead) : TimeProvider
    {
        private Action? _callback = onFirstRead;

        public override DateTimeOffset GetUtcNow()
        {
            Interlocked.Exchange(ref _callback, null)?.Invoke();
            return TimeProvider.System.GetUtcNow();
        }
    }

    private static AdminTagInventoryService Service(MyPetLinkDbContext db) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        Options.Create(new PublicSiteOptions { BaseUrl = "https://tags.example" }));

    private static async Task SeedAsync(MyPetLinkDbContext db)
    {
        var admin = new User
        {
            Id = AdminUserId,
            Email = "inventory-admin@example.com",
            NormalizedEmail = "INVENTORY-ADMIN@EXAMPLE.COM",
            DisplayName = "Inventory Admin",
            Status = UserStatus.Active,
            AdminUser = new AdminUser
            {
                UserId = AdminUserId,
                Role = AdminRole.Admin,
                IsActive = true,
            },
        };
        var product = new TagProduct
        {
            Name = "MyPetLink Smart Tag",
            Slug = "relational-generation-smart-tag",
            IsPublished = true,
        };
        var variant = new TagProductVariant
        {
            Id = VariantId,
            TagProduct = product,
            PublicKey = "RELGENQRNFC001",
            Sku = "REL-GEN-LW-QR-NFC",
            DisplayName = "Lightweight Smart Tag",
            SupportsQr = true,
            SupportsNfc = true,
            TagVariant = TagVariants.Lightweight,
            WidthMm = 25,
            HeightMm = 25,
            WeightGrams = 5,
            Material = "Stainless steel",
            Shape = "Round",
            Colour = "Silver",
            PackagingType = "Retail card",
            BasePrice = 39.90m,
            Currency = "MYR",
            PrintTemplateCode = "TPL-REL-LW-QR-NFC",
            IsActive = true,
            IsPurchasable = true,
        };

        db.Users.Add(admin);
        db.TagProductVariants.Add(variant);
        await db.SaveChangesAsync();
    }
}
