using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Auth;

public sealed class ActiveAdminRequirement : IAuthorizationRequirement;

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
