using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The read-only order-first scripts in docs/deployment/sql/smart-tag-order-first,
/// run verbatim against the Production-shaped database used for the stock
/// purpose scripts, after the commercial batches were classified (Production
/// today: 900 Sale units, the four older samples still Unclassified).
/// </summary>
public sealed partial class SellableInventoryRelationalTests
{
    private const string SampleBatchA = "MPL-BAT-250101000000-0001";
    private const string SampleBatchB = "MPL-BAT-250101000000-0002";

    [RelationalFact]
    public async Task TheOrderFirstStockPreviewMatchesTheApiAndChangesNothing()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedProductionShapeAsync(scope);
        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", Commit);
        var before = await SnapshotAsync(scope);

        var sets = await ReadOrderFirstScriptAsync(scope, "01-preview-order-first-stock.sql");

        Assert.Equal(before, await SnapshotAsync(scope));
        var perSku = sets[0].ToDictionary(row => (string)row["Sku"]!);
        await using var db = scope.NewContext();
        var stock = new TagOrderInventoryAvailabilityService(db);
        foreach (var (sku, variantId) in new[] { ("MYBOSS-LW-QR-NFC", seed.MybossLw), ("PAWSOME-LW-QR-NFC", seed.PawsomeLw), ("PAWSOME-SD-QR-NFC", seed.PawsomeSd) })
        {
            Assert.Equal(await stock.GetAvailableUnitsAsync(variantId), perSku[sku]["AvailableToOrder"]);
            Assert.Equal(await db.SmartTags.CountAsync(MerchantInventoryEligibility.For(db, variantId)), perSku[sku]["FulfillableUnits"]);
        }
        // 5 Passed + 3 Pending can be ordered; only the 5 Passed can be fulfilled,
        // which is all the previous rule offered.
        Assert.Equal(8, perSku["MYBOSS-LW-QR-NFC"]["OrderableUnits"]);
        Assert.Equal(5, perSku["MYBOSS-LW-QR-NFC"]["AvailableUnderPreviousRule"]);
        Assert.Equal(300, perSku["PAWSOME-SD-QR-NFC"]["SaleNotEnrolled"]);
        Assert.Empty(sets[1]); // no paid order is waiting for an inspected tag
    }

    [RelationalFact]
    public async Task TheSamplePreviewProposesExactlyTheFourSamplesAndItsLinesClassifyOnlyThem()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await SeedProductionShapeAsync(scope);
        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", Commit);
        await using (var db = scope.NewContext())
        {
            // The Pawsome samples share a second batch: one has its own receipt,
            // the other was recorded on the commercial receipt.
            var batch = new SmartTagBatch { BatchNo = SampleBatchB, Quantity = 2, HasNfc = true, Variant = "Lightweight", ProductVariantId = (await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW01")).ProductVariantId };
            db.SmartTagBatches.Add(batch);
            var pw01 = await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW01");
            var pw02 = await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW02");
            pw01.Batch = batch; pw02.Batch = batch;
            pw01.InventoryReceipt = ReceivedStockFixture.Receipt(db, pw01.ProductVariantId!.Value);
            pw02.InventoryReceiptId = (await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-C20001")).InventoryReceiptId;
            await db.SaveChangesAsync();
        }
        var before = await SnapshotAsync(scope);
        var receiptsBefore = await ReceiptSnapshotAsync(scope);

        var sets = await ReadOrderFirstScriptAsync(scope, "02-preview-sample-classification.sql", WithSampleBatches);

        Assert.Equal(before, await SnapshotAsync(scope));
        Assert.All(sets[0], row => Assert.Equal("OK", row["Readiness"]));
        Assert.Equal(new[] { 1, 2 }, sets[0].Select(row => (int)row["ReceiptLinked"]!));
        Assert.Equal(
            ["MPL-SMPL-MB01", "MPL-SMPL-MB02", "MPL-SMPL-PW01", "MPL-SMPL-PW02"],
            sets[1].Select(row => (string)row["TagCode"]!));
        Assert.All(sets[1], row => Assert.Equal("Test", row["ProposedPurpose"]));
        var meaning = sets[2].ToDictionary(row => (int)row["SampleTagsOwned"]! == 1 && (int)row["TagsOwned"]! == 1
            ? (string)row["ReceiptSku"]! : "shared", row => (string)row["AccountingMeaning"]!);
        Assert.Equal(3, sets[2].Count);
        Assert.Equal("Also owns commercial stock: leave unchanged", meaning["shared"]);
        Assert.StartsWith("Owns only samples", meaning["MYBOSS-LW-QR-NFC"]);
        Assert.StartsWith("Owns only samples", meaning["PAWSOME-LW-QR-NFC"]);

        // The proposed lines are exactly what the apply script takes.
        var lines = string.Join(Environment.NewLine, sets[3].Select(row => (string)row["TestTagsLine"]!)).TrimEnd(',');
        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", sql => Commit(
            Replace(Replace(sql, "-- INSERT INTO @TestTags (TagCode, Sku) VALUES", $"INSERT INTO @TestTags (TagCode, Sku) VALUES{Environment.NewLine}{lines};"),
                "DECLARE @ExpectedTestCount int = 0;", "DECLARE @ExpectedTestCount int = 4;")));

        var after = await SnapshotAsync(scope);
        Assert.Equal(before.Select(Protected), after.Select(Protected));
        Assert.Equal(
            ["MPL-SMPL-MB01", "MPL-SMPL-MB02", "MPL-SMPL-PW01", "MPL-SMPL-PW02"],
            after.Where(row => row.Purpose == SmartTagStockPurpose.Test).Select(row => row.TagCode));
        Assert.Equal(900, after.Count(row => row.Purpose == SmartTagStockPurpose.Sale));
        Assert.Equal(receiptsBefore, await ReceiptSnapshotAsync(scope));
    }

    [RelationalFact]
    public async Task TheReadinessCheckPassesOnTheConfirmedBaselineAndListsWhatReducesAvailability()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedProductionShapeAsync(scope);

        // Before classification nothing is commercial: not ready.
        Assert.Equal(52190, (await Assert.ThrowsAsync<SqlException>(() =>
            ReadOrderFirstScriptAsync(scope, "03-release-readiness.sql", ForThisDatabase))).Number);

        await RunScriptAsync(scope, "02-apply-smart-tag-stock-purpose.sql", Commit);
        await GroupPawsomeSamplesAsync(scope);
        await using (var db = scope.NewContext())
        {
            // Production's migration history ends at the stock purpose migration
            // (this test database is created from the model, without history).
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE dbo.__EFMigrationsHistory (MigrationId nvarchar(150) NOT NULL PRIMARY KEY, ProductVersion nvarchar(32) NOT NULL);
                INSERT INTO dbo.__EFMigrationsHistory VALUES ('20261008040433_AddCommunityModerationActions', '8.0.0'),
                    ('20261011034923_AddSmartTagStockPurpose', '8.0.0');
                """);
            AddOrder(db, seed.MybossLw, "MPL-ORD-READY-1", OrderStatus.PaymentConfirmed, 2);
            AddOrder(db, seed.MybossLw, "MPL-ORD-READY-2", OrderStatus.Cancelled, 5);
            await db.SaveChangesAsync();
        }
        var before = await SnapshotAsync(scope);

        var sets = await ReadOrderFirstScriptAsync(scope, "03-release-readiness.sql", ForThisDatabase);

        Assert.Equal(before, await SnapshotAsync(scope));
        Assert.All(sets[0], row => Assert.Contains((string)row["Result"]!, new[] { "PASS", "INFO" }));
        var perSku = sets[1].ToDictionary(row => (string)row["Sku"]!);
        await using (var db = scope.NewContext())
        {
            var stock = new TagOrderInventoryAvailabilityService(db);
            Assert.Equal(await stock.GetAvailableUnitsAsync(seed.MybossLw), perSku["MYBOSS-LW-QR-NFC"]["AvailableToOrderAfterRelease"]);
        }
        Assert.Equal(6, perSku["MYBOSS-LW-QR-NFC"]["AvailableToOrderAfterRelease"]); // 8 orderable - 2 reserved
        Assert.Equal(3, perSku["MYBOSS-LW-QR-NFC"]["AvailableToOrderToday"]); // 5 Passed - 2 reserved
        var open = Assert.Single(sets[2]);
        Assert.Equal("MPL-ORD-READY-1", open["OrderNumber"]);
        Assert.Equal(2, open["UnitsReserved"]);

        // A sample that is no longer Unclassified, or a migration this release
        // does not know, makes it not ready.
        await using (var db = scope.NewContext())
        {
            (await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW01")).StockPurpose = SmartTagStockPurpose.Sale;
            await db.SaveChangesAsync();
        }
        Assert.Equal(52190, (await Assert.ThrowsAsync<SqlException>(() =>
            ReadOrderFirstScriptAsync(scope, "03-release-readiness.sql", ForThisDatabase))).Number);
        await using (var db = scope.NewContext())
        {
            (await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW01")).StockPurpose = SmartTagStockPurpose.Unclassified;
            await db.SaveChangesAsync();
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO dbo.__EFMigrationsHistory (MigrationId, ProductVersion) VALUES ('29991231000000_FromTheFuture', '8.0.0')");
        }
        Assert.Equal(52190, (await Assert.ThrowsAsync<SqlException>(() =>
            ReadOrderFirstScriptAsync(scope, "03-release-readiness.sql", ForThisDatabase))).Number);
    }

    // The Production-shaped seed holds 5 Passed and 3 Pending commercial tags,
    // and its samples sit in two batches of its own.
    private static string ForThisDatabase(string sql) =>
        WithSampleBatches(sql)
            .Replace("DECLARE @ExpectedPassed int = 3;", "DECLARE @ExpectedPassed int = 5;", StringComparison.Ordinal)
            .Replace("DECLARE @ExpectedPending int = 897;", "DECLARE @ExpectedPending int = 3;", StringComparison.Ordinal);

    private static async Task GroupPawsomeSamplesAsync(RelationalScope scope)
    {
        await using var db = scope.NewContext();
        var pw01 = await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW01");
        var pw02 = await db.SmartTags.SingleAsync(t => t.TagCode == "MPL-SMPL-PW02");
        var batch = new SmartTagBatch { BatchNo = SampleBatchB, Quantity = 2, HasNfc = true, Variant = "Lightweight", ProductVariantId = pw01.ProductVariantId };
        db.SmartTagBatches.Add(batch);
        pw01.Batch = batch; pw02.Batch = batch;
        await db.SaveChangesAsync();
    }

    private static string WithSampleBatches(string sql) =>
        sql.Replace("BATCH-202607-9013", SampleBatchA, StringComparison.Ordinal)
            .Replace("BATCH-202607-8221", SampleBatchB, StringComparison.Ordinal);

    private static async Task<List<string>> ReceiptSnapshotAsync(RelationalScope scope)
    {
        await using var db = scope.NewContext();
        return (await db.InventoryReceipts.AsNoTracking().OrderBy(r => r.ReceiptNumber).ToListAsync())
            .Select(r => $"{r.ReceiptNumber}|{r.QuantityReceived}|{r.TotalLandedCostMyr}|{r.UnitLandedCostMyr}|{r.SupersededAt}|{Convert.ToBase64String(r.RowVersion)}")
            .ToList();
    }

    private static async Task<List<List<Dictionary<string, object?>>>> ReadOrderFirstScriptAsync(
        RelationalScope scope, string file, Func<string, string>? configure = null)
    {
        var path = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(ScriptPath(file)))!, "smart-tag-order-first", file);
        var sql = await File.ReadAllTextAsync(path);
        if (configure is not null) sql = configure(sql);
        await using var db = scope.NewContext();
        await using var connection = new SqlConnection(db.Database.GetConnectionString());
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.CommandTimeout = 300;
        await using var reader = await command.ExecuteReaderAsync();
        var sets = new List<List<Dictionary<string, object?>>>();
        do
        {
            var rows = new List<Dictionary<string, object?>>();
            while (await reader.ReadAsync())
            {
                var row = new Dictionary<string, object?>(StringComparer.Ordinal);
                for (var i = 0; i < reader.FieldCount; i++)
                    row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                rows.Add(row);
            }
            sets.Add(rows);
        } while (await reader.NextResultAsync());
        return sets;
    }
}
