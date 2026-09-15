using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The financial separation of duty that Phase 3D introduced, now expressed as
/// capabilities. Preparing a payout, releasing one, reversing commission and
/// changing commission rules stay four distinct decisions.
/// </summary>
public sealed class FinancialAuthorizationPolicyTests
{
    [Fact]
    public void SensitiveControllerActions_DeclareTheExpectedCapabilities()
    {
        AssertPolicy(typeof(AdminSalesCommissionsController), AdminCapabilities.SalesCommissionsView);
        AssertPolicy(typeof(AdminCommissionRulesController), AdminCapabilities.SalesCommissionRulesManage);
        AssertPolicy(typeof(AdminSalesCommissionsController).GetMethod("MarkPaid")!, AdminCapabilities.PayoutsSettle);
        AssertPolicy(typeof(AdminSalesCommissionsController).GetMethod("Reverse")!, AdminCapabilities.SalesCommissionsReverse);
        AssertPolicy(typeof(AdminSalesReportingController).GetMethod("Performance")!, AdminCapabilities.SalesView);
        AssertPolicy(typeof(AdminSalesReportingController).GetMethod("Financial")!, AdminCapabilities.SalesCommissionsView);
        AssertPolicy(typeof(AdminMerchantInvoicesController).GetMethod("RecordPayment")!, AdminCapabilities.MerchantInvoicesRecordPayment);
        AssertPolicy(typeof(AdminCommissionPayoutsController), AdminCapabilities.PayoutsView);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("Statement")!, AdminCapabilities.PayoutsView);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("Prepare")!, AdminCapabilities.PayoutsManage);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("MarkPaid")!, AdminCapabilities.PayoutsSettle);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("Cancel")!, AdminCapabilities.PayoutsManage);
    }

    /// <summary>
    /// The built-in roles that existing operators were migrated onto reproduce
    /// the matrix those operators already had. If this drifts, a deployment
    /// would silently change somebody's access.
    /// </summary>
    [Theory]
    [InlineData(AdminRole.OwnerSupport, false, false, false)]
    [InlineData(AdminRole.Operations, true, false, false)]
    [InlineData(AdminRole.Admin, true, true, false)]
    [InlineData(AdminRole.SuperAdmin, true, true, true)]
    public async Task MigratedRoles_ReproduceTheLegacyFinancialMatrix(
        AdminRole legacyRole, bool salesPerformance, bool commissionFinancial, bool payoutSettlement)
    {
        await using var db = await AdminAccessTestHarness.CreateAsync(legacyRole);
        var userId = await db.AdminUsers.Select(admin => admin.UserId).SingleAsync();

        Assert.Equal(salesPerformance, await AuthorizeAsync(db, userId, AdminCapabilities.SalesView));
        Assert.Equal(commissionFinancial, await AuthorizeAsync(db, userId, AdminCapabilities.SalesCommissionsView));
        Assert.Equal(commissionFinancial, await AuthorizeAsync(db, userId, AdminCapabilities.PayoutsManage));
        Assert.Equal(payoutSettlement, await AuthorizeAsync(db, userId, AdminCapabilities.PayoutsSettle));
        Assert.Equal(payoutSettlement, await AuthorizeAsync(db, userId, AdminCapabilities.SalesCommissionsReverse));
        Assert.Equal(payoutSettlement, await AuthorizeAsync(db, userId, AdminCapabilities.SalesCommissionRulesManage));
    }

    [Fact]
    public async Task RoleChange_TakesEffectForSamePrincipalWithoutNewToken()
    {
        await using var db = await AdminAccessTestHarness.CreateAsync(AdminRole.Admin);
        var admin = await db.AdminUsers.Include(item => item.RoleAssignments).SingleAsync();

        Assert.True(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.SalesCommissionsView));

        await AdminAccessTestHarness.SetRolesAsync(db, admin, AdminRoleTemplates.OwnerSupportCode);

        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.SalesCommissionsView));
    }

    [Fact]
    public async Task DisabledAdmin_IsDeniedImmediately()
    {
        await using var db = await AdminAccessTestHarness.CreateAsync(AdminRole.SuperAdmin);
        var admin = await db.AdminUsers.SingleAsync();
        admin.IsActive = false;
        admin.DisabledAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        Assert.False(await AuthorizeAsync(db, admin.UserId, AdminCapabilities.PayoutsSettle));
    }

    internal static async Task<bool> AuthorizeAsync(
        MyPetLinkDbContext db, Guid userId, string capability)
    {
        var requirement = new AdminCapabilityRequirement(capability);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        var resolver = new AdminAccessResolver(db, new StubCurrentUserService(userId));
        await new AdminCapabilityRequirementHandler(resolver).HandleAsync(context);
        return context.HasSucceeded;
    }

    private static void AssertPolicy(System.Reflection.MemberInfo member, string expected) =>
        Assert.Contains(
            member.GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>(),
            item => item.Policy == expected);
}
