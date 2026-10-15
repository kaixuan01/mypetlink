using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Migrations;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class MerchantDirectoryTests
{
    private static MyPetLinkDbContext Db() => new(new DbContextOptionsBuilder<MyPetLinkDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    internal static MerchantDirectoryService Service(MyPetLinkDbContext db) =>
        new(db, new AuditLogService(db, new HttpContextAccessor()), TimeProvider.System);
    internal static Merchant Merchant(bool visible = false, bool active = true) => new()
    {
        MerchantCode = "MPL-MER-00001", LegalBusinessName = "Pet Shop", IsActive = active,
        ShowOnWebsite = visible, DirectoryPublicCode = Guid.NewGuid().ToString("N"),
        ContactPerson = "PRIVATE PERSON", ContactEmail = "private@example.test",
        ContactPhone = "+60123456789", InternalNotes = "PRIVATE NOTES", RowVersion = [1],
        BillingAddressLine1 = "Private billing address", DeliveryAddressLine1 = "Private delivery address"
    };
    internal static UpsertMerchantBranchRequest Branch(string name = "Main", bool visible = false) => new(
        name, new("1 Pet Street", null, "50000", "Kuala Lumpur", "Kuala Lumpur", "Malaysia"),
        ShowOnWebsite: visible, Permission: Permission());

    internal static PublicationPermissionRequest Permission(params Guid[] branches) => new("Email", "PRIVATE PERMISSION: owner email 2026-10-13", branches);

    [Theory]
    [InlineData(false, false, true, true, false)]
    [InlineData(false, true, true, true, false)]
    [InlineData(true, false, true, true, false)]
    [InlineData(true, true, true, true, true)]
    [InlineData(true, true, false, true, false)]
    [InlineData(true, true, true, false, false)]
    public async Task PublicVisibilityRequiresAllFourConditions(bool merchantVisible, bool branchVisible,
        bool merchantActive, bool branchActive, bool expected)
    {
        await using var db = Db(); var merchant = Merchant(merchantVisible, merchantActive);
        db.Merchants.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch(visible: branchVisible) with { IsActive = branchActive }, default);
        var (items, total) = await service.ListPublicAsync(1, 20, null, null, default);
        Assert.Equal(expected ? 1 : 0, total);
        Assert.Equal(expected, items.Count > 0);
    }

    [Fact]
    public async Task NewMerchantAndBranchesAreHiddenByDefault()
    {
        await using var db = Db(); var merchant = Merchant(); db.Add(merchant); await db.SaveChangesAsync();
        var listing = await Service(db).UpsertBranchAsync(null, merchant.Id, null, Branch(), default);
        Assert.False(listing.ShowOnWebsite); Assert.False(listing.IsPublished);
        Assert.False(Assert.Single(listing.Branches).ShowOnWebsite);
    }

    [Fact]
    public void MigrationDefaultsExistingMerchantsToHiddenAndOnlyAddsSchema()
    {
        var operations = new AddMerchantPartnerDirectory().UpOperations;
        var column = Assert.Single(operations.OfType<AddColumnOperation>().Where(c => c.Name == "ShowOnWebsite"));
        Assert.Equal(false, column.DefaultValue); Assert.Equal("Merchants", column.Table);
        var table = Assert.Single(operations.OfType<CreateTableOperation>());
        Assert.Equal(false, Assert.Single(table.Columns.Where(c => c.Name == "ShowOnWebsite")).DefaultValue);
        Assert.DoesNotContain(operations, op => op is DropColumnOperation or DropTableOperation or DeleteDataOperation or UpdateDataOperation);
    }

    [Fact]
    public async Task MultipleBranchesAreSortedAndHiddenBranchesDoNotLeakThroughSearchOrProjection()
    {
        await using var db = Db(); var merchant = Merchant(true); db.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Later", true) with { DisplayOrder = 10 }, default);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("First", true) with { DisplayOrder = 1 }, default);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("SECRET BRANCH", false) with {
            Address = new("SECRET STREET", null, "99999", "SECRET CITY", "SECRET STATE", "Malaysia") }, default);
        var (items, _) = await service.ListPublicAsync(1, 20, null, null, default);
        var store = Assert.Single(items);
        Assert.Equal(new[] { "First", "Later" }, store.Branches.Select(b => b.Name));
        var json = JsonSerializer.Serialize(store);
        Assert.DoesNotContain("PRIVATE", json); Assert.DoesNotContain("SECRET", json);
        Assert.DoesNotContain(merchant.Id.ToString(), json); Assert.DoesNotContain("MPL-MER", json);
        Assert.Empty((await service.ListPublicAsync(1, 20, "SECRET CITY", null, default)).Items);
        Assert.Empty((await service.ListPublicAsync(1, 20, "private@example.test", null, default)).Items);
        Assert.Single((await service.ListPublicAsync(1, 20, "Kuala Lumpur", null, default)).Items);
    }

    [Fact]
    public async Task HidingMerchantPreservesCommercialStateAndBranchSelectionsAndAuditsBothSides()
    {
        await using var db = Db(); var merchant = Merchant(true); db.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch(visible: true), default);
        var before = merchant.CommissionPlan;
        var listing = await service.UpdateListingAsync(null, merchant.Id, new(false, "Store description", "AQ=="), default);
        Assert.False(listing.IsPublished); Assert.True(merchant.IsActive);
        Assert.True(Assert.Single(listing.Branches).ShowOnWebsite);
        Assert.Equal(before, merchant.CommissionPlan); Assert.Equal(MerchantPaymentTerm.Prepaid, merchant.PaymentTerm);
        Assert.Equal("PRIVATE NOTES", merchant.InternalNotes);
        Assert.Empty((await service.ListPublicAsync(1, 20, null, merchant.DirectoryPublicCode, default)).Items);
        var audit = await db.AuditLogs.SingleAsync(a => a.Action == "merchant.listing.update");
        Assert.Contains("\"showOnWebsite\":true", audit.OldValue!);
        Assert.Contains("\"showOnWebsite\":false", audit.NewValue!);
        listing = await service.UpdateListingAsync(null, merchant.Id, new(true, "Store description", "AQ==", Permission(merchant.Branches.Select(b => b.Id).ToArray())), default);
        Assert.True(listing.IsPublished);
    }

    [Fact]
    public async Task HidingOneBranchKeepsOtherBranchPublishedAndEnforcesBranchLimit()
    {
        await using var db = Db(); var merchant = Merchant(true); db.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("First", true), default);
        var listing = await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Second", true), default);
        var first = listing.Branches.Single(b => b.Name == "First");
        db.MerchantBranches.Local.Single(b => b.Id == first.Id).RowVersion = [2];
        await db.SaveChangesAsync();
        first = first with { ConcurrencyToken = "Ag==" };
        await service.UpsertBranchAsync(null, merchant.Id, first.Id, Branch("First", false) with { ConcurrencyToken = first.ConcurrencyToken }, default);
        var stores = await service.ListPublicAsync(1, 20, null, null, default);
        Assert.Equal("Second", Assert.Single(Assert.Single(stores.Items).Branches).Name);
        db.MerchantBranches.AddRange(Enumerable.Range(0, 98).Select(i => new MerchantBranch { Merchant = merchant, Name = $"Branch {i}" }));
        await db.SaveChangesAsync();
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, merchant.Id, null, Branch(), default))).StatusCode);
        Assert.Equal(100, await db.MerchantBranches.CountAsync());
    }

    [Fact]
    public async Task BranchEditsAreScopedToParentAndDisableWithoutDeleting()
    {
        await using var db = Db(); var merchant = Merchant(true); var other = Merchant(true); other.MerchantCode = "OTHER";
        db.AddRange(merchant, other); await db.SaveChangesAsync(); var service = Service(db);
        var original = Assert.Single((await service.UpsertBranchAsync(null, merchant.Id, null, Branch(visible: true), default)).Branches);
        db.MerchantBranches.Local.Single(b => b.Id == original.Id).RowVersion = [2];
        await db.SaveChangesAsync();
        original = original with { ConcurrencyToken = "Ag==" };
        var error = await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, other.Id, original.Id,
            Branch() with { ConcurrencyToken = original.ConcurrencyToken }, default));
        Assert.Equal(404, error.StatusCode);
        var updated = await service.UpsertBranchAsync(null, merchant.Id, original.Id,
            Branch("Renamed", true) with { IsActive = false, ConcurrencyToken = original.ConcurrencyToken }, default);
        Assert.False(Assert.Single(updated.Branches).IsActive);
        Assert.Single(await db.MerchantBranches.ToListAsync());
        Assert.Empty((await service.ListPublicAsync(1, 20, null, null, default)).Items);
    }

    [Fact]
    public async Task CoordinatesGenerateNavigationAndProviderLinksRemainIndependent()
    {
        await using var db = Db(); var merchant = Merchant(true); db.Add(merchant); await db.SaveChangesAsync(); var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Coordinates", true) with { Latitude = 3.1m, Longitude = 101.5m }, default);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Maps only", true) with { GoogleMapsUrl = "https://maps.app.goo.gl/example" }, default);
        var branches = Assert.Single((await service.ListPublicAsync(1, 20, null, null, default)).Items).Branches;
        var coordinates = branches.Single(b => b.Name == "Coordinates");
        Assert.Contains("destination=3.1,101.5", coordinates.GoogleMapsUrl);
        Assert.Contains("ll=3.1,101.5", coordinates.WazeUrl);
        Assert.Null(branches.Single(b => b.Name == "Maps only").WazeUrl);
    }

    [Theory]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("http://www.google.com/maps", false)]
    [InlineData("https://google.com.evil.test/maps", false)]
    [InlineData("https://evil.test/?url=https://google.com/maps", false)]
    [InlineData("https://google.com/url?q=https://evil.test", false)]
    [InlineData("https://www.google.com/maps/%2e%2e/url?q=https://evil.test", false)]
    [InlineData("https://www.google.com/maps/.%2e/url?q=https://evil.test", false)]
    [InlineData("https://www.google.com/maps/../url?q=https://evil.test", false)]
    [InlineData("https://user@www.google.com/maps", false)]
    [InlineData("https://www.google.com:8443/maps", false)]
    [InlineData("https://waze.com/ul", false)]
    [InlineData("https://waze.com.evil.test/ul", true)]
    [InlineData("https://google.com/maps", true)]
    [InlineData("waze://?ll=1,2", true)]
    [InlineData("https://www.waze.com/account", true)]
    public void UnsafeOrUnrelatedNavigationUrlsAreRejected(string url, bool waze) =>
        Assert.Equal(400, Assert.Throws<ApiException>(() => PartnerNavigationUrls.Normalize(url, waze)).StatusCode);

    [Theory]
    [InlineData(" https://WWW.GOOGLE.COM/maps/search/?api=1&query=Pet%20Shop ", false, "https://www.google.com/maps/search/?api=1&query=Pet%20Shop")]
    [InlineData("https://maps.google.com/?q=3,101", false, "https://maps.google.com/?q=3,101")]
    [InlineData("https://maps.app.goo.gl/a123", false, "https://maps.app.goo.gl/a123")]
    [InlineData("https://goo.gl/maps/a123", false, "https://goo.gl/maps/a123")]
    [InlineData("https://www.waze.com/ul?ll=3,101&navigate=yes", true, "https://www.waze.com/ul?ll=3,101&navigate=yes")]
    [InlineData("https://waze.com/ul/hw283fq24s", true, "https://waze.com/ul/hw283fq24s")]
    [InlineData("https://ul.waze.com/ul?ll=3,101&navigate=yes", true, "https://ul.waze.com/ul?ll=3,101&navigate=yes")]
    [InlineData("https://www.waze.com/live-map/directions?to=ll.3,101", true, "https://www.waze.com/live-map/directions?to=ll.3,101")]
    public void SupportedUrlsAreNormalized(string url, bool waze, string expected) =>
        Assert.Equal(expected, PartnerNavigationUrls.Normalize(url, waze));

    [Fact]
    public async Task BranchAndMerchantValidationIsEnforcedBeforeWriting()
    {
        await using var db = Db(); var merchant = Merchant(); db.Add(merchant); await db.SaveChangesAsync(); var service = Service(db);
        var invalid = new[] {
            Branch() with { Name = " " }, Branch() with { Name = new string('x', 161) },
            Branch() with { Latitude = 91, Longitude = 100 }, Branch() with { Latitude = 1 },
            Branch() with { WhatsApp = "123" }, Branch() with { DisplayOrder = -1 },
            Branch() with { BusinessHours = new string('x', 501) },
            Branch() with { Address = Branch().Address with { City = " " } },
            Branch() with { GoogleMapsUrl = "https://evil.test" }
        };
        foreach (var request in invalid) Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() =>
            service.UpsertBranchAsync(null, merchant.Id, null, request, default))).StatusCode);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpdateListingAsync(null, merchant.Id,
            new(true, new string('x', 2001), "AQ=="), default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => service.UpdateListingAsync(null, merchant.Id,
            new(true, null, "Ag=="), default))).StatusCode);
        Assert.Empty(await db.MerchantBranches.ToListAsync());
    }

    [Fact]
    public async Task ReadOnlyAndOwnerAdministratorsCannotChangeListing()
    {
        foreach (var action in new[] { "Update", "CreateBranch", "UpdateBranch" })
            Assert.Contains(typeof(AdminMerchantListingController).GetMethod(action)!.GetCustomAttributes(typeof(AuthorizeAttribute), true)
                .Cast<AuthorizeAttribute>(), a => a.Policy == AdminCapabilities.SalesManage);
        await using var db = await AdminAccessTestHarness.CreateAsync(AdminRole.OwnerSupport);
        var admin = await db.AdminUsers.SingleAsync();
        await AdminAccessTestHarness.SetRolesAsync(db, admin, AdminRoleTemplates.AuditorCode);
        Assert.False(await FinancialAuthorizationPolicyTests.AuthorizeAsync(db, admin.UserId, AdminCapabilities.SalesManage));
        Assert.False(await FinancialAuthorizationPolicyTests.AuthorizeAsync(db, Guid.NewGuid(), AdminCapabilities.SalesManage));
    }

    [Fact]
    public async Task PublicationRequiresPermissionAndExplicitScopeIncludingInactiveBranches()
    {
        await using var db = Db(); var merchant = Merchant(); db.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Selected", true), default);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Inactive selected", true) with { IsActive = false }, default);
        foreach (var permission in new PublicationPermissionRequest?[] { null, new("Email", " ", []), new("Unrelated", "Email", []), Permission(), Permission(Guid.NewGuid()) })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpdateListingAsync(null, merchant.Id,
                new(true, null, "AQ==", permission), default))).StatusCode);
        Assert.False(merchant.ShowOnWebsite);
        Assert.Empty(await db.AuditLogs.Where(a => a.Action == "merchant.listing.update").ToArrayAsync());
        var scope = merchant.Branches.Select(b => b.Id).ToArray();
        await service.UpdateListingAsync(null, merchant.Id, new(true, null, "AQ==", Permission(scope)), default);
        var audit = await db.AuditLogs.SingleAsync(a => a.Action == "merchant.listing.update");
        Assert.Contains("PRIVATE PERMISSION", audit.NewValue); Assert.Contains("Inactive selected", audit.NewValue);
        var json = JsonSerializer.Serialize((await service.ListPublicAsync(1, 20, null, null, default)).Items);
        Assert.DoesNotContain("PRIVATE PERMISSION", json); Assert.DoesNotContain("Inactive selected", json);
        await service.UpdateListingAsync(null, merchant.Id, new(false, null, "AQ==", WithdrawalReason: "PRIVATE withdrawal by email"), default);
        Assert.Equal(2, await db.AuditLogs.CountAsync(a => a.Action == "merchant.listing.update"));
        Assert.Contains("PRIVATE withdrawal", (await db.AuditLogs.Where(a => a.Action == "merchant.listing.update").ToArrayAsync()).Last().NewValue);
        Assert.Empty((await service.ListPublicAsync(1, 20, null, null, default)).Items);
    }

    [Fact]
    public async Task PublicSearchUsesOnlyThePublishedBusinessName()
    {
        await using var db = Db(); var merchant = Merchant(true);
        merchant.LegalBusinessName = "Private Registered Holdings"; merchant.TradingName = "Visible Pet Shop";
        db.Add(merchant); await db.SaveChangesAsync(); var service = Service(db);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Main", true), default);
        Assert.Equal(0, (await service.ListPublicAsync(1, 20, "Private Registered", null, default)).Total);
        Assert.Equal("Visible Pet Shop", Assert.Single((await service.ListPublicAsync(1, 20, "Visible", null, default)).Items).Name);
        merchant.TradingName = null; await db.SaveChangesAsync();
        Assert.Equal("Private Registered Holdings", Assert.Single((await service.ListPublicAsync(1, 20, "Private Registered", null, default)).Items).Name);
    }

    [Fact]
    public async Task MovingPublishedBranchRequiresNewPermissionButHoursAndPrivateEditsDoNot()
    {
        await using var db = Db(); var merchant = Merchant(true); db.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        var branch = Assert.Single((await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Main", true), default)).Branches);
        db.MerchantBranches.Local.Single().RowVersion = [2]; await db.SaveChangesAsync();
        var original = Branch("Main", true) with { Permission = null, ConcurrencyToken = "Ag==" };
        var moved = original with { Address = original.Address with { AddressLine1 = "New agreed location" } };
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, merchant.Id, branch.Id, moved, default))).StatusCode);
        Assert.Equal(original.Address.AddressLine1, db.MerchantBranches.Local.Single().AddressLine1);
        await service.UpsertBranchAsync(null, merchant.Id, branch.Id, original with { BusinessHours = "9am–5pm" }, default);
        await service.UpsertBranchAsync(null, merchant.Id, branch.Id, moved with { Permission = Permission() }, default);
        Assert.Contains("New agreed location", (await db.AuditLogs.OrderBy(a => a.CreatedAt).LastAsync()).NewValue);
        await service.UpdateListingAsync(null, merchant.Id, new(false, null, "AQ=="), default);
        await service.UpsertBranchAsync(null, merchant.Id, branch.Id, original, default);
    }

    [Fact]
    public async Task NewBranchAndReactivationNeedScopedPermissionOnlyUnderEnabledMerchant()
    {
        await using var db = Db(); var merchant = Merchant(true); db.Add(merchant); await db.SaveChangesAsync();
        var service = Service(db);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, merchant.Id, null,
            Branch("Outside scope", true) with { Permission = null }, default))).StatusCode);
        Assert.Empty(db.MerchantBranches.Local);
        var listing = await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Inactive", true) with { IsActive = false, Permission = null }, default);
        var branch = Assert.Single(listing.Branches);
        db.MerchantBranches.Local.Single().RowVersion = [2]; await db.SaveChangesAsync();
        branch = branch with { ConcurrencyToken = "Ag==" };
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => service.UpsertBranchAsync(null, merchant.Id, branch.Id,
            Branch("Inactive", true) with { Permission = null, ConcurrencyToken = branch.ConcurrencyToken }, default))).StatusCode);
        var enabled = await service.UpsertBranchAsync(null, merchant.Id, branch.Id, Branch("Inactive", true) with { ConcurrencyToken = branch.ConcurrencyToken }, default);
        Assert.True(Assert.Single(enabled.Branches).IsPublished);
        Assert.Contains("PRIVATE PERMISSION", (await db.AuditLogs.Where(a => a.Action == "merchant.branch.update").SingleAsync()).NewValue);
        // A hidden parent can prepare visible selections without publication evidence.
        await service.UpdateListingAsync(null, merchant.Id, new(false, null, "AQ=="), default);
        await service.UpsertBranchAsync(null, merchant.Id, null, Branch("Prepared", true) with { Permission = null }, default);
        Assert.Empty((await service.ListPublicAsync(1, 20, null, null, default)).Items);
    }
}
