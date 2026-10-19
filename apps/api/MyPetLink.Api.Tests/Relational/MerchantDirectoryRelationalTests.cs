using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Migrations;

namespace MyPetLink.Api.Tests.Relational;

public sealed class MerchantDirectoryRelationalTests
{
    [RelationalFact]
    public async Task BranchScopeChangesInvalidateAnOlderMerchantPermissionConfirmation()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var merchant = MerchantDirectoryTests.Merchant(); db.Add(merchant); await db.SaveChangesAsync();
        var service = MerchantDirectoryTests.Service(db);
        var before = await service.UpsertBranchAsync(null, merchant.Id, null, MerchantDirectoryTests.Branch("Prepared"), default);
        var branch = before.Branches.Single();
        await using var second = scope.NewContext();
        await MerchantDirectoryTests.Service(second).UpsertBranchAsync(null, merchant.Id, branch.Id,
            MerchantDirectoryTests.Branch("Prepared", true) with { Permission = null, ConcurrencyToken = branch.ConcurrencyToken }, default);
        var currentBranch = (await MerchantDirectoryTests.Service(second).GetListingAsync(merchant.Id, default)).Branches.Single();
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, merchant.Id, branch.Id,
            MerchantDirectoryTests.Branch("Old parent review") with { ConcurrencyToken = currentBranch.ConcurrencyToken, MerchantConcurrencyToken = before.ConcurrencyToken }, default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => service.UpdateListingAsync(null, merchant.Id,
            new(true, null, before.ConcurrencyToken, MerchantDirectoryTests.Permission()), default))).StatusCode);
        await using var check = scope.NewContext();
        Assert.False((await check.Merchants.SingleAsync()).ShowOnWebsite);
        Assert.Empty(await check.AuditLogs.Where(a => a.Action == "merchant.listing.update").ToArrayAsync());
    }
    [RelationalFact]
    public async Task RootMigrationScriptAppliesAndReplaysWithoutChangingMerchantPublicationOrAudit()
    {
        await using var scope = await RelationalDatabase.CreateAsync(createSchema: false);
        await using var db = scope.NewContext();
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "migration.sql"))) directory = directory.Parent;
        Assert.NotNull(directory);
        var script = await File.ReadAllTextAsync(Path.Combine(directory!.FullName, "migration.sql"));
        await db.Database.OpenConnectionAsync();
        async Task Replay()
        {
            foreach (var batch in System.Text.RegularExpressions.Regex.Split(script, @"(?im)^\s*GO\s*$"))
                if (!string.IsNullOrWhiteSpace(batch)) await db.Database.ExecuteSqlRawAsync(batch);
        }
        await Replay();
        var merchant = MerchantDirectoryTests.Merchant(); db.Add(merchant); await db.SaveChangesAsync();
        Assert.False(merchant.ShowOnWebsite);
        var service = MerchantDirectoryTests.Service(db);
        var listing = await service.UpsertBranchAsync(null, merchant.Id, null, MerchantDirectoryTests.Branch("Agreed branch", true), default);
        await service.UpdateListingAsync(null, merchant.Id, new(true, "Public description", listing.ConcurrencyToken,
            MerchantDirectoryTests.Permission(listing.Branches.Select(b => b.Id).ToArray())), default);
        var count = await db.AuditLogs.CountAsync();
        await Replay();
        db.ChangeTracker.Clear();
        Assert.True((await db.Merchants.SingleAsync()).ShowOnWebsite);
        Assert.Single(await db.MerchantBranches.ToArrayAsync());
        Assert.Equal(count, await db.AuditLogs.CountAsync());
        Assert.Single((await service.ListPublicAsync(1, 20, null, null, default)).Items);
    }
    [RelationalFact]
    public async Task SqlProjectionFiltersBranchesAndNativeRowversionRejectsStaleListingAndBranchEdits()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var merchant = MerchantDirectoryTests.Merchant();
        db.Merchants.Add(merchant); await db.SaveChangesAsync();
        var service = MerchantDirectoryTests.Service(db);
        var initial = await service.GetListingAsync(merchant.Id, default);
        var published = await service.UpdateListingAsync(null, merchant.Id, new(true, "Pet store", initial.ConcurrencyToken, MerchantDirectoryTests.Permission()), default);
        var listing = await service.UpsertBranchAsync(null, merchant.Id, null, MerchantDirectoryTests.Branch("Main", true), default);
        listing = await service.UpsertBranchAsync(null, merchant.Id, null, MerchantDirectoryTests.Branch("Hidden"), default);
        Assert.Equal(2, listing.Branches.Count);
        var publicStores = await service.ListPublicAsync(1, 20, "Kuala Lumpur", null, default);
        Assert.Equal("Main", Assert.Single(Assert.Single(publicStores.Items).Branches).Name);
        Assert.Empty((await service.ListPublicAsync(1, 20, "Hidden", null, default)).Items);

        await using var second = scope.NewContext();
        var secondService = MerchantDirectoryTests.Service(second);
        var branch = listing.Branches.Single(b => b.Name == "Main");
        await secondService.UpsertBranchAsync(null, merchant.Id, branch.Id, MerchantDirectoryTests.Branch("Changed", true)
            with { ConcurrencyToken = branch.ConcurrencyToken }, default);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, merchant.Id, branch.Id,
            MerchantDirectoryTests.Branch("Stale", true) with { ConcurrencyToken = branch.ConcurrencyToken }, default))).StatusCode);

        // Use a fresh request context after the deliberately failed save.
        await using var third = scope.NewContext();
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => MerchantDirectoryTests.Service(third).UpdateListingAsync(null, merchant.Id,
            new(false, null, published.ConcurrencyToken), default))).StatusCode);
    }

    [RelationalFact]
    public async Task AdditiveMigrationKeepsExistingMerchantHiddenAndPreservesItsCommercialRecord()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var merchant = MerchantDirectoryTests.Merchant();
        db.Add(merchant); await db.SaveChangesAsync();

        // Only this uniquely named, disposable test database is altered. Remove
        // the new schema to represent a merchant written before this migration.
        Assert.StartsWith("MyPetLinkTest_",db.Database.GetDbConnection().Database);
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE [ConsignmentDispatches] DROP CONSTRAINT [FK_ConsignmentDispatches_MerchantBranches_MerchantBranchId];
            ALTER TABLE [ConsignmentStockLedgerEntries] DROP CONSTRAINT [FK_ConsignmentStockLedgerEntries_MerchantBranches_MerchantBranchId];
            ALTER TABLE [ConsignmentSalesReports] DROP CONSTRAINT [FK_ConsignmentSalesReports_MerchantBranches_MerchantBranchId];
            ALTER TABLE [ConsignmentStocktakes] DROP CONSTRAINT [FK_ConsignmentStocktakes_MerchantBranches_MerchantBranchId];
            ALTER TABLE [ConsignmentStockDiscrepancies] DROP CONSTRAINT [FK_ConsignmentStockDiscrepancies_MerchantBranches_MerchantBranchId];
            DROP TABLE [MerchantBranches];
            DROP INDEX [IX_Merchants_DirectoryPublicCode] ON [Merchants];
            DROP INDEX [IX_Merchants_ShowOnWebsite_IsActive] ON [Merchants];
            DECLARE @constraint sysname;
            SELECT @constraint = dc.name FROM sys.default_constraints dc
              JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
              WHERE dc.parent_object_id = OBJECT_ID(N'Merchants') AND c.name = N'ShowOnWebsite';
            DECLARE @sql nvarchar(max) = N'ALTER TABLE [Merchants] DROP CONSTRAINT ' + QUOTENAME(@constraint);
            IF @constraint IS NOT NULL EXEC(@sql);
            ALTER TABLE [Merchants] DROP COLUMN [ShowOnWebsite], [DirectoryPublicCode], [BusinessDescription];
            """);
        var sql = db.GetService<IMigrationsSqlGenerator>().Generate(new AddMerchantPartnerDirectory().UpOperations);
        foreach (var command in sql) await db.Database.ExecuteSqlRawAsync(command.CommandText);
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE [ConsignmentDispatches] ADD CONSTRAINT [FK_ConsignmentDispatches_MerchantBranches_MerchantBranchId]
                FOREIGN KEY ([MerchantBranchId]) REFERENCES [MerchantBranches] ([Id]);
            ALTER TABLE [ConsignmentStockLedgerEntries] ADD CONSTRAINT [FK_ConsignmentStockLedgerEntries_MerchantBranches_MerchantBranchId]
                FOREIGN KEY ([MerchantBranchId]) REFERENCES [MerchantBranches] ([Id]);
            ALTER TABLE [ConsignmentSalesReports] ADD CONSTRAINT [FK_ConsignmentSalesReports_MerchantBranches_MerchantBranchId]
                FOREIGN KEY ([MerchantBranchId]) REFERENCES [MerchantBranches] ([Id]);
            ALTER TABLE [ConsignmentStocktakes] ADD CONSTRAINT [FK_ConsignmentStocktakes_MerchantBranches_MerchantBranchId]
                FOREIGN KEY ([MerchantBranchId]) REFERENCES [MerchantBranches] ([Id]);
            ALTER TABLE [ConsignmentStockDiscrepancies] ADD CONSTRAINT [FK_ConsignmentStockDiscrepancies_MerchantBranches_MerchantBranchId]
                FOREIGN KEY ([MerchantBranchId]) REFERENCES [MerchantBranches] ([Id]);
            """);
        db.ChangeTracker.Clear();
        var preserved = await db.Merchants.SingleAsync(m => m.Id == merchant.Id);
        Assert.False(preserved.ShowOnWebsite); Assert.Null(preserved.DirectoryPublicCode);
        Assert.True(preserved.IsActive); Assert.Equal("PRIVATE NOTES", preserved.InternalNotes);
        Assert.Equal(merchant.MerchantCode, preserved.MerchantCode);
        Assert.Equal(merchant.ContactEmail, preserved.ContactEmail);
        Assert.Empty(await db.MerchantBranches.ToListAsync());
        Assert.Empty((await MerchantDirectoryTests.Service(db).ListPublicAsync(1, 20, null, null, default)).Items);
    }
}
