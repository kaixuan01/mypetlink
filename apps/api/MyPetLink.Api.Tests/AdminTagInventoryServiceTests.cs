using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class AdminTagInventoryServiceTests
{
    private static readonly Guid AdminUserId = Guid.Parse("51111111-1111-1111-1111-111111111111");
    private static readonly Guid OwnerUserId = Guid.Parse("52222222-2222-2222-2222-222222222222");
    private static readonly Guid PetId = Guid.Parse("53333333-3333-3333-3333-333333333333");

    // --- Listing: filters, search, sorting, pagination ---------------------------------

    [Fact]
    public async Task ListAsync_DefaultsToNewestGeneratedFirst()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (items, total) = await harness.Service.ListAsync(new AdminTagInventoryQuery());

        Assert.Equal(harness.InventoryTagCount, total);
        Assert.Equal(
            items.OrderByDescending(item => item.CreatedAt).Select(item => item.Id),
            items.Select(item => item.Id));
    }

    [Fact]
    public async Task ListAsync_FiltersByFulfilmentStatus()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (items, total) = await harness.Service.ListAsync(
            new AdminTagInventoryQuery { Fulfilment = "Printed" });

        Assert.Equal(2, total);
        Assert.All(items, item => Assert.Equal(TagFulfilmentStatus.Printed, item.FulfilmentStatus));
    }

    [Fact]
    public async Task ListAsync_FiltersByLifecycleStatusWithoutArchived()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (items, _) = await harness.Service.ListAsync(
            new AdminTagInventoryQuery { Status = "Unclaimed" });

        Assert.NotEmpty(items);
        Assert.All(items, item =>
        {
            Assert.Equal(SmartTagStatus.Unclaimed, item.Status);
            Assert.False(item.IsArchived);
        });
    }

    [Fact]
    public async Task ListAsync_ArchivedFilterIncludesArchivedAtTags()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (items, total) = await harness.Service.ListAsync(
            new AdminTagInventoryQuery { Status = "archived" });

        Assert.Equal(1, total);
        Assert.True(items.Single().IsArchived);
    }

    [Fact]
    public async Task ListAsync_CombinesTypeVariantAndBatchFilters()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (items, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery
        {
            TagType = "QR",
            Variant = "Standard",
            Batch = "BATCH-A"
        });

        Assert.NotEmpty(items);
        Assert.All(items, item =>
        {
            Assert.False(item.HasNfc);
            Assert.Equal("Standard", item.Variant);
            Assert.Equal("BATCH-A", item.BatchNo);
        });
    }

    [Fact]
    public async Task ListAsync_ClaimedFilterSplitsLinkedAndUnclaimedStock()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (claimed, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { Claimed = true });
        var (unclaimed, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { Claimed = false });

        Assert.All(claimed, item => Assert.NotNull(item.PetId));
        Assert.All(unclaimed, item => Assert.Null(item.PetId));
        Assert.Equal(harness.InventoryTagCount, claimed.Count + unclaimed.Count);
    }

    [Fact]
    public async Task ListAsync_KeywordSearchMatchesTagCodeBatchPetAndOwner()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (byCode, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { Search = "MPL-AAAA" });
        var (byBatch, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { Search = "BATCH-B" });
        var (byPet, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { Search = "Milo" });
        var (byOwner, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { Search = "owner@example.com" });

        Assert.Single(byCode);
        Assert.Equal("MPL-AAAA-AAAA", byCode.Single().TagCode);
        Assert.NotEmpty(byBatch);
        Assert.All(byBatch, item => Assert.Equal("BATCH-B", item.BatchNo));
        Assert.NotEmpty(byPet);
        Assert.All(byPet, item => Assert.Equal("Milo", item.PetName));
        Assert.NotEmpty(byOwner);
        Assert.All(byOwner, item => Assert.Equal("owner@example.com", item.OwnerEmail));
    }

    [Fact]
    public async Task ListAsync_GeneratedDateRangeFilters()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var from = InventoryHarness.BaseTime.AddDays(1.5);

        var (items, _) = await harness.Service.ListAsync(
            new AdminTagInventoryQuery { GeneratedFrom = from });

        Assert.NotEmpty(items);
        Assert.All(items, item => Assert.True(item.CreatedAt >= from));
    }

    [Fact]
    public async Task ListAsync_InvertedDateRangeIsRejected()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListAsync(new AdminTagInventoryQuery
            {
                GeneratedFrom = InventoryHarness.BaseTime.AddDays(5),
                GeneratedTo = InventoryHarness.BaseTime
            }));

        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task ListAsync_PaginationIsDeterministic()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (page1, total) = await harness.Service.ListAsync(
            new AdminTagInventoryQuery { Page = 1, PageSize = 3, SortBy = "tagCode", SortDir = "asc" });
        var (page2, _) = await harness.Service.ListAsync(
            new AdminTagInventoryQuery { Page = 2, PageSize = 3, SortBy = "tagCode", SortDir = "asc" });

        Assert.Equal(harness.InventoryTagCount, total);
        Assert.Equal(3, page1.Count);
        Assert.Empty(page1.Select(item => item.Id).Intersect(page2.Select(item => item.Id)));

        var combined = page1.Concat(page2).Select(item => item.TagCode).ToArray();
        Assert.Equal(combined.OrderBy(code => code, StringComparer.Ordinal), combined);
    }

    [Fact]
    public async Task ListAsync_RejectsSortFieldsOutsideAllowList()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListAsync(new AdminTagInventoryQuery { SortBy = "ownerUser.Email; DROP TABLE" }));

        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task ListAsync_RejectsUnknownSortDirection()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListAsync(new AdminTagInventoryQuery { SortDir = "sideways" }));

        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task ListAsync_ExistingActiveAndUnclaimedTagsKeepDefaultFulfilment()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var (items, _) = await harness.Service.ListAsync(new AdminTagInventoryQuery { PageSize = 50 });
        var activeTag = items.Single(item => item.Status == SmartTagStatus.Active);
        var unclaimed = items.Where(item => item.Status == SmartTagStatus.Unclaimed).ToArray();

        // Lifecycle and fulfilment stay independent: the activated tag keeps its
        // fulfilment trail, unclaimed stock stays listed and usable.
        Assert.Equal(TagFulfilmentStatus.Received, activeTag.FulfilmentStatus);
        Assert.NotEmpty(unclaimed);
    }

    // --- Bulk fulfilment updates -----------------------------------------------------

    [Fact]
    public async Task BulkUpdate_MarksGeneratedTagsAsPrinted()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var generated = await harness.Db.SmartTags
            .Where(tag =>
                tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                && tag.Status == SmartTagStatus.Unclaimed
                && tag.ArchivedAt == null)
            .Select(tag => tag.Id)
            .ToArrayAsync();

        var response = await harness.Service.BulkUpdateFulfilmentAsync(
            AdminUserId,
            new AdminTagInventoryBulkActionRequest("mark-printed", generated));

        Assert.Equal(generated.Length, response.UpdatedCount);
        Assert.Empty(response.Failures);

        var updated = await harness.Db.SmartTags
            .Where(tag => generated.Contains(tag.Id))
            .ToListAsync();
        Assert.All(updated, tag =>
        {
            Assert.Equal(TagFulfilmentStatus.Printed, tag.FulfilmentStatus);
            Assert.NotNull(tag.PrintedAt);
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
        });
    }

    [Fact]
    public async Task BulkUpdate_MixedSelectionReportsPerTagFailures()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var generated = await harness.Db.SmartTags
            .FirstAsync(tag =>
                tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                && tag.Status == SmartTagStatus.Unclaimed
                && tag.ArchivedAt == null);
        var printed = await harness.Db.SmartTags
            .FirstAsync(tag => tag.FulfilmentStatus == TagFulfilmentStatus.Printed);
        var missing = Guid.NewGuid();

        var response = await harness.Service.BulkUpdateFulfilmentAsync(
            AdminUserId,
            new AdminTagInventoryBulkActionRequest("mark-printed", [generated.Id, printed.Id, missing]));

        Assert.Equal(3, response.RequestedCount);
        Assert.Equal(1, response.UpdatedCount);
        Assert.Equal(2, response.Failures.Count);
        Assert.Contains(response.Failures, failure => failure.TagId == printed.Id);
        Assert.Contains(response.Failures, failure => failure.TagId == missing);
    }

    [Fact]
    public async Task BulkUpdate_NeverTouchesActiveOrArchivedLifecycle()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var active = await harness.Db.SmartTags.FirstAsync(tag => tag.Status == SmartTagStatus.Active);
        var archived = await harness.Db.SmartTags.FirstAsync(tag => tag.ArchivedAt != null);

        var response = await harness.Service.BulkUpdateFulfilmentAsync(
            AdminUserId,
            new AdminTagInventoryBulkActionRequest("mark-printed", [active.Id, archived.Id]));

        Assert.Equal(0, response.UpdatedCount);
        Assert.Equal(2, response.Failures.Count);

        var reloadedActive = await harness.Db.SmartTags.SingleAsync(tag => tag.Id == active.Id);
        var reloadedArchived = await harness.Db.SmartTags.SingleAsync(tag => tag.Id == archived.Id);
        Assert.Equal(SmartTagStatus.Active, reloadedActive.Status);
        Assert.NotNull(reloadedArchived.ArchivedAt);
    }

    [Fact]
    public async Task BulkUpdate_FollowsResellerChain()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var printed = await harness.Db.SmartTags
            .Where(tag => tag.FulfilmentStatus == TagFulfilmentStatus.Printed && tag.Status == SmartTagStatus.Unclaimed)
            .Select(tag => tag.Id)
            .ToArrayAsync();

        var sent = await harness.Service.BulkUpdateFulfilmentAsync(
            AdminUserId, new AdminTagInventoryBulkActionRequest("send-to-reseller", printed));
        Assert.Equal(printed.Length, sent.UpdatedCount);

        var received = await harness.Service.BulkUpdateFulfilmentAsync(
            AdminUserId, new AdminTagInventoryBulkActionRequest("mark-received", printed));
        Assert.Equal(printed.Length, received.UpdatedCount);

        var tags = await harness.Db.SmartTags.Where(tag => printed.Contains(tag.Id)).ToListAsync();
        Assert.All(tags, tag =>
        {
            Assert.Equal(TagFulfilmentStatus.Received, tag.FulfilmentStatus);
            Assert.NotNull(tag.SentToResellerAt);
            Assert.NotNull(tag.ReceivedAt);
        });
    }

    [Fact]
    public async Task BulkUpdate_RejectsUnknownAction()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.BulkUpdateFulfilmentAsync(
                AdminUserId,
                new AdminTagInventoryBulkActionRequest("mark-golden", [Guid.NewGuid()])));

        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task BulkUpdate_RequiresAdmin()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var forbidden = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.BulkUpdateFulfilmentAsync(
                OwnerUserId,
                new AdminTagInventoryBulkActionRequest("mark-printed", [Guid.NewGuid()])));
        var unauthorized = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.BulkUpdateFulfilmentAsync(
                null,
                new AdminTagInventoryBulkActionRequest("mark-printed", [Guid.NewGuid()])));

        Assert.Equal("forbidden", forbidden.Code);
        Assert.Equal("unauthorized", unauthorized.Code);
    }

    [Fact]
    public async Task BulkUpdate_WritesAuditEntry()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var generated = await harness.Db.SmartTags
            .Where(tag =>
                tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                && tag.Status == SmartTagStatus.Unclaimed
                && tag.ArchivedAt == null)
            .Select(tag => tag.Id)
            .Take(1)
            .ToArrayAsync();

        await harness.Service.BulkUpdateFulfilmentAsync(
            AdminUserId, new AdminTagInventoryBulkActionRequest("mark-printed", generated));

        var audit = await harness.Db.AuditLogs
            .SingleAsync(log => log.Action == "tag-inventory.mark-printed");
        Assert.Equal(ActorType.Admin, audit.ActorType);
        Assert.Equal(generated.Single(), audit.EntityId);
        Assert.NotNull(audit.NewValue);
        Assert.Contains("Printed", audit.NewValue);
    }

    // --- Export ---------------------------------------------------------------------

    [Fact]
    public async Task Export_CsvAppliesFiltersAndSeparatesLifecycleFromFulfilment()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var export = await harness.Service.ExportAsync(
            AdminUserId,
            new AdminTagInventoryQuery { Fulfilment = "Printed" },
            "csv",
            null);

        Assert.Equal("text/csv", export.ContentType);
        Assert.EndsWith(".csv", export.FileName);

        var lines = System.Text.Encoding.UTF8.GetString(export.Content)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Contains("Lifecycle Status", lines[0]);
        Assert.Contains("Fulfilment Status", lines[0]);
        Assert.Equal(3, lines.Length); // header + the two printed tags
        Assert.All(lines.Skip(1), line => Assert.Contains("Printed", line));
    }

    [Fact]
    public async Task Export_SelectedRowsOnlyExportsSelection()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var selected = await harness.Db.SmartTags
            .Where(tag => tag.TagCode == "MPL-AAAA-AAAA")
            .Select(tag => tag.Id)
            .ToArrayAsync();

        var export = await harness.Service.ExportAsync(
            AdminUserId, new AdminTagInventoryQuery(), "csv", selected);

        var lines = System.Text.Encoding.UTF8.GetString(export.Content)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Equal(2, lines.Length);
        Assert.Contains("MPL-AAAA-AAAA", lines[1]);
    }

    [Fact]
    public async Task Export_XlsxProducesWorkbookAndAuditEntry()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var export = await harness.Service.ExportAsync(
            AdminUserId, new AdminTagInventoryQuery(), "xlsx", null);

        Assert.Equal(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            export.ContentType);
        Assert.EndsWith(".xlsx", export.FileName);
        // XLSX files are zip archives: PK signature.
        Assert.Equal(0x50, export.Content[0]);
        Assert.Equal(0x4B, export.Content[1]);

        var audit = await harness.Db.AuditLogs
            .SingleAsync(log => log.Action == "tag-inventory.export");
        Assert.Contains("xlsx", audit.NewValue!);
    }

    [Fact]
    public async Task Export_RejectsUnknownFormat()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ExportAsync(AdminUserId, new AdminTagInventoryQuery(), "pdf", null));

        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Export_ProtectsAgainstSpreadsheetFormulaInjection()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        pet.Name = "=HYPERLINK(\"https://evil.example\")";
        await harness.Db.SaveChangesAsync();

        var export = await harness.Service.ExportAsync(
            AdminUserId, new AdminTagInventoryQuery { Claimed = true }, "csv", null);
        var text = System.Text.Encoding.UTF8.GetString(export.Content);

        // The formula-leading cell must be neutralized with a quote prefix.
        Assert.Contains("\"'=HYPERLINK", text);
        Assert.DoesNotContain(",\"=HYPERLINK", text);
    }

    // --- Order flow integration -------------------------------------------------------

    [Fact]
    public async Task MarkOrderShipped_AdvancesTagFulfilmentToSentToOwner()
    {
        using var harness = await InventoryHarness.CreateAsync();
        var tag = await harness.Db.SmartTags.FirstAsync(item => item.TagCode == "MPL-CCCC-CCCC");
        var order = new TagOrder
        {
            OrderNumber = "ORD-1001",
            OwnerUserId = OwnerUserId,
            PetId = PetId,
            SmartTagId = tag.Id,
            Status = OrderStatus.PreparingTag,
            PaymentStatus = PaymentStatus.Confirmed,
            RecipientName = "Owner",
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Test",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "WP"
        };

        tag.OwnerUserId = OwnerUserId;
        tag.PetId = PetId;
        tag.Status = SmartTagStatus.Preparing;
        harness.Db.TagOrders.Add(order);
        await harness.Db.SaveChangesAsync();
        tag.OrderId = order.Id;
        await harness.Db.SaveChangesAsync();

        var adminService = new AdminService(
            harness.Db,
            new AuditLogService(harness.Db, new HttpContextAccessor()),
            Microsoft.Extensions.Options.Options.Create(new FeatureOptions()));

        await adminService.MarkOrderShippedAsync(AdminUserId, order.Id, "TRK-1");

        var shipped = await harness.Db.SmartTags.SingleAsync(item => item.Id == tag.Id);
        Assert.Equal(TagFulfilmentStatus.SentToOwner, shipped.FulfilmentStatus);
        Assert.NotNull(shipped.SentToOwnerAt);
        Assert.Equal(SmartTagStatus.Preparing, shipped.Status);
    }

    // --- Generation -----------------------------------------------------------------

    [Fact]
    public async Task Generate_CreatesUnclaimedGeneratedStock()
    {
        using var harness = await InventoryHarness.CreateAsync();

        var response = await harness.Service.GenerateAsync(
            AdminUserId,
            new AdminGenerateTagsRequest(3, "QR", "Lightweight", "BATCH-NEW"));

        Assert.Equal(3, response.Quantity);
        Assert.Equal("BATCH-NEW", response.BatchNo);

        var created = await harness.Db.SmartTags
            .Where(tag => tag.Batch!.BatchNo == "BATCH-NEW")
            .ToListAsync();
        Assert.Equal(3, created.Count);
        Assert.All(created, tag =>
        {
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
            Assert.Equal(TagFulfilmentStatus.Generated, tag.FulfilmentStatus);
            Assert.Matches("^MPL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$", tag.TagCode);
        });
    }

    // --- Harness --------------------------------------------------------------------

    private sealed class InventoryHarness : IDisposable
    {
        private InventoryHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new AdminTagInventoryService(
                db,
                new AuditLogService(db, new HttpContextAccessor()));
        }

        public static readonly DateTimeOffset BaseTime = DateTimeOffset.Parse("2026-07-01T00:00:00Z");

        public MyPetLinkDbContext Db { get; }
        public AdminTagInventoryService Service { get; }

        // Seeded inventory-scope tags (batched or unclaimed).
        public int InventoryTagCount => 7;

        public static async Task<InventoryHarness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            var adminUser = new User
            {
                Id = AdminUserId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser { UserId = AdminUserId, Role = AdminRole.Admin, IsActive = true }
            };

            var owner = new User
            {
                Id = OwnerUserId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            };

            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerUserId,
                OwnerUser = owner,
                Slug = "milo-p123",
                Name = "Milo",
                Species = "Dog"
            };

            var batchA = new SmartTagBatch
            {
                BatchNo = "BATCH-A",
                Quantity = 4,
                HasNfc = false,
                Variant = "Standard",
                GeneratedAt = BaseTime
            };
            var batchB = new SmartTagBatch
            {
                BatchNo = "BATCH-B",
                Quantity = 3,
                HasNfc = true,
                Variant = "Lightweight",
                ResellerName = "Happy Paws Pet Shop",
                GeneratedAt = BaseTime.AddDays(1)
            };

            var tags = new List<SmartTag>
            {
                // BATCH-A: QR / Standard.
                Tag("MPL-AAAA-AAAA", batchA, hasNfc: false, "Standard", BaseTime,
                    SmartTagStatus.Unclaimed, TagFulfilmentStatus.Generated),
                Tag("MPL-BBBB-BBBB", batchA, hasNfc: false, "Standard", BaseTime.AddHours(1),
                    SmartTagStatus.Unclaimed, TagFulfilmentStatus.Generated),
                Tag("MPL-CCCC-CCCC", batchA, hasNfc: false, "Standard", BaseTime.AddHours(2),
                    SmartTagStatus.Unclaimed, TagFulfilmentStatus.Printed),
                Tag("MPL-DDDD-DDDD", batchA, hasNfc: false, "Standard", BaseTime.AddHours(3),
                    SmartTagStatus.Unclaimed, TagFulfilmentStatus.Printed),
                // BATCH-B: QR+NFC / Lightweight.
                Tag("MPL-EEEE-EEEE", batchB, hasNfc: true, "Lightweight", BaseTime.AddDays(2),
                    SmartTagStatus.Unclaimed, TagFulfilmentStatus.SentToReseller),
                // A retail tag that was activated by a customer (claimed).
                Tag("MPL-FFFF-FFFF", batchB, hasNfc: true, "Lightweight", BaseTime.AddDays(2).AddHours(1),
                    SmartTagStatus.Active, TagFulfilmentStatus.Received,
                    configure: tag =>
                    {
                        tag.PetId = PetId;
                        tag.Pet = pet;
                        tag.OwnerUserId = OwnerUserId;
                        tag.OwnerUser = owner;
                        tag.ActivatedAt = BaseTime.AddDays(3);
                    }),
                // Archived stock.
                Tag("MPL-GGGG-GGGG", batchB, hasNfc: true, "Lightweight", BaseTime.AddDays(2).AddHours(2),
                    SmartTagStatus.Unclaimed, TagFulfilmentStatus.Generated,
                    configure: tag => tag.ArchivedAt = BaseTime.AddDays(4))
            };

            db.Users.AddRange(adminUser, owner);
            db.Pets.Add(pet);
            db.SmartTagBatches.AddRange(batchA, batchB);
            db.SmartTags.AddRange(tags);

            var seededTimes = tags.ToDictionary(tag => tag.TagCode, tag => tag.CreatedAt);
            await db.SaveChangesAsync();

            // SaveChanges stamps CreatedAt on inserts; restore the seeded
            // timestamps so date-range and sorting assertions are meaningful.
            foreach (var tag in tags)
            {
                tag.CreatedAt = seededTimes[tag.TagCode];
            }

            await db.SaveChangesAsync();
            return new InventoryHarness(db);
        }

        private static SmartTag Tag(
            string tagCode,
            SmartTagBatch batch,
            bool hasNfc,
            string variant,
            DateTimeOffset createdAt,
            SmartTagStatus status,
            TagFulfilmentStatus fulfilment,
            Action<SmartTag>? configure = null)
        {
            var tag = new SmartTag
            {
                TagCode = tagCode,
                Batch = batch,
                HasNfc = hasNfc,
                Variant = variant,
                Status = status,
                FulfilmentStatus = fulfilment,
                CreatedAt = createdAt,
                UpdatedAt = createdAt
            };

            configure?.Invoke(tag);
            return tag;
        }

        public void Dispose() => Db.Dispose();
    }
}
