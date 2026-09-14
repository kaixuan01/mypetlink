using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Access Management behaviour and, above all, the escalation rules. Every case
/// here is something a determined operator could otherwise achieve by calling
/// the API directly, whatever the Admin Portal chose to show them.
/// </summary>
public sealed class AdminAccessManagementServiceTests
{
    // --- Assigning roles ------------------------------------------------------

    [Fact]
    public async Task AssigningARole_GrantsItsCapabilitiesImmediately()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var target = await AddAsync(db, "new@example.test");

        Assert.False(await CanAsync(db, target, AdminCapabilities.PayoutsSettle));

        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);
        var finance = await RoleIdAsync(db, AdminRoleTemplates.FinanceCode);
        await service.UpdateUserRolesAsync(target.Id, Roles(await RowVersionAsync(db, target), finance));

        Assert.True(await CanAsync(db, target, AdminCapabilities.PayoutsSettle));
    }

    [Fact]
    public async Task RemovingARole_WithdrawsItsCapabilitiesImmediately()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var target = await AddAsync(db, "finance@example.test", AdminRoleTemplates.FinanceCode);

        Assert.True(await CanAsync(db, target, AdminCapabilities.PayoutsSettle));

        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);
        await service.UpdateUserRolesAsync(target.Id, Roles(await RowVersionAsync(db, target)));

        Assert.False(await CanAsync(db, target, AdminCapabilities.PayoutsSettle));
        Assert.False(await CanAsync(db, target, AdminCapabilities.MerchantInvoicesView));
    }

    // --- Privilege escalation -------------------------------------------------

    [Fact]
    public async Task AnAdminCannotChangeTheirOwnRoles()
    {
        await using var db = await SeededDbAsync();
        var operations = await AddAsync(db, "ops@example.test", AdminRoleTemplates.OperationsCode);
        await GrantAsync(db, AdminRoleTemplates.OperationsCode, AdminCapabilities.AdminUsersManage);

        var service = AdminAccessTestHarness.ManagementFor(db, operations.UserId);
        var superAdmin = await RoleIdAsync(db, AdminRoleTemplates.SuperAdminCode);

        var request = Roles(await RowVersionAsync(db, operations), superAdmin);
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateUserRolesAsync(operations.Id, request));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
        Assert.Contains("your own roles", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.False(await CanAsync(db, operations, AdminCapabilities.PayoutsSettle));
    }

    [Fact]
    public async Task OnlyASuperAdminCanGrantSuperAdmin()
    {
        await using var db = await SeededDbAsync();
        await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var operations = await AddAsync(db, "ops@example.test", AdminRoleTemplates.OperationsCode);
        await GrantAsync(db, AdminRoleTemplates.OperationsCode, AdminCapabilities.AdminUsersManage);
        var accomplice = await AddAsync(db, "friend@example.test");

        var service = AdminAccessTestHarness.ManagementFor(db, operations.UserId);
        var superAdmin = await RoleIdAsync(db, AdminRoleTemplates.SuperAdminCode);

        var request = Roles(await RowVersionAsync(db, accomplice), superAdmin);
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateUserRolesAsync(accomplice.Id, request));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
        Assert.False(await CanAsync(db, accomplice, AdminCapabilities.PayoutsSettle));
    }

    [Fact]
    public async Task AnAdminCannotGrantACapabilityTheyDoNotHoldThemselves()
    {
        await using var db = await SeededDbAsync();
        var support = await AddAsync(db, "support@example.test", AdminRoleTemplates.SupportCode);
        await GrantAsync(db, AdminRoleTemplates.SupportCode, AdminCapabilities.AdminUsersManage);
        var colleague = await AddAsync(db, "colleague@example.test");

        var service = AdminAccessTestHarness.ManagementFor(db, support.UserId);
        var finance = await RoleIdAsync(db, AdminRoleTemplates.FinanceCode);

        var request = Roles(await RowVersionAsync(db, colleague), finance);
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateUserRolesAsync(colleague.Id, request));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
        Assert.Contains("do not have it yourself", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnAdminCannotBuildACustomRoleContainingCapabilitiesTheyDoNotHold()
    {
        await using var db = await SeededDbAsync();
        var support = await AddAsync(db, "support@example.test", AdminRoleTemplates.SupportCode);
        await GrantAsync(db, AdminRoleTemplates.SupportCode, AdminCapabilities.AdminRolesManage);

        var service = AdminAccessTestHarness.ManagementFor(db, support.UserId);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.CreateRoleAsync(new CreateAdminRoleRequest(
                "Back Door", "", [AdminCapabilities.InventoryGenerate])));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
        Assert.Empty(await db.AdminRoles.Where(role => role.Name == "Back Door").ToListAsync());
    }

    [Fact]
    public async Task ACapabilityThatIsNotInTheCatalogueIsRejected_NotStored()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.CreateRoleAsync(new CreateAdminRoleRequest(
                "Invented", "", ["everything.*", "admin.users.manage.super"])));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);
        Assert.Empty(await db.AdminRoleCapabilities
            .Where(capability => capability.Capability == "everything.*")
            .ToListAsync());
    }

    [Fact]
    public async Task WhenOnlyOneSuperAdminIsLeft_EveryRouteToRemovingThemIsRefused()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var administrator = await AddAsync(db, "admin@example.test", AdminRoleTemplates.AdministratorCode);
        await GrantAsync(db, AdminRoleTemplates.AdministratorCode, AdminCapabilities.AdminUsersManage);

        var byFounder = AdminAccessTestHarness.ManagementFor(db, founder.UserId);
        var byAdministrator = AdminAccessTestHarness.ManagementFor(db, administrator.UserId);
        var operations = await RoleIdAsync(db, AdminRoleTemplates.OperationsCode);

        // Switching off their own access.
        var ownVersion = new SetAdminUserActiveRequest(await RowVersionAsync(db, founder));
        var selfDeactivate = await Assert.ThrowsAsync<ApiException>(() =>
            byFounder.SetUserActiveAsync(founder.Id, isActive: false, ownVersion));
        Assert.Equal(StatusCodes.Status403Forbidden, selfDeactivate.StatusCode);

        // Demoting themselves.
        var ownRoles = Roles(await RowVersionAsync(db, founder), operations);
        var selfDemote = await Assert.ThrowsAsync<ApiException>(() =>
            byFounder.UpdateUserRolesAsync(founder.Id, ownRoles));
        Assert.Equal(StatusCodes.Status403Forbidden, selfDemote.StatusCode);

        // Somebody else who manages admin users switching them off.
        var theirVersion = new SetAdminUserActiveRequest(await RowVersionAsync(db, founder));
        var otherDeactivate = await Assert.ThrowsAsync<ApiException>(() =>
            byAdministrator.SetUserActiveAsync(founder.Id, isActive: false, theirVersion));
        Assert.Equal(StatusCodes.Status403Forbidden, otherDeactivate.StatusCode);

        // Somebody else who manages admin users demoting them.
        var theirRoles = Roles(await RowVersionAsync(db, founder), operations);
        var otherDemote = await Assert.ThrowsAsync<ApiException>(() =>
            byAdministrator.UpdateUserRolesAsync(founder.Id, theirRoles));
        Assert.Equal(StatusCodes.Status403Forbidden, otherDemote.StatusCode);

        Assert.Equal(1, await ActiveSuperAdminCountAsync(db));
        Assert.True(await CanAsync(db, founder, AdminCapabilities.PayoutsSettle));
    }

    [Fact]
    public async Task ASuperAdminCanBeDemotedOnlyWhileAnotherOneRemains()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var deputy = await AddAsync(db, "deputy@example.test", AdminRoleTemplates.SuperAdminCode);

        Assert.Equal(2, await ActiveSuperAdminCountAsync(db));

        var service = AdminAccessTestHarness.ManagementFor(db, deputy.UserId);
        var operations = await RoleIdAsync(db, AdminRoleTemplates.OperationsCode);
        await service.UpdateUserRolesAsync(founder.Id, Roles(await RowVersionAsync(db, founder), operations));

        Assert.Equal(1, await ActiveSuperAdminCountAsync(db));
        Assert.False(await CanAsync(db, founder, AdminCapabilities.PayoutsSettle));

        // The one that remains cannot be demoted by anybody, including themselves.
        var ownRoles = Roles(await RowVersionAsync(db, deputy), operations);
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateUserRolesAsync(deputy.Id, ownRoles));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
        Assert.Equal(1, await ActiveSuperAdminCountAsync(db));
        Assert.True(await CanAsync(db, deputy, AdminCapabilities.PayoutsSettle));
    }

    [Fact]
    public async Task ASuperAdminsAccessCanOnlyBeSwitchedOffByAnotherSuperAdmin()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        await AddAsync(db, "deputy@example.test", AdminRoleTemplates.SuperAdminCode);
        var administrator = await AddAsync(db, "admin@example.test", AdminRoleTemplates.AdministratorCode);
        await GrantAsync(db, AdminRoleTemplates.AdministratorCode, AdminCapabilities.AdminUsersManage);

        var service = AdminAccessTestHarness.ManagementFor(db, administrator.UserId);

        var founderVersion = new SetAdminUserActiveRequest(await RowVersionAsync(db, founder));
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.SetUserActiveAsync(founder.Id, isActive: false, founderVersion));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    [Fact]
    public async Task AnAdminCannotSwitchOffTheirOwnAccess()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        await AddAsync(db, "deputy@example.test", AdminRoleTemplates.SuperAdminCode);

        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        var founderVersion = new SetAdminUserActiveRequest(await RowVersionAsync(db, founder));
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.SetUserActiveAsync(founder.Id, isActive: false, founderVersion));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    // --- Protected roles ------------------------------------------------------

    [Fact]
    public async Task BuiltInRolesCannotBeDeleted()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        foreach (var code in new[]
                 {
                     AdminRoleTemplates.SuperAdminCode,
                     AdminRoleTemplates.FinanceCode,
                     AdminRoleTemplates.AuditorCode,
                 })
        {
            var roleId = await RoleIdAsync(db, code);
            var error = await Assert.ThrowsAsync<ApiException>(() => service.DeleteRoleAsync(roleId));
            Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
            Assert.Contains("built-in", error.Message, StringComparison.OrdinalIgnoreCase);
        }

        Assert.Equal(AdminRoleTemplates.All.Count, await db.AdminRoles.CountAsync());
    }

    [Fact]
    public async Task TheSuperAdminRolesPermissionsCannotBeEdited()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);
        var roleId = await RoleIdAsync(db, AdminRoleTemplates.SuperAdminCode);
        var request = new UpdateAdminRoleRequest(
            "Super Admin", "", [AdminCapabilities.OrdersView],
            await RoleRowVersionAsync(db, roleId));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateRoleAsync(roleId, request));

        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    [Fact]
    public async Task ARoleStillAssignedToSomeoneCannotBeDeleted()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        var created = await service.CreateRoleAsync(new CreateAdminRoleRequest(
            "Warehouse", "Stock counting only.", [AdminCapabilities.InventoryView]));

        var member = await AddAsync(db, "warehouse@example.test");
        await service.UpdateUserRolesAsync(
            member.Id, Roles(await RowVersionAsync(db, member), created.Role.Id));

        var error = await Assert.ThrowsAsync<ApiException>(() => service.DeleteRoleAsync(created.Role.Id));
        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
        Assert.Equal("role_in_use", error.Code);
    }

    [Fact]
    public async Task ACustomRoleCanBeCreatedAndThenDeletedOnceNobodyHoldsIt()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        var created = await service.CreateRoleAsync(new CreateAdminRoleRequest(
            "Warehouse Lead", "Stock counting and status updates.",
            [AdminCapabilities.InventoryView, AdminCapabilities.InventoryManage]));

        Assert.False(created.Role.IsSystemRole);
        Assert.Equal("warehouse-lead", created.Role.Code);
        Assert.Equal(2, created.Capabilities.Count);

        await service.DeleteRoleAsync(created.Role.Id);
        Assert.Null(await db.AdminRoles.SingleOrDefaultAsync(role => role.Id == created.Role.Id));
    }

    // --- Audit ----------------------------------------------------------------

    [Fact]
    public async Task EveryAccessManagementChangeIsAudited()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        await AddAsync(db, "deputy@example.test", AdminRoleTemplates.SuperAdminCode);
        var target = await AddAsync(db, "target@example.test");
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        var finance = await RoleIdAsync(db, AdminRoleTemplates.FinanceCode);
        await service.UpdateUserRolesAsync(target.Id, Roles(await RowVersionAsync(db, target), finance));
        await service.SetUserActiveAsync(
            target.Id, isActive: false, new SetAdminUserActiveRequest(await RowVersionAsync(db, target)));
        await service.SetUserActiveAsync(
            target.Id, isActive: true, new SetAdminUserActiveRequest(await RowVersionAsync(db, target)));

        var created = await service.CreateRoleAsync(new CreateAdminRoleRequest(
            "Stocktaker", "", [AdminCapabilities.InventoryView]));
        await service.UpdateRoleAsync(created.Role.Id, new UpdateAdminRoleRequest(
            "Stocktaker", "Counts stock.",
            [AdminCapabilities.InventoryView, AdminCapabilities.InventoryManage],
            await RoleRowVersionAsync(db, created.Role.Id)));
        await service.DeleteRoleAsync(created.Role.Id);

        var actions = await db.AuditLogs
            .Where(log => log.Action.StartsWith("admin-access."))
            .Select(log => log.Action)
            .ToListAsync();

        Assert.Contains("admin-access.user.roles-changed", actions);
        Assert.Contains("admin-access.user.deactivated", actions);
        Assert.Contains("admin-access.user.activated", actions);
        Assert.Contains("admin-access.role.created", actions);
        Assert.Contains("admin-access.role.updated", actions);
        Assert.Contains("admin-access.role.deleted", actions);

        // The actor, the target and both sides of the change are recorded.
        var roleChange = await db.AuditLogs
            .SingleAsync(log => log.Action == "admin-access.user.roles-changed");
        Assert.Equal(founder.Id, roleChange.ActorId);
        Assert.Equal(ActorType.Admin, roleChange.ActorType);
        Assert.Equal(target.Id, roleChange.EntityId);
        Assert.NotNull(roleChange.OldValue);
        Assert.Contains(AdminRoleTemplates.FinanceCode, roleChange.NewValue!, StringComparison.Ordinal);

        var permissionChange = await db.AuditLogs
            .SingleAsync(log => log.Action == "admin-access.role.updated");
        Assert.Contains(AdminCapabilities.InventoryManage, permissionChange.NewValue!, StringComparison.Ordinal);
        Assert.DoesNotContain(AdminCapabilities.InventoryManage, permissionChange.OldValue!, StringComparison.Ordinal);
    }

    // --- Reading --------------------------------------------------------------

    [Fact]
    public async Task EffectivePermissionsAreReportedGroupedByModule()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var target = await AddAsync(db, "sales@example.test", AdminRoleTemplates.SalesCode);

        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);
        var detail = await service.GetUserAsync(target.Id);

        Assert.Equal("Sales", Assert.Single(detail.User.Roles).Name);
        Assert.Contains(AdminCapabilities.SalesManage, detail.EffectiveCapabilities);
        Assert.DoesNotContain(AdminCapabilities.PayoutsSettle, detail.EffectiveCapabilities);

        var modules = detail.EffectiveCapabilitiesByModule;
        Assert.Contains(modules, module => module.Key == "sales");
        Assert.DoesNotContain(modules, module => module.Key == "access");
        Assert.All(modules, module => Assert.NotEmpty(module.Capabilities));
        Assert.Equal(
            detail.EffectiveCapabilities.Count,
            modules.Sum(module => module.Capabilities.Count));
    }

    [Fact]
    public async Task SomeoneWhoCanOnlyViewAccessManagementIsNotOfferedAnyChanges()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var viewer = await AddAsync(db, "auditor@example.test", AdminRoleTemplates.AuditorCode);

        var service = AdminAccessTestHarness.ManagementFor(db, viewer.UserId);
        var detail = await service.GetUserAsync(founder.Id);

        Assert.False(detail.User.CanManage);
        Assert.Empty(detail.AssignableRoles);

        var roles = await service.ListRolesAsync();
        Assert.All(roles, role =>
        {
            Assert.False(role.CanEdit);
            Assert.False(role.CanDelete);
            Assert.False(role.CanAssign);
        });

        var request = Roles(await RowVersionAsync(db, founder));
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateUserRolesAsync(founder.Id, request));
        Assert.Equal(StatusCodes.Status403Forbidden, error.StatusCode);
    }

    [Fact]
    public async Task UsersCanBeFilteredByStatusAndRole()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        await AddAsync(db, "sales-one@example.test", AdminRoleTemplates.SalesCode);
        var second = await AddAsync(db, "sales-two@example.test", AdminRoleTemplates.SalesCode);

        second.IsActive = false;
        second.DisabledAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);
        var salesRole = await RoleIdAsync(db, AdminRoleTemplates.SalesCode);

        var (all, allTotal) = await service.ListUsersAsync(1, 50, null, null, salesRole);
        Assert.Equal(2, allTotal);
        Assert.Equal(2, all.Count);

        var (active, activeTotal) = await service.ListUsersAsync(1, 50, null, "active", salesRole);
        Assert.Equal(1, activeTotal);
        Assert.Equal("sales-one@example.test", Assert.Single(active).Email);

        var (search, _) = await service.ListUsersAsync(1, 50, "sales-two", null, null);
        Assert.Equal("sales-two@example.test", Assert.Single(search).Email);
    }

    [Fact]
    public async Task AStaleRowVersionIsRefusedRatherThanOverwritingAnotherAdminsChange()
    {
        await using var db = await SeededDbAsync();
        var founder = await AddAsync(db, "founder@example.test", AdminRoleTemplates.SuperAdminCode);
        var target = await AddAsync(db, "target@example.test");
        var service = AdminAccessTestHarness.ManagementFor(db, founder.UserId);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            service.UpdateUserRolesAsync(
                target.Id,
                new UpdateAdminUserRolesRequest([], RowVersion: "   ")));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);
    }

    // --- Helpers --------------------------------------------------------------

    private static async Task<MyPetLinkDbContext> SeededDbAsync()
    {
        var db = AdminAccessTestHarness.CreateDb();
        await new AdminAccessSeeder(db).EnsureSeededAsync();
        await AdminAccessTestHarness.StampRowVersionsAsync(db);
        return db;
    }

    private static async Task<AdminUser> AddAsync(
        MyPetLinkDbContext db, string email, params string[] roleCodes)
    {
        var admin = await AdminAccessTestHarness.AddAdminAsync(
            db, AdminRole.OwnerSupport, email, email.Split('@')[0]);
        await AdminAccessTestHarness.SetRolesAsync(db, admin, roleCodes);
        return admin;
    }

    private static async Task GrantAsync(MyPetLinkDbContext db, string roleCode, string capability)
    {
        var role = await db.AdminRoles.SingleAsync(item => item.Code == roleCode);
        db.AdminRoleCapabilities.Add(new AdminRoleCapability
        {
            AdminRoleId = role.Id,
            Capability = capability,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> RoleIdAsync(MyPetLinkDbContext db, string code) =>
        (await db.AdminRoles.AsNoTracking().SingleAsync(role => role.Code == code)).Id;

    private static async Task<string> RowVersionAsync(MyPetLinkDbContext db, AdminUser admin)
    {
        await AdminAccessTestHarness.StampRowVersionsAsync(db);
        var row = await db.AdminUsers.AsNoTracking().SingleAsync(item => item.Id == admin.Id);
        return Convert.ToBase64String(row.RowVersion);
    }

    private static async Task<string> RoleRowVersionAsync(MyPetLinkDbContext db, Guid roleId)
    {
        await AdminAccessTestHarness.StampRowVersionsAsync(db);
        var row = await db.AdminRoles.AsNoTracking().SingleAsync(item => item.Id == roleId);
        return Convert.ToBase64String(row.RowVersion);
    }

    private static UpdateAdminUserRolesRequest Roles(string rowVersion, params Guid[] roleIds) =>
        new(roleIds, rowVersion);

    private static Task<bool> CanAsync(MyPetLinkDbContext db, AdminUser admin, string capability) =>
        FinancialAuthorizationPolicyTests.AuthorizeAsync(db, admin.UserId, capability);

    private static Task<int> ActiveSuperAdminCountAsync(MyPetLinkDbContext db) =>
        db.AdminUsers.CountAsync(admin =>
            admin.IsActive
            && admin.DisabledAt == null
            && admin.User.Status == UserStatus.Active
            && admin.User.DeletedAt == null
            && admin.RoleAssignments.Any(assignment => assignment.AdminRole.GrantsAllCapabilities));
}
