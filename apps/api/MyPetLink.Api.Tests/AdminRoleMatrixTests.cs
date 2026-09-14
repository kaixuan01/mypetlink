using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// What each built-in role can and cannot reach, decided the way a real request
/// decides it: through the capability authorization handler, against role rows
/// in the database.
/// </summary>
public sealed class AdminRoleMatrixTests
{
    [Fact]
    public async Task SuperAdmin_CanReachEveryCapability_IncludingOnesAddedLater()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);

        foreach (var capability in AdminCapabilityCatalog.AllKeys)
        {
            Assert.True(
                await AuthorizeAsync(db, admin.UserId, capability),
                $"Super Admin was refused {capability}.");
        }

        // Full access comes from the role's flag, not from stored rows, so a
        // capability added in a later release is covered without a data change.
        var role = await db.AdminRoles
            .Include(item => item.Capabilities)
            .SingleAsync(item => item.Code == AdminRoleTemplates.SuperAdminCode);
        Assert.True(role.GrantsAllCapabilities);
        Assert.Empty(role.Capabilities);
    }

    [Fact]
    public async Task Sales_CannotReachFinanceOnlyOperations()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "sales@example.test", AdminRoleTemplates.SalesCode);

        await AssertDeniedAsync(db, admin, [
            AdminCapabilities.PaymentProofsReview,
            AdminCapabilities.MerchantInvoicesRecordPayment,
            AdminCapabilities.PayoutsManage,
            AdminCapabilities.PayoutsSettle,
            AdminCapabilities.SalesCommissionsReverse,
            AdminCapabilities.SalesCommissionRulesManage,
            AdminCapabilities.InventoryGenerate,
            AdminCapabilities.InventoryManage,
            AdminCapabilities.AdminUsersManage,
            AdminCapabilities.AdminRolesManage,
            AdminCapabilities.SettingsManage,
            AdminCapabilities.OwnersExport,
        ]);

        await AssertGrantedAsync(db, admin, [
            AdminCapabilities.SalesView,
            AdminCapabilities.SalesManage,
            AdminCapabilities.SalesCommissionsView,
            AdminCapabilities.MerchantOrdersManage,
        ]);
    }

    [Fact]
    public async Task Marketing_CannotApprovePaymentsOrTouchPayoutsAndCosts()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "marketing@example.test", AdminRoleTemplates.MarketingCode);

        await AssertDeniedAsync(db, admin, [
            AdminCapabilities.PaymentProofsView,
            AdminCapabilities.PaymentProofsReview,
            AdminCapabilities.PayoutsView,
            AdminCapabilities.PayoutsManage,
            AdminCapabilities.PayoutsSettle,
            AdminCapabilities.InventoryCostsView,
            AdminCapabilities.InventoryGenerate,
            AdminCapabilities.AdminUsersManage,
            AdminCapabilities.AdminRolesManage,
            AdminCapabilities.OwnersExport,
            AdminCapabilities.SalesManage,
        ]);

        await AssertGrantedAsync(db, admin, [
            AdminCapabilities.MarketingView,
            AdminCapabilities.MarketingManage,
            AdminCapabilities.SampleExperienceManage,
            AdminCapabilities.SalesView,
        ]);
    }

    [Fact]
    public async Task Finance_CannotManageAdminUsersOrRoles()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "finance@example.test", AdminRoleTemplates.FinanceCode);

        await AssertDeniedAsync(db, admin, [
            AdminCapabilities.AdminUsersManage,
            AdminCapabilities.AdminRolesManage,
            AdminCapabilities.InventoryGenerate,
            AdminCapabilities.SmartTagsTransfer,
            AdminCapabilities.SettingsManage,
        ]);

        await AssertGrantedAsync(db, admin, [
            AdminCapabilities.PaymentProofsReview,
            AdminCapabilities.MerchantInvoicesRecordPayment,
            AdminCapabilities.PayoutsSettle,
            AdminCapabilities.SalesCommissionsReverse,
            AdminCapabilities.InventoryCostsView,
        ]);
    }

    [Fact]
    public async Task Operations_CannotManageRolesUnlessExplicitlyGranted()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "ops@example.test", AdminRoleTemplates.OperationsCode);

        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.AdminRolesManage));
        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.AdminUsersManage));

        // Granting it explicitly is the only way in, and it takes effect at once.
        var role = await db.AdminRoles.SingleAsync(item => item.Code == AdminRoleTemplates.OperationsCode);
        db.AdminRoleCapabilities.Add(new AdminRoleCapability
        {
            AdminRoleId = role.Id,
            Capability = AdminCapabilities.AdminRolesManage,
        });
        await db.SaveChangesAsync();

        Assert.True(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.AdminRolesManage));
    }

    [Fact]
    public async Task Support_CanHelpOwnersButCannotTouchMoneyOrMoveTagsBetweenOwners()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "support@example.test", AdminRoleTemplates.SupportCode);

        await AssertGrantedAsync(db, admin, [
            AdminCapabilities.OwnersView,
            AdminCapabilities.PetsManage,
            AdminCapabilities.SmartTagsAssign,
            AdminCapabilities.SmartTagsManage,
        ]);

        await AssertDeniedAsync(db, admin, [
            AdminCapabilities.SmartTagsTransfer,
            AdminCapabilities.PaymentProofsReview,
            AdminCapabilities.PayoutsView,
            AdminCapabilities.OwnersExport,
            AdminCapabilities.PetsExport,
            AdminCapabilities.InventoryGenerate,
            AdminCapabilities.AdminUsersManage,
        ]);
    }

    [Fact]
    public async Task ReadOnlyAuditor_HoldsNoWriteOrExportCapabilityAtAll()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "auditor@example.test", AdminRoleTemplates.AuditorCode);
        var access = await AdminAccessTestHarness.ResolveAsync(db, admin.UserId);

        Assert.False(access.IsSuperAdmin);
        Assert.NotEmpty(access.Capabilities);

        foreach (var capability in access.Capabilities)
        {
            var descriptor = AdminCapabilityCatalog.Find(capability);
            Assert.NotNull(descriptor);
            Assert.False(
                descriptor!.IsWriteAccess,
                $"Read Only / Auditor must not be able to {descriptor.Name.ToLowerInvariant()}.");
            Assert.False(descriptor.IsSensitive, $"{capability} is sensitive and must not be read-only.");
        }

        // Spot-checked through the real authorization path as well.
        await AssertDeniedAsync(db, admin, [
            AdminCapabilities.OrdersManage,
            AdminCapabilities.PaymentProofsReview,
            AdminCapabilities.SmartTagsManage,
            AdminCapabilities.InventoryGenerate,
            AdminCapabilities.AdminUsersManage,
            AdminCapabilities.OwnersExport,
        ]);

        await AssertGrantedAsync(db, admin, [
            AdminCapabilities.OrdersView,
            AdminCapabilities.AuditLogView,
            AdminCapabilities.PaymentProofsView,
        ]);
    }

    [Fact]
    public async Task HoldingTwoRoles_GrantsTheUnionOfBoth()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(
            db, "both@example.test",
            AdminRoleTemplates.FinanceCode, AdminRoleTemplates.SupportCode);

        Assert.True(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.PayoutsSettle));
        Assert.True(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.SmartTagsAssign));
        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.AdminUsersManage));
    }

    [Fact]
    public async Task AnAdminWithNoRoles_HasNoCapabilities()
    {
        await using var db = await SeededDbAsync();
        var admin = await AdminAccessTestHarness.AddAdminAsync(
            db, AdminRole.Admin, "orphan@example.test", "Orphan");
        await AdminAccessTestHarness.SetRolesAsync(db, admin);

        var access = await AdminAccessTestHarness.ResolveAsync(db, admin.UserId);

        Assert.True(access.IsActiveAdmin);
        Assert.False(access.IsSuperAdmin);
        Assert.Empty(access.Capabilities);
        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.OrdersView));
    }

    [Fact]
    public async Task ACapabilityRowThatIsNotInTheCatalogue_GrantsNothing()
    {
        await using var db = await SeededDbAsync();
        var admin = await AddWithRolesAsync(db, "stale@example.test", AdminRoleTemplates.SupportCode);

        var role = await db.AdminRoles.SingleAsync(item => item.Code == AdminRoleTemplates.SupportCode);
        db.AdminRoleCapabilities.Add(new AdminRoleCapability
        {
            AdminRoleId = role.Id,
            Capability = "inventory.generate.v2",
        });
        await db.SaveChangesAsync();

        var access = await AdminAccessTestHarness.ResolveAsync(db, admin.UserId);
        Assert.DoesNotContain("inventory.generate.v2", access.Capabilities);
        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.InventoryGenerate));
    }

    // --- Helpers --------------------------------------------------------------

    private static async Task<MyPetLinkDbContext> SeededDbAsync()
    {
        var db = AdminAccessTestHarness.CreateDb();
        await new AdminAccessSeeder(db).EnsureSeededAsync();
        return db;
    }

    private static async Task<AdminUser> AddWithRolesAsync(
        MyPetLinkDbContext db, string email, params string[] roleCodes)
    {
        var admin = await AdminAccessTestHarness.AddAdminAsync(
            db, AdminRole.OwnerSupport, email, email.Split('@')[0]);
        await AdminAccessTestHarness.SetRolesAsync(db, admin, roleCodes);
        return admin;
    }

    private static Task<bool> AuthorizeAsync(MyPetLinkDbContext db, Guid userId, string capability) =>
        FinancialAuthorizationPolicyTests.AuthorizeAsync(db, userId, capability);

    private static async Task AssertGrantedAsync(
        MyPetLinkDbContext db, AdminUser admin, string[] capabilities)
    {
        foreach (var capability in capabilities)
        {
            Assert.True(
                await AuthorizeAsync(db, admin.UserId, capability),
                $"Expected {capability} to be granted.");
        }
    }

    private static async Task AssertDeniedAsync(
        MyPetLinkDbContext db, AdminUser admin, string[] capabilities)
    {
        foreach (var capability in capabilities)
        {
            Assert.False(
                await AuthorizeAsync(db, admin.UserId, capability),
                $"Expected {capability} to be refused.");
        }
    }
}
