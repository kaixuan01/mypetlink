using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Auth;

public sealed class ActiveAdminRequirement : IAuthorizationRequirement;

/// <summary>
/// Purpose-specific Admin authorization. The allowed role is deliberately
/// resolved from AdminUsers for every request; a role claim or a UI cache can
/// never preserve access after an operator's role is changed or disabled.
/// </summary>
public sealed class ActiveAdminRoleRequirement(params AdminRole[] allowedRoles) : IAuthorizationRequirement
{
    public IReadOnlySet<AdminRole> AllowedRoles { get; } = allowedRoles.ToHashSet();
}

public sealed class ActiveAdminRequirementHandler : AuthorizationHandler<ActiveAdminRequirement>
{
    private readonly MyPetLinkDbContext _dbContext;

    public ActiveAdminRequirementHandler(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ActiveAdminRequirement requirement)
    {
        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return;
        }

        var isActiveAdmin = await _dbContext.AdminUsers
            .AsNoTracking()
            .AnyAsync(admin =>
                admin.UserId == userId
                && admin.IsActive
                && admin.DisabledAt == null
                && admin.User.Status == UserStatus.Active
                && admin.User.DeletedAt == null);

        if (isActiveAdmin)
        {
            context.Succeed(requirement);
        }
    }
}

public sealed class ActiveAdminRoleRequirementHandler
    : AuthorizationHandler<ActiveAdminRoleRequirement>
{
    private readonly MyPetLinkDbContext _dbContext;

    public ActiveAdminRoleRequirementHandler(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ActiveAdminRoleRequirement requirement)
    {
        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId)) return;

        var role = await _dbContext.AdminUsers
            .AsNoTracking()
            .Where(admin =>
                admin.UserId == userId
                && admin.IsActive
                && admin.DisabledAt == null
                && admin.User.Status == UserStatus.Active
                && admin.User.DeletedAt == null)
            .Select(admin => (AdminRole?)admin.Role)
            .SingleOrDefaultAsync();

        if (role.HasValue && requirement.AllowedRoles.Contains(role.Value))
        {
            context.Succeed(requirement);
        }
    }
}
