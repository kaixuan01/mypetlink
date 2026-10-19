using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Phase 1A on a schema built by the real migration chain, so the migration-authored SQL
// triggers, filtered indexes and rollback guards are what is exercised — not EnsureCreated.
public sealed partial class ConsignmentRelationalTests
{
    private const string SoloPolicyMigration = "20261018035952_AddConsignmentSoloOperatorPolicy";
    private const string SalesLedgerMigration = "20261018125029_AddConsignmentSalesReportingLedger";

    private static async Task<SqlException> SqlFailure(Func<Task> action)
    {
        var e = await Assert.ThrowsAnyAsync<Exception>(action);
        for (Exception? inner = e; inner is not null; inner = inner.InnerException)
            if (inner is SqlException sql) return sql;
        throw new Xunit.Sdk.XunitException($"Expected a SQL Server error, got {e}");
    }

    [Fact]
    public async Task MigratedSchemaRunsTheRemediatedLedgerFlowsWithTriggersInstalled()
    {
        MigratedSchema.Value = true;
        try
        {
            await F1CorrectedHandoverKeepsOneLedgerIdentityThroughTrackingStartAndReversal("AggregateSale");
            await F1CorrectedHandoverKeepsOneLedgerIdentityThroughTrackingStartAndReversal("NonSaleWithdrawal");
            await F2CorrectionCannotLeaveMoreVerifiedRefundsThanSales();
            await F2RemovedLinesPriceChangesAndCorrectionsOfCorrectionsKeepRefundsCovered();
            await F5SamePeriodSalesAndSealedReturnVerifyWhenTheFinalPositionIsValid();
            await F5CorrectionAfterIdentifiedHandoversSucceedsWhenTheNetIsValid();
            await F5AnInvalidFinalPositionRollsBackEverything();
            await F8ChangedRetryNeverReturnsTheOldQuantitiesSilently();
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task MigratedLedgerRefusesRawEditsDuplicateSourcesAndSecondReversals()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext();
            Assert.Contains(SalesLedgerMigration, await db.Database.GetAppliedMigrationsAsync());
            await ReceivedAtPartner(db, 4);
            var entry = await db.ConsignmentStockLedgerEntries.AsNoTracking().FirstAsync();
            // The append-only trigger refuses raw SQL, not just EF.
            Assert.Equal(51043, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE ConsignmentStockLedgerEntries SET Quantity = 2 WHERE Id = {entry.Id}"))).Number);
            Assert.Equal(51043, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM ConsignmentStockLedgerEntries WHERE Id = {entry.Id}"))).Number);
            // A second posting for the same source is refused by the unique source key.
            Assert.Equal(2601, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT ConsignmentStockLedgerEntries(Id,MerchantId,MerchantBranchId,ProductVariantId,SkuSnapshot,FromBucket,ToBucket,Quantity,
                  EntryType,SourceType,SourceLineId,EffectiveAt,PostedAt,IsPriorPeriodCorrection,ActorAdminUserId)
                VALUES({Guid.NewGuid()},{entry.MerchantId},{entry.MerchantBranchId},{entry.ProductVariantId},{entry.SkuSnapshot},'External','Sellable',1,
                  {entry.EntryType},{entry.SourceType},{entry.SourceLineId},{Now},{Now},0,{AdminRecordId})
                """))).Number);
            // One reversal per entry.
            FormattableString Reversal() => $"""
                INSERT ConsignmentStockLedgerEntries(Id,MerchantId,MerchantBranchId,ProductVariantId,SkuSnapshot,FromBucket,ToBucket,Quantity,
                  EntryType,SourceType,SourceLineId,ReversesEntryId,EffectiveAt,PostedAt,IsPriorPeriodCorrection,ActorAdminUserId)
                VALUES({Guid.NewGuid()},{entry.MerchantId},{entry.MerchantBranchId},{entry.ProductVariantId},{entry.SkuSnapshot},'Sellable','External',1,
                  'Reversal',{entry.SourceType},{entry.SourceLineId},{entry.Id},{Now},{Now},0,{AdminRecordId})
                """;
            await db.Database.ExecuteSqlInterpolatedAsync(Reversal());
            Assert.Equal(2601, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(Reversal()))).Number);
            Assert.Equal(5, await db.ConsignmentStockLedgerEntries.CountAsync());
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task MigratedReportsAndPricesUseNativeRowversionConcurrency()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext();
            var (a, _) = await ReceivedAtPartner(db, 4); var price = await ApprovedPrice(db, a.Id);
            var draft = await Later(db).CreateSalesReportAsync(AdminAccountId, Report(a.Id, [Sale(price.Id, 1)]), default);
            var first = await Later(db).UpdateSalesReportAsync(AdminAccountId, draft.Id, draft.ConcurrencyToken, Report(a.Id, [Sale(price.Id, 2)]), default);
            Assert.NotEqual(draft.ConcurrencyToken, first.ConcurrencyToken);
            // A writer holding the earlier token loses, and nothing it sent is saved.
            var stale = await Assert.ThrowsAsync<ApiException>(() => Later(db).UpdateSalesReportAsync(AdminAccountId, draft.Id, draft.ConcurrencyToken,
                Report(a.Id, [Sale(price.Id, 3)]), default));
            Assert.Equal(409, stale.StatusCode);
            Assert.Equal(2, (await Later(db).GetSalesReportAsync(draft.Id, default)).UnitsSold);
            // Two contexts racing on the same row: SQL Server's rowversion decides.
            await using var other = scope.NewContext();
            var mine = await db.ConsignmentSalesReports.SingleAsync(r => r.Id == draft.Id);
            var theirs = await other.ConsignmentSalesReports.SingleAsync(r => r.Id == draft.Id);
            mine.Notes = "First"; await db.SaveChangesAsync();
            theirs.Notes = "Second";
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => other.SaveChangesAsync());
            Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => Later(db).ApprovePriceTermAsync(OwnerAccountId, price.Id,
                new("AAAAAAAAAAA="), default))).StatusCode);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task MigrationUpgradesCustodyDataAndAcceptsLongReceivingReferences()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server migration verification must not skip.");
        await using var scope = await RelationalDatabase.CreateAsync(createSchema: false); await using var db = scope.NewContext();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261017103941_HardenConsignmentOperationalControls");
        await SeedAsync(db, qrStock: 0, nfcStock: 2);
        var agreement = await LegacyAgreement(db);
        var dispatch = await LegacyDispatch(db, agreement, "SYN-UPGRADE", "SYN-UPGRADE-FINGERPRINT", "Dispatched");
        var tags = await db.SmartTags.OrderBy(t => t.Id).Select(t => new { t.Id, t.TagCode }).ToArrayAsync();
        foreach (var tag in tags)
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT ConsignmentUnits(Id,DispatchId,SmartTagId,ProductVariantId,TagCodeSnapshot,SkuSnapshot,ProductNameSnapshot,VariantSnapshot,Status,CreatedAt,UpdatedAt)
                VALUES({Guid.NewGuid()},{dispatch},{tag.Id},{NfcVariantId},{tag.TagCode},'SYN-SKU','Synthetic tag','Standard','Dispatched',{Now},{Now});
                """);
        await migrator.MigrateAsync(SoloPolicyMigration);
        // At the Solo head the review-event key carried the full reference: 2,000+ bytes is past SQL Server's limit.
        var longReference = new string('R', 1000);
        FormattableString LongReview() => $"""
            INSERT ConsignmentReviewEvents(Id,AgreementId,DispatchId,Action,ReviewMode,PolicyMode,RequestReference,PolicyVersion,
              ActorAdminUserId,RecordedAt,Reason,ExternalEvidenceReference)
            VALUES({Guid.NewGuid()},{agreement},{dispatch},'receive','Independent (Team)','Team',{longReference},'',{AdminRecordId},{Now},'Synthetic','Synthetic')
            """;
        Assert.Equal(1946, (await SqlFailure(() => db.Database.ExecuteSqlInterpolatedAsync(LongReview()))).Number);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        await db.Database.ExecuteSqlInterpolatedAsync(LongReview());
        Assert.Equal(longReference, (await db.ConsignmentReviewEvents.SingleAsync()).RequestReference);
        // Existing custody data is kept as it was: nothing is posted to SKU stock or invented.
        Assert.Equal(2, await db.ConsignmentUnits.CountAsync(u => u.DispatchId == dispatch));
        Assert.Empty(db.ConsignmentStockLedgerEntries); Assert.Empty(db.ConsignmentRecordContributors);
        Assert.Empty(db.ConsignmentSalesReports); Assert.Empty(db.ConsignmentPriceTerms);
        // The Phase 1A rebuild of the review-event index carries the reference instead of keying it.
        var keyColumns = await db.Database.SqlQueryRaw<string>("""
            SELECT c.name AS Value FROM sys.indexes i
            JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE i.name = 'IX_ConsignmentReviewEvents_DispatchId_Action' AND ic.is_included_column = 0
            """).ToListAsync();
        Assert.Equal(["Action", "DispatchId"], keyColumns.Order().ToArray());
    }

    [Fact]
    public async Task RemediationRollbackIsBlockedWithHistoryAndCleanWhenEmpty()
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server migration verification must not skip.");
        await using (var empty = await RelationalDatabase.CreateAsync(createSchema: false))
        {
            await using var db = empty.NewContext(); var migrator = db.GetService<IMigrator>();
            await db.Database.MigrateAsync();
            await migrator.MigrateAsync(SalesLedgerMigration);
            Assert.DoesNotContain(await db.Database.GetAppliedMigrationsAsync(), m => m.EndsWith("_HardenConsignmentSalesReporting"));
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        }
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(4); await using var db = scope.NewContext();
            var (a, _) = await ReceivedAtPartner(db, 4); var price = await ApprovedPrice(db, a.Id);
            await Recorded(db, Report(a.Id, [Sale(price.Id, 1)]));
            Assert.NotEmpty(db.ConsignmentRecordContributors);
            var migrator = db.GetService<IMigrator>();
            var blocked = await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync(SalesLedgerMigration));
            // The newest guard refuses first; the remediation guard (51045) stands behind it.
            Assert.Contains("51047", blocked.ToString()); Assert.Contains("rollback blocked", blocked.ToString(), StringComparison.OrdinalIgnoreCase);
            Assert.Contains("rollback blocked", (await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync("20261018164233_HardenConsignmentSalesReporting"))).ToString(),
                StringComparison.OrdinalIgnoreCase);
            var further = await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync(SoloPolicyMigration));
            Assert.Contains("rollback blocked", further.ToString(), StringComparison.OrdinalIgnoreCase);
            db.ChangeTracker.Clear();
            // A downgrade isn't atomic across migrations: the stocktake migration, holding no stocktakes,
            // rolled back cleanly before 51047 refused. No history was lost, and reapplying restores the head.
            Assert.Equal(["20261019025050_AddConsignmentStocktakeAndCarryForward", "20261019060824_HardenConsignmentStocktakeReconciliation"], await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(1, await db.ConsignmentSalesReports.CountAsync());
            Assert.Equal(4, await db.ConsignmentStockLedgerEntries.CountAsync());
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.Equal(1, await db.ConsignmentSalesReports.CountAsync());
        }
        finally { MigratedSchema.Value = false; }
    }
}
