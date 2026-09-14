using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IAdminAccessSeeder
{
    Task EnsureSeededAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Brings the built-in roles into existence and makes sure no existing
/// administrator is left without one.
///
/// Idempotent and safe to run on every start. Two rules keep it from
/// overwriting deliberate decisions:
///
/// <list type="bullet">
/// <item>A built-in role's capabilities are written only when the role row is
/// first created. If it already exists, its granted capabilities are left
/// exactly as an administrator last saved them — narrowing a template in the
/// Roles screen is never silently undone on the next deployment.</item>
/// <item>An administrator is given a role only when they hold none at all. That
/// is the one-time move from the legacy single-role column onto the new model;
/// after that, assignments are only ever changed from the Users screen.</item>
/// </list>
///
/// The same work is performed by the access-management migration, so a
/// production deployment is already complete before the application starts.
/// This exists so local databases, tests and any administrator created after
/// the migration converge on the same state.
/// </summary>
public sealed class AdminAccessSeeder : IAdminAccessSeeder
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public AdminAccessSeeder(MyPetLinkDbContext dbContext, TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    public async Task EnsureSeededAsync(CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var roles = await EnsureRolesAsync(now, cancellationToken);
        await BackfillAssignmentsAsync(roles, now, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<Dictionary<string, AdminRoleDefinition>> EnsureRolesAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var existing = await _dbContext.AdminRoles
            .Include(role => role.Capabilities)
            .ToDictionaryAsync(role => role.Code, StringComparer.Ordinal, cancellationToken);

        foreach (var template in AdminRoleTemplates.All)
        {
            if (existing.TryGetValue(template.Code, out var role))
            {
                // Wording and ordering are product copy and may be refreshed.
                // Granted capabilities are not touched.
                role.Name = template.Name;
                role.Description = template.Description;
                role.SortOrder = template.SortOrder;
                role.IsSystemRole = true;
                role.GrantsAllCapabilities = template.GrantsAllCapabilities;
                continue;
            }

            role = new AdminRoleDefinition
            {
                Id = template.Id,
                Code = template.Code,
                Name = template.Name,
                Description = template.Description,
                IsSystemRole = true,
                GrantsAllCapabilities = template.GrantsAllCapabilities,
                SortOrder = template.SortOrder,
                CreatedAt = now,
                UpdatedAt = now,
            };

            foreach (var capability in AdminCapabilityCatalog.Normalize(template.Capabilities))
            {
                role.Capabilities.Add(new AdminRoleCapability
                {
                    AdminRoleId = role.Id,
                    Capability = capability,
                    CreatedAt = now,
                });
            }

            _dbContext.AdminRoles.Add(role);
            existing[role.Code] = role;
        }

        return existing;
    }

    private async Task BackfillAssignmentsAsync(
        IReadOnlyDictionary<string, AdminRoleDefinition> roles,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var unassigned = await _dbContext.AdminUsers
            .Where(admin => !admin.RoleAssignments.Any())
            .Select(admin => new { admin.Id, admin.Role })
            .ToListAsync(cancellationToken);

        foreach (var admin in unassigned)
        {
            var code = AdminRoleTemplates.CodeForLegacyRole(admin.Role);
            if (!roles.TryGetValue(code, out var role))
            {
                continue;
            }

            _dbContext.AdminUserRoles.Add(new AdminUserRoleAssignment
            {
                AdminUserId = admin.Id,
                AdminRoleId = role.Id,
                AssignedAt = now,
                AssignedByAdminUserId = null,
            });
        }
    }
}
