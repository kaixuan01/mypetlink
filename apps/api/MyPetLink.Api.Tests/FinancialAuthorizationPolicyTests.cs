using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class FinancialAuthorizationPolicyTests
{
    [Fact]
    public void SensitiveControllerActions_DeclareTheExpectedPurposePolicies()
    {
        AssertPolicy(typeof(AdminSalesCommissionsController), AuthorizationPolicies.CommissionFinancial);
        AssertPolicy(typeof(AdminCommissionRulesController), AuthorizationPolicies.ManageCommissionRules);
        AssertPolicy(typeof(AdminSalesCommissionsController).GetMethod("MarkPaid")!, AuthorizationPolicies.MarkCommissionPaid);
        AssertPolicy(typeof(AdminSalesCommissionsController).GetMethod("Reverse")!, AuthorizationPolicies.ReverseCommission);
        AssertPolicy(typeof(AdminSalesReportingController).GetMethod("Performance")!, AuthorizationPolicies.SalesPerformance);
        AssertPolicy(typeof(AdminSalesReportingController).GetMethod("Financial")!, AuthorizationPolicies.CommissionFinancial);
        AssertPolicy(typeof(AdminMerchantInvoicesController).GetMethod("RecordPayment")!, AuthorizationPolicies.CommissionFinancial);
        AssertPolicy(typeof(AdminCommissionPayoutsController), AuthorizationPolicies.CommissionFinancial);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("Prepare")!, AuthorizationPolicies.PrepareCommissionPayout);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("MarkPaid")!, AuthorizationPolicies.MarkCommissionPaid);
        AssertPolicy(typeof(AdminCommissionPayoutsController).GetMethod("Cancel")!, AuthorizationPolicies.PrepareCommissionPayout);
    }

    [Theory]
    [InlineData(AdminRole.OwnerSupport, false, false, false)]
    [InlineData(AdminRole.Operations, true, false, false)]
    [InlineData(AdminRole.Admin, true, true, false)]
    [InlineData(AdminRole.SuperAdmin, true, true, true)]
    public async Task DbBackedRoleMatrix_IsEnforced(
        AdminRole role, bool salesPerformance, bool financial, bool superAdmin)
    {
        await using var db = await CreateDbAsync(role);
        var userId = await db.AdminUsers.Select(item => item.UserId).SingleAsync();

        Assert.Equal(salesPerformance, await AuthorizeAsync(db, userId,
            new ActiveAdminRoleRequirement(AdminRole.Operations, AdminRole.Admin, AdminRole.SuperAdmin)));
        Assert.Equal(financial, await AuthorizeAsync(db, userId,
            new ActiveAdminRoleRequirement(AdminRole.Admin, AdminRole.SuperAdmin)));
        Assert.Equal(superAdmin, await AuthorizeAsync(db, userId,
            new ActiveAdminRoleRequirement(AdminRole.SuperAdmin)));
    }

    [Fact]
    public async Task RoleChange_TakesEffectForSamePrincipalWithoutNewToken()
    {
        await using var db = await CreateDbAsync(AdminRole.Admin);
        var admin = await db.AdminUsers.SingleAsync();
        var principalUserId = admin.UserId;
        var requirement = new ActiveAdminRoleRequirement(AdminRole.Admin, AdminRole.SuperAdmin);

        Assert.True(await AuthorizeAsync(db, principalUserId, requirement));

        admin.Role = AdminRole.OwnerSupport;
        await db.SaveChangesAsync();

        Assert.False(await AuthorizeAsync(db, principalUserId, requirement));
    }

    [Fact]
    public async Task DisabledAdmin_IsDeniedImmediately()
    {
        await using var db = await CreateDbAsync(AdminRole.SuperAdmin);
        var admin = await db.AdminUsers.SingleAsync();
        admin.IsActive = false;
        admin.DisabledAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        Assert.False(await AuthorizeAsync(db, admin.UserId,
            new ActiveAdminRoleRequirement(AdminRole.SuperAdmin)));
    }

    private static async Task<bool> AuthorizeAsync(
        MyPetLinkDbContext db, Guid userId, ActiveAdminRoleRequirement requirement)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "test"));
        var context = new AuthorizationHandlerContext([requirement], principal, null);
        await new ActiveAdminRoleRequirementHandler(db).HandleAsync(context);
        return context.HasSucceeded;
    }

    private static void AssertPolicy(System.Reflection.MemberInfo member, string expected) =>
        Assert.Contains(member.GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>(),
            item => item.Policy == expected);

    private static async Task<MyPetLinkDbContext> CreateDbAsync(AdminRole role)
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase($"financial-authorization-{Guid.NewGuid():N}").Options;
        var db = new MyPetLinkDbContext(options);
        var user = new User
        {
            Email = "operator@example.test", NormalizedEmail = "OPERATOR@EXAMPLE.TEST",
            DisplayName = "Operator", Status = UserStatus.Active
        };
        db.Add(user);
        db.Add(new AdminUser { UserId = user.Id, User = user, Role = role, IsActive = true });
        await db.SaveChangesAsync();
        return db;
    }
}
