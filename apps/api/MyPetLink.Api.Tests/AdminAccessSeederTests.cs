using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The migration promise: after this release, every administrator keeps exactly
/// the access they already had, and re-running the seeder never undoes a
/// deliberate change.
/// </summary>
public sealed class AdminAccessSeederTests
{
    [Theory]
    [InlineData(AdminRole.SuperAdmin, AdminRoleTemplates.SuperAdminCode)]
    [InlineData(AdminRole.Admin, AdminRoleTemplates.AdministratorCode)]
    [InlineData(AdminRole.Operations, AdminRoleTemplates.OperationsCode)]
    [InlineData(AdminRole.OwnerSupport, AdminRoleTemplates.OwnerSupportCode)]
    public async Task ExistingAdministratorsAreMovedOntoTheMatchingBuiltInRole(
        AdminRole legacyRole, string expectedCode)
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        var admin = await AdminAccessTestHarness.AddAdminAsync(
            db, legacyRole, "existing@example.test", "Existing");

        await new AdminAccessSeeder(db).EnsureSeededAsync();

        var assigned = await db.AdminUserRoles
            .Where(assignment => assignment.AdminUserId == admin.Id)
            .Select(assignment => assignment.AdminRole.Code)
            .ToListAsync();

        Assert.Equal(expectedCode, Assert.Single(assigned));
    }

    [Fact]
    public async Task EveryEndpointAnExistingAdministratorCouldReach_IsStillReachable()
    {
        // The shared admin policy used to let any active admin call these, so
        // every migrated built-in role must still grant them.
        var previouslyOpenToEveryAdmin = new[]
        {
            AdminCapabilities.OrdersManage,
            AdminCapabilities.OrdersShippingManage,
            AdminCapabilities.OrdersTagsAssign,
            AdminCapabilities.OrdersExport,
            AdminCapabilities.PaymentProofsReview,
            AdminCapabilities.PaymentProofsExport,
            AdminCapabilities.InventoryGenerate,
            AdminCapabilities.InventoryManage,
            AdminCapabilities.InventoryReceiptsManage,
            AdminCapabilities.InventoryCostsView,
            AdminCapabilities.SmartTagsManage,
            AdminCapabilities.SmartTagsTransfer,
            AdminCapabilities.SmartTagsExport,
            AdminCapabilities.CatalogManage,
            AdminCapabilities.OwnersExport,
            AdminCapabilities.OwnersManage,
            AdminCapabilities.PetsManage,
            AdminCapabilities.PetsExport,
            AdminCapabilities.MerchantOrdersManage,
            AdminCapabilities.MerchantOrdersFulfil,
            AdminCapabilities.MerchantDocumentsSend,
            AdminCapabilities.MerchantInvoicesManage,
            AdminCapabilities.MarketingManage,
            AdminCapabilities.SettingsManage,
            AdminCapabilities.EmailTemplatesManage,
            AdminCapabilities.SampleExperienceManage,
            AdminCapabilities.OperationalStatusView,
            AdminCapabilities.AuditLogView,
            AdminCapabilities.PlansView,
        };

        foreach (var legacyRole in new[]
                 {
                     AdminRole.OwnerSupport, AdminRole.Operations,
                     AdminRole.Admin, AdminRole.SuperAdmin,
                 })
        {
            await using var db = await AdminAccessTestHarness.CreateAsync(legacyRole);
            var userId = await db.AdminUsers.Select(admin => admin.UserId).SingleAsync();

            foreach (var capability in previouslyOpenToEveryAdmin)
            {
                Assert.True(
                    await FinancialAuthorizationPolicyTests.AuthorizeAsync(db, userId, capability),
                    $"{legacyRole} lost access to {capability}, which every admin previously had.");
            }
        }
    }

    [Fact]
    public async Task NoMigratedRoleGainsAccessItDidNotHaveBefore()
    {
        // Access management is new, so nobody is migrated into being able to
        // change who administers the system.
        foreach (var legacyRole in new[]
                 {
                     AdminRole.OwnerSupport, AdminRole.Operations,
                     AdminRole.Admin, AdminRole.SuperAdmin,
                 })
        {
            await using var db = await AdminAccessTestHarness.CreateAsync(legacyRole);
            var userId = await db.AdminUsers.Select(admin => admin.UserId).SingleAsync();
            var expected = legacyRole == AdminRole.SuperAdmin;

            Assert.Equal(expected, await FinancialAuthorizationPolicyTests.AuthorizeAsync(
                db, userId, AdminCapabilities.AdminUsersManage));
            Assert.Equal(expected, await FinancialAuthorizationPolicyTests.AuthorizeAsync(
                db, userId, AdminCapabilities.AdminRolesManage));
        }
    }

    [Fact]
    public async Task AtLeastOneSuperAdminExistsWhenOneDidBefore()
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        await AdminAccessTestHarness.AddAdminAsync(db, AdminRole.SuperAdmin, "f@example.test", "F");
        await AdminAccessTestHarness.AddAdminAsync(db, AdminRole.Operations, "o@example.test", "O");

        await new AdminAccessSeeder(db).EnsureSeededAsync();

        var superAdmins = await db.AdminUsers
            .CountAsync(admin =>
                admin.IsActive
                && admin.RoleAssignments.Any(a => a.AdminRole.GrantsAllCapabilities));

        Assert.Equal(1, superAdmins);
    }

    [Fact]
    public async Task RunningTheSeederAgainChangesNothing()
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        await AdminAccessTestHarness.AddAdminAsync(db, AdminRole.Admin, "existing@example.test", "Existing");

        var seeder = new AdminAccessSeeder(db);
        await seeder.EnsureSeededAsync();

        var roles = await db.AdminRoles.CountAsync();
        var capabilities = await db.AdminRoleCapabilities.CountAsync();
        var assignments = await db.AdminUserRoles.CountAsync();

        await seeder.EnsureSeededAsync();
        await seeder.EnsureSeededAsync();

        Assert.Equal(roles, await db.AdminRoles.CountAsync());
        Assert.Equal(capabilities, await db.AdminRoleCapabilities.CountAsync());
        Assert.Equal(assignments, await db.AdminUserRoles.CountAsync());
    }

    [Fact]
    public async Task ANarrowedBuiltInRoleStaysNarrowedAcrossDeployments()
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        var seeder = new AdminAccessSeeder(db);
        await seeder.EnsureSeededAsync();

        var operations = await db.AdminRoles
            .Include(role => role.Capabilities)
            .SingleAsync(role => role.Code == AdminRoleTemplates.OperationsCode);

        var generate = operations.Capabilities
            .Single(capability => capability.Capability == AdminCapabilities.InventoryGenerate);
        db.AdminRoleCapabilities.Remove(generate);
        await db.SaveChangesAsync();

        await seeder.EnsureSeededAsync();

        var stillRemoved = await db.AdminRoleCapabilities.AnyAsync(capability =>
            capability.AdminRoleId == operations.Id
            && capability.Capability == AdminCapabilities.InventoryGenerate);

        Assert.False(stillRemoved, "Re-seeding put back a permission an administrator had removed.");
    }

    [Fact]
    public async Task AnAdministratorWhoAlreadyHasRolesIsNotReassigned()
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        var admin = await AdminAccessTestHarness.AddAdminAsync(
            db, AdminRole.SuperAdmin, "someone@example.test", "Someone");

        var seeder = new AdminAccessSeeder(db);
        await seeder.EnsureSeededAsync();

        // A deliberate demotion made after the migration.
        await AdminAccessTestHarness.SetRolesAsync(db, admin, AdminRoleTemplates.SupportCode);
        await seeder.EnsureSeededAsync();

        var assigned = await db.AdminUserRoles
            .Where(assignment => assignment.AdminUserId == admin.Id)
            .Select(assignment => assignment.AdminRole.Code)
            .ToListAsync();

        Assert.Equal(AdminRoleTemplates.SupportCode, Assert.Single(assigned));
    }

    [Fact]
    public async Task TheSeededTemplatesMatchTheCodeTemplates()
    {
        await using var db = AdminAccessTestHarness.CreateDb();
        await new AdminAccessSeeder(db).EnsureSeededAsync();

        foreach (var template in AdminRoleTemplates.All)
        {
            var role = await db.AdminRoles
                .Include(item => item.Capabilities)
                .SingleAsync(item => item.Code == template.Code);

            Assert.True(role.IsSystemRole);
            Assert.Equal(template.Id, role.Id);
            Assert.Equal(template.Name, role.Name);
            Assert.Equal(template.GrantsAllCapabilities, role.GrantsAllCapabilities);
            Assert.Equal(
                AdminCapabilityCatalog.Normalize(template.Capabilities),
                AdminCapabilityCatalog.Normalize(
                    role.Capabilities.Select(capability => capability.Capability)));
        }
    }

    [Fact]
    public void EveryBuiltInRoleGrantsOnlyCapabilitiesThatExist()
    {
        foreach (var template in AdminRoleTemplates.All)
        {
            var unknown = template.Capabilities
                .Where(capability => !AdminCapabilityCatalog.IsKnown(capability))
                .ToArray();

            Assert.True(
                unknown.Length == 0,
                $"{template.Code} grants unknown capabilities: {string.Join(", ", unknown)}");
        }

        // Role ids must be stable, since the seeded rows and the migration
        // both key off them.
        Assert.Equal(
            AdminRoleTemplates.All.Count,
            AdminRoleTemplates.All.Select(role => role.Id).Distinct().Count());
        Assert.Equal(
            AdminRoleTemplates.All.Count,
            AdminRoleTemplates.All.Select(role => role.Code).Distinct().Count());
    }
}
