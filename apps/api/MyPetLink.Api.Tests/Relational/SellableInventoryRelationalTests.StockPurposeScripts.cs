using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The production classification scripts in docs/deployment/sql/smart-tag-stock-purpose,
/// run verbatim (only their documented parameters filled in) against a database
/// shaped like Production: three confirmed 300-unit commercial batches, older
/// manufacturer samples sharing two of their SKUs, and unrelated inventory.
/// </summary>
public sealed partial class SellableInventoryRelationalTests
{
    private const string ClassifyAction = "tag-inventory.stock-purpose.classify";
    private const string RollbackAction = "tag-inventory.stock-purpose.rollback";
    private static readonly (string Code, string Sku)[] VerifiedSamples =
    [
        ("MPL-SMPL-MB01", "MYBOSS-LW-QR-NFC"), ("MPL-SMPL-MB02", "MYBOSS-LW-QR-NFC"),
        ("MPL-SMPL-PW01", "PAWSOME-LW-QR-NFC"), ("MPL-SMPL-PW02", "PAWSOME-LW-QR-NFC"),
    ];

    [RelationalFact]
    public async Task ThePreviewAndADryRunChangeNothing()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await SeedProductionShapeAsync(scope);
        var before = await SnapshotAsync(scope);

        await RunScriptAsync(scope, "01-preview-smart-tag-stock-purpose.sql", sql => WithSamples(sql, VerifiedSamples));
        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", sql => WithSamples(sql, VerifiedSamples, expected: 4));

