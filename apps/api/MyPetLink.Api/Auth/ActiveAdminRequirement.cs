using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

namespace MyPetLink.Api.Auth;

/// <summary>
/// The baseline gate: the caller is an admin whose access is switched on. It
/// says nothing about what they may do — that is a capability requirement.
/// </summary>
public sealed class ActiveAdminRequirement : IAuthorizationRequirement;

/// <summary>
/// Requires one named capability from the Admin Portal capability catalogue.
///
/// Access is deliberately resolved from the database on every request, so a
/// role change or a switched-off account takes effect immediately; a token
/// claim or a portal cache can never preserve access that has been withdrawn.
/// </summary>
public sealed class AdminCapabilityRequirement : IAuthorizationRequirement
{
    public AdminCapabilityRequirement(string capability)
    {
        if (!AdminCapabilityCatalog.IsKnown(capability))
        {
            throw new ArgumentException(
                $"'{capability}' is not in the Admin capability catalogue.",
                nameof(capability));
        }

        Capability = capability;
    }

    public string Capability { get; }
}

public sealed class ActiveAdminRequirementHandler : AuthorizationHandler<ActiveAdminRequirement>
{
    private readonly IAdminAccessResolver _accessResolver;

    public ActiveAdminRequirementHandler(IAdminAccessResolver accessResolver)
    {
        _accessResolver = accessResolver;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ActiveAdminRequirement requirement)
    {
        var access = await _accessResolver.ResolveAsync(ReadUserId(context.User));

        if (access.IsActiveAdmin)
        {
            context.Succeed(requirement);
        }
    }

    internal static Guid? ReadUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
            ? userId
            : null;
}

public sealed class AdminCapabilityRequirementHandler
    : AuthorizationHandler<AdminCapabilityRequirement>
{
    private readonly IAdminAccessResolver _accessResolver;

    public AdminCapabilityRequirementHandler(IAdminAccessResolver accessResolver)
    {
        _accessResolver = accessResolver;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        AdminCapabilityRequirement requirement)
    {
        var access = await _accessResolver.ResolveAsync(
            ActiveAdminRequirementHandler.ReadUserId(context.User));

        if (access.Has(requirement.Capability))
        {
            context.Succeed(requirement);
        }
    }
}
