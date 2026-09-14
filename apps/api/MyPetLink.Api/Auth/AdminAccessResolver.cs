using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Auth;

public sealed record AdminAccessRole(
    Guid Id,
    string Code,
    string Name,
    bool GrantsAllCapabilities);

/// <summary>
/// What one signed-in person may do in the Admin Portal right now, resolved
/// from the database rather than from the access token. Changing someone's
/// roles or switching their access off takes effect on their very next request
/// — no sign-out, no token refresh.
/// </summary>
public sealed record AdminAccessSnapshot(
    Guid? AdminUserId,
    Guid? UserId,
    bool IsActiveAdmin,
    bool IsSuperAdmin,
    IReadOnlyList<AdminAccessRole> Roles,
    IReadOnlySet<string> Capabilities)
{
    /// <summary>Deny by default: anyone we cannot positively identify gets this.</summary>
    public static AdminAccessSnapshot None { get; } = new(
        null, null, false, false, [], new HashSet<string>(StringComparer.Ordinal));

    public bool Has(string capability) =>
        IsActiveAdmin && (IsSuperAdmin || Capabilities.Contains(capability));

    public bool HasAny(params string[] capabilities) =>
        IsActiveAdmin && (IsSuperAdmin || capabilities.Any(Capabilities.Contains));

    /// <summary>
    /// The capabilities to report to the Admin Portal. A role that grants
    /// everything is expanded to the full catalogue so the portal renders the
    /// same conclusion the API will reach.
    /// </summary>
    public IReadOnlyList<string> EffectiveCapabilities() =>
        !IsActiveAdmin
            ? Array.Empty<string>()
            : IsSuperAdmin
                ? AdminCapabilityCatalog.AllKeys
                : AdminCapabilityCatalog.Normalize(Capabilities);
}

public interface IAdminAccessResolver
{
    Task<AdminAccessSnapshot> ResolveAsync(Guid? userId, CancellationToken cancellationToken = default);

    Task<AdminAccessSnapshot> ResolveCurrentAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Reads effective admin access from <c>AdminUsers</c> → <c>AdminUserRoles</c>
/// → <c>AdminRoles</c> → <c>AdminRoleCapabilities</c>.
///
/// Scoped, and memoised per user for the lifetime of one request, so a request
/// that evaluates several capability policies and then asks again inside the
/// controller still costs one query.
/// </summary>
public sealed class AdminAccessResolver : IAdminAccessResolver
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly Dictionary<Guid, AdminAccessSnapshot> _cache = [];

    public AdminAccessResolver(
        MyPetLinkDbContext dbContext,
        ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    public Task<AdminAccessSnapshot> ResolveCurrentAsync(CancellationToken cancellationToken = default) =>
        ResolveAsync(_currentUserService.Current.UserId, cancellationToken);

    public async Task<AdminAccessSnapshot> ResolveAsync(
        Guid? userId,
        CancellationToken cancellationToken = default)
    {
        if (userId is not { } id || id == Guid.Empty)
        {
            return AdminAccessSnapshot.None;
        }

        if (_cache.TryGetValue(id, out var cached))
        {
            return cached;
        }

        var snapshot = await LoadAsync(id, cancellationToken);
        _cache[id] = snapshot;
        return snapshot;
    }

    private async Task<AdminAccessSnapshot> LoadAsync(Guid userId, CancellationToken cancellationToken)
    {
        var record = await _dbContext.AdminUsers
            .AsNoTracking()
            .Where(admin =>
                admin.UserId == userId
                && admin.IsActive
                && admin.DisabledAt == null
                && admin.User.Status == UserStatus.Active
                && admin.User.DeletedAt == null)
            .Select(admin => new
            {
                AdminUserId = admin.Id,
                Roles = admin.RoleAssignments
                    .Select(assignment => new
                    {
                        assignment.AdminRole.Id,
                        assignment.AdminRole.Code,
                        assignment.AdminRole.Name,
                        assignment.AdminRole.GrantsAllCapabilities,
                        Capabilities = assignment.AdminRole.Capabilities
                            .Select(capability => capability.Capability)
                            .ToList(),
                    })
                    .ToList(),
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (record is null)
        {
            return AdminAccessSnapshot.None;
        }

        var roles = record.Roles
            .Select(role => new AdminAccessRole(role.Id, role.Code, role.Name, role.GrantsAllCapabilities))
            .OrderBy(role => role.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        // Stored keys are filtered through the catalogue: a capability that has
        // been removed from the product can never keep granting access, and a
        // row written outside the application cannot invent a new one.
        var capabilities = record.Roles
            .SelectMany(role => role.Capabilities)
            .Where(AdminCapabilityCatalog.IsKnown)
            .ToHashSet(StringComparer.Ordinal);

        return new AdminAccessSnapshot(
            record.AdminUserId,
            userId,
            IsActiveAdmin: true,
            IsSuperAdmin: roles.Any(role => role.GrantsAllCapabilities),
            roles,
            capabilities);
    }
}