        Assert.Equal(before, await SnapshotAsync(scope));
        await using var check = scope.NewContext();
        Assert.False(await check.AuditLogs.AnyAsync(entry => entry.Action == ClassifyAction));
    }

    [RelationalFact]
    public async Task ApplyClassifiesExactlyTheConfirmedBatchesAndVerifiedSamplesAndNothingElse()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedProductionShapeAsync(scope);
        var before = await SnapshotAsync(scope);

        // Before classification nothing is commercial, so verification fails.
        Assert.Equal(52090, (await Assert.ThrowsAsync<SqlException>(() =>
            RunScriptAsync(scope, "03-verify-smart-tag-stock-purpose.sql"))).Number);

        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", sql => Commit(WithSamples(sql, VerifiedSamples, expected: 4)));

        var after = await SnapshotAsync(scope);
        // Only StockPurpose changed: codes, QA, lifecycle, ownership, links and UpdatedAt are identical.
        Assert.Equal(before.Select(Protected), after.Select(Protected));
        var sampleCodes = VerifiedSamples.Select(s => s.Code).ToHashSet();
        foreach (var row in after)
        {
            var expected = seed.CommercialTagIds.Contains(row.Id) ? SmartTagStockPurpose.Sale
                : sampleCodes.Contains(row.TagCode) ? SmartTagStockPurpose.Test
                : SmartTagStockPurpose.Unclassified;
            Assert.True(expected == row.Purpose, $"{row.TagCode}: {row.Purpose}, expected {expected}");
        }
        Assert.Equal(900, after.Count(row => row.Purpose == SmartTagStockPurpose.Sale));

        await using (var check = scope.NewContext())
        {
            var audits = await check.AuditLogs.AsNoTracking().Where(entry => entry.Action == ClassifyAction).ToListAsync();
            Assert.Equal(904, audits.Count);
            Assert.Single(audits.Select(entry => RunIdOf(entry.NewValue)).Distinct());
            Assert.Equal(after.Where(r => r.Purpose != SmartTagStockPurpose.Unclassified).Select(r => r.Id).OrderBy(id => id),
                audits.Select(entry => entry.EntityId!.Value).OrderBy(id => id));

            // The catalogue now offers received Sale units enrolled for
            // inspection that have not failed it (5 Passed + 3 Pending). The
            // receipt-linked, enrolled testing sample never counts.
            var stock = new TagOrderInventoryAvailabilityService(check);
            Assert.Equal(8, await stock.GetAvailableUnitsAsync(seed.MybossLw));
            Assert.Equal(0, await stock.GetAvailableUnitsAsync(seed.PawsomeLw)); // 2 failed, the rest never enrolled; the sample is Test
            Assert.Equal(0, await stock.GetAvailableUnitsAsync(seed.PawsomeSd)); // commercial and received, but never enrolled
            // Only the 5 Passed units can be fulfilled.
            Assert.Equal(5, await check.SmartTags.CountAsync(MerchantInventoryEligibility.For(check, seed.MybossLw)));
        }

        await RunScriptAsync(scope, "03-verify-smart-tag-stock-purpose.sql", sql => WithSamples(sql, VerifiedSamples));

        // Idempotent: a second run changes nothing and writes no audit rows.
        var once = await SnapshotAsync(scope);
        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", sql => Commit(WithSamples(sql, VerifiedSamples, expected: 4)));
        Assert.Equal(once, await SnapshotAsync(scope));
        await using (var check = scope.NewContext())
            Assert.Equal(904, await check.AuditLogs.CountAsync(entry => entry.Action == ClassifyAction));
    }

    [RelationalTheory]
    [InlineData("deleted-commercial-tag", 52013)]
    [InlineData("batch-has-another-sku", 52011)]
    [InlineData("sample-listed-from-a-commercial-batch", 52021)]
    [InlineData("unknown-sample-code", 52020)]
    [InlineData("sample-listed-with-another-sku", 52022)]
    [InlineData("sample-count-mismatch", 52001)]
    [InlineData("sample-on-an-open-order", 52024)]
    public async Task ApplyStopsWithoutChangingAnythingWhenTheDataDiffers(string difference, int error)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedProductionShapeAsync(scope);
        var samples = VerifiedSamples.ToList();
        var expectedCount = 4;
        await using (var db = scope.NewContext())
        {
            switch (difference)
            {
                case "deleted-commercial-tag":
                    (await db.SmartTags.FirstAsync(t => t.TagCode == "MPL-C10300")).DeletedAt = DateTimeOffset.UtcNow;
                    break;
                case "batch-has-another-sku":
                    (await db.SmartTagBatches.SingleAsync(b => b.BatchNo == "MPL-BAT-260911002959-6486")).ProductVariantId = seed.PawsomeLw;
                    break;
                case "sample-listed-from-a-commercial-batch":
                    samples[0] = ("MPL-C10001", "MYBOSS-LW-QR-NFC");
                    break;
                case "unknown-sample-code":
                    samples[0] = ("MPL-NOPE-0001", "MYBOSS-LW-QR-NFC");
                    break;
                case "sample-listed-with-another-sku":
                    samples[2] = ("MPL-SMPL-PW01", "MYBOSS-LW-QR-NFC");
                    break;
                case "sample-count-mismatch":
                    expectedCount = 3;
                    break;
                case "sample-on-an-open-order":
                    var order = AddOrder(db, seed.MybossLw, "ORD-SMPL-OPEN", OrderStatus.PaymentConfirmed, quantity: 1);
                    await db.SaveChangesAsync();
                    var sample = await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-MB02");
                    sample.OrderId = order.Id; sample.OrderItemId = order.Items.Single().Id; sample.Status = SmartTagStatus.Preparing;
                    break;
            }
            await db.SaveChangesAsync();
        }
        var before = await SnapshotAsync(scope);

        var failure = await Assert.ThrowsAsync<SqlException>(() => RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql",
            sql => Commit(WithSamples(sql, [.. samples], expectedCount))));

        Assert.Equal(error, failure.Number);
        Assert.Equal(before, await SnapshotAsync(scope));
        await using var check = scope.NewContext();
        Assert.False(await check.AuditLogs.AnyAsync(entry => entry.Action == ClassifyAction));
    }

    [RelationalFact]
    public async Task RollbackRevertsOnlyTheRowsThatRunSetAndNothingChangedSince()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await SeedProductionShapeAsync(scope);
        var original = await SnapshotAsync(scope);
        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", sql => Commit(WithSamples(sql, VerifiedSamples, expected: 4)));

        Guid runId;
        await using (var db = scope.NewContext())
        {
            runId = Guid.Parse(RunIdOf((await db.AuditLogs.FirstAsync(entry => entry.Action == ClassifyAction)).NewValue));
            // A later, legitimate change to one unit: the rollback must leave it alone.
            (await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-C20001")).StockPurpose = SmartTagStockPurpose.Test;
            await db.SaveChangesAsync();
        }

        // A dry run changes nothing.
        var classified = await SnapshotAsync(scope);
        await RunScriptAsync(scope, "04-rollback-smart-tag-stock-purpose.sql", sql => WithRunId(sql, runId));
        Assert.Equal(classified, await SnapshotAsync(scope));

        await RunScriptAsync(scope, "04-rollback-smart-tag-stock-purpose.sql", sql => Commit(WithRunId(sql, runId)));

        var after = await SnapshotAsync(scope);
        // (MPL-C20001 was edited through the application, which stamps UpdatedAt.)
        Assert.Equal(original.Where(row => row.TagCode != "MPL-C20001").Select(Protected),
            after.Where(row => row.TagCode != "MPL-C20001").Select(Protected));
        Assert.Equal(SmartTagStockPurpose.Test, after.Single(row => row.TagCode == "MPL-C20001").Purpose);
        Assert.All(after.Where(row => row.TagCode != "MPL-C20001"), row => Assert.Equal(SmartTagStockPurpose.Unclassified, row.Purpose));
        await using (var check = scope.NewContext())
            Assert.Equal(903, await check.AuditLogs.CountAsync(entry => entry.Action == RollbackAction));

        Assert.Equal(52104, (await Assert.ThrowsAsync<SqlException>(() => RunScriptAsync(scope,
            "04-rollback-smart-tag-stock-purpose.sql", sql => Commit(WithRunId(sql, runId))))).Number);
        Assert.Equal(52090, (await Assert.ThrowsAsync<SqlException>(() =>
            RunScriptAsync(scope, "03-verify-smart-tag-stock-purpose.sql"))).Number);
    }

    [RelationalFact]
    public async Task ThePreviewRunsBeforeTheMigrationAndTheOtherScriptsRefuseToStart()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await SeedProductionShapeAsync(scope);
        await using (var db = scope.NewContext())
        {
            // The database as it is before AddSmartTagStockPurpose.
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE dbo.SmartTags DROP CONSTRAINT CK_SmartTags_StockPurpose;
                DECLARE @default sysname = (
                    SELECT d.name FROM sys.default_constraints d
                    JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
                    WHERE d.parent_object_id = OBJECT_ID(N'dbo.SmartTags') AND c.name = N'StockPurpose');
                EXEC (N'ALTER TABLE dbo.SmartTags DROP CONSTRAINT [' + @default + N']');
                ALTER TABLE dbo.SmartTags DROP COLUMN StockPurpose;
                """);
        }

        await RunScriptAsync(scope, "01-preview-smart-tag-stock-purpose.sql", sql => WithSamples(sql, VerifiedSamples));
        // Apply cannot even compile without the column, so it changes nothing.
        Assert.Equal(207, (await Assert.ThrowsAsync<SqlException>(() => RunScriptAsync(scope,
            "02-apply-smart-tag-stock-purpose.sql", sql => Commit(WithSamples(sql, VerifiedSamples, expected: 4))))).Number);
        Assert.Equal(52090, (await Assert.ThrowsAsync<SqlException>(() =>
            RunScriptAsync(scope, "03-verify-smart-tag-stock-purpose.sql"))).Number);
        await using var check = scope.NewContext();
        Assert.False(await check.AuditLogs.AnyAsync(entry => entry.Action == ClassifyAction));
    }

    // --- Helpers -----------------------------------------------------------------------

    private sealed record ProductionShape(Guid MybossLw, Guid PawsomeLw, Guid PawsomeSd, HashSet<Guid> CommercialTagIds);

    private sealed record TagRow(
        Guid Id, string TagCode, SmartTagStockPurpose Purpose, PhysicalQaStatus? Qa, SmartTagStatus Status,
        TagFulfilmentStatus Fulfilment, Guid? Owner, Guid? Pet, Guid? Order, Guid? Batch, Guid? Variant,
        DateTimeOffset? Archived, DateTimeOffset? Deleted, DateTimeOffset? Activated, DateTimeOffset Updated,
        int QaVersion, int AssignmentVersion, string RowVersion);

    // Everything except the classification itself and the row version it bumps.
    private static TagRow Protected(TagRow row) => row with { Purpose = default, RowVersion = "" };

    private static async Task<List<TagRow>> SnapshotAsync(RelationalScope scope)
    {
        await using var db = scope.NewContext();
        var rows = await db.SmartTags.AsNoTracking().OrderBy(t => t.TagCode).ToListAsync();
        return rows.Select(t => new TagRow(t.Id, t.TagCode, t.StockPurpose, t.QaStatus, t.Status, t.FulfilmentStatus,
            t.OwnerUserId, t.PetId, t.OrderId, t.BatchId, t.ProductVariantId, t.ArchivedAt, t.DeletedAt, t.ActivatedAt,
            t.UpdatedAt, t.QaVersion, t.AssignmentVersion, Convert.ToBase64String(t.RowVersion))).ToList();
    }

    // Three confirmed 300-unit batches; manufacturer samples under two of the
    // same SKUs (one batched and with a tester, one Passed on the shelf); and
    // unrelated legacy inventory.
    private static async Task<ProductionShape> SeedProductionShapeAsync(RelationalScope scope)
    {
        await using var db = scope.NewContext();
        await SeedPeopleAsync(db);
        async Task<Guid> Variant(string key, string sku)
        {
            var id = await SeedVariantAsync(db, key);
            (await db.TagProductVariants.SingleAsync(v => v.Id == id)).Sku = sku;
            await db.SaveChangesAsync();
            return id;
        }
        var mybossLw = await Variant("MBLW", "MYBOSS-LW-QR-NFC");
        var pawsomeLw = await Variant("PWLW", "PAWSOME-LW-QR-NFC");
        var pawsomeSd = await Variant("PWSD", "PAWSOME-SD-QR-NFC");
        var legacy = await Variant("LGCY", "LEGACY-QR-ONLY");

        var commercial = new HashSet<Guid>();
        var batches = new[]
        {
            ("MPL-BAT-260911002807-9263", mybossLw, 1),
            ("MPL-BAT-260911002857-1515", pawsomeLw, 2),
            ("MPL-BAT-260911002959-6486", pawsomeSd, 3),
        };
        foreach (var (batchNo, variantId, index) in batches)
        {
            var batch = new SmartTagBatch { BatchNo = batchNo, Quantity = 300, HasNfc = true, Variant = "Lightweight", ProductVariantId = variantId };
            db.SmartTagBatches.Add(batch);
            // Every commercial unit was physically received (as in Production).
            var received = ReceivedStockFixture.Receipt(db, variantId);
            for (var n = 1; n <= 300; n++)
            {
                var qa = index switch
                {
                    1 when n <= 5 => PhysicalQaStatus.Passed,
                    1 when n <= 8 => PhysicalQaStatus.Pending,
                    2 when n <= 2 => PhysicalQaStatus.Failed,
                    _ => (PhysicalQaStatus?)null,
                };
                var tag = new SmartTag
                {
                    TagCode = $"MPL-C{index}{n:0000}", Batch = batch, ProductVariantId = variantId, HasNfc = true, Variant = "Lightweight",
                    Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Printed,
                    QaStatus = qa, QaShipmentReference = qa is null ? null : batchNo, QaVersion = qa is null ? 0 : 1,
                    InventoryReceipt = received,
                };
                // One commercial unit already sold and active with its owner.
                if (index == 2 && n == 10)
                {
                    tag.Status = SmartTagStatus.Active; tag.OwnerUserId = OtherOwnerId; tag.PetId = OtherPetId;
                    tag.FulfilmentStatus = TagFulfilmentStatus.SentToOwner; tag.ActivatedAt = DateTimeOffset.UtcNow.AddDays(-3);
                }
                db.SmartTags.Add(tag);
                commercial.Add(tag.Id == Guid.Empty ? (tag.Id = Guid.NewGuid()) : tag.Id);
            }
        }

        var sampleBatch = new SmartTagBatch { BatchNo = "MPL-BAT-250101000000-0001", Quantity = 2, HasNfc = true, Variant = "Lightweight", ProductVariantId = mybossLw };
        db.SmartTagBatches.Add(sampleBatch);
        // One sample batch also has a stock receipt; a receipt never makes a
        // sample orderable.
        var sampleReceipt = ReceivedStockFixture.Receipt(db, mybossLw);
        db.SmartTags.AddRange(
            new SmartTag
            {
                TagCode = "MPL-SMPL-MB01", Batch = sampleBatch, ProductVariantId = mybossLw, HasNfc = true, Variant = "Lightweight",
                Status = SmartTagStatus.Active, FulfilmentStatus = TagFulfilmentStatus.SentToOwner, OwnerUserId = OwnerId, PetId = PetId,
                ActivatedAt = DateTimeOffset.UtcNow.AddMonths(-2),
            },
            new SmartTag
            {
                TagCode = "MPL-SMPL-MB02", Batch = sampleBatch, ProductVariantId = mybossLw, HasNfc = true, Variant = "Lightweight",
                Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Printed,
                QaStatus = PhysicalQaStatus.Pending, QaShipmentReference = "SAMPLES-MB", QaVersion = 1, InventoryReceipt = sampleReceipt,
            },
            new SmartTag
            {
                TagCode = "MPL-SMPL-PW01", ProductVariantId = pawsomeLw, HasNfc = true, Variant = "Lightweight",
                Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Printed,
                QaStatus = PhysicalQaStatus.Passed, QaShipmentReference = "SAMPLES", QaVersion = 1,
            },
            new SmartTag
            {
                TagCode = "MPL-SMPL-PW02", ProductVariantId = pawsomeLw, HasNfc = true, Variant = "Lightweight",
                Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Generated,
            },
            new SmartTag
            {
                TagCode = "MPL-LGCY-0001", ProductVariantId = legacy, HasNfc = false, Variant = "Standard",
                Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Printed,
            });
        await db.SaveChangesAsync();
        return new ProductionShape(mybossLw, pawsomeLw, pawsomeSd, commercial);
    }

    private static string ScriptPath(string file)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "migration.sql")))
            directory = directory.Parent;
        Assert.NotNull(directory);
        return Path.Combine(directory!.FullName, "docs", "deployment", "sql", "smart-tag-stock-purpose", file);
    }

    private static async Task RunScriptAsync(RelationalScope scope, string file, Func<string, string>? configure = null)
    {
        var sql = await File.ReadAllTextAsync(ScriptPath(file));
        if (configure is not null) sql = configure(sql);
        await using var db = scope.NewContext();
        await using var connection = new SqlConnection(db.Database.GetConnectionString());
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.CommandTimeout = 300;
        await command.ExecuteNonQueryAsync();
    }

    // Fills in only the documented parameters, and fails if the script no
    // longer carries them exactly as the runbook describes.
    private static string Replace(string sql, string marker, string replacement)
    {
        Assert.Contains(marker, sql);
        var at = sql.IndexOf(marker, StringComparison.Ordinal);
        return string.Concat(sql.AsSpan(0, at), replacement, sql.AsSpan(at + marker.Length));
    }

    private static string Commit(string sql) => Replace(sql, "DECLARE @Commit bit = 0;", "DECLARE @Commit bit = 1;");

    private static string WithRunId(string sql, Guid runId) =>
        Replace(sql, "DECLARE @RunId uniqueidentifier = NULL;", $"DECLARE @RunId uniqueidentifier = '{runId}';");

    private static string WithSamples(string sql, (string Code, string Sku)[] samples, int? expected = null)
    {
        var values = string.Join(", ", samples.Select(s => $"(N'{s.Code}', N'{s.Sku}')"));
        sql = Replace(sql, "-- INSERT INTO @TestTags (TagCode, Sku) VALUES", $"INSERT INTO @TestTags (TagCode, Sku) VALUES {values};");
        return expected is { } count
            ? Replace(sql, "DECLARE @ExpectedTestCount int = 0;", $"DECLARE @ExpectedTestCount int = {count};")
            : sql;
    }

    private static string RunIdOf(string? auditValue) =>
        JsonDocument.Parse(auditValue!).RootElement.GetProperty("runId").GetString()!;
}
