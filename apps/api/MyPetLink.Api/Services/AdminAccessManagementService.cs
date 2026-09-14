using Microsoft.EntityFrameworkCore;
using System.Data;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IAdminAccessManagementService
{
    Task<AdminAccessSummaryResponse> GetMyAccessAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<AdminCapabilityModuleResponse>> GetCapabilityCatalogAsync(
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminAccessUserResponse> Items, int Total)> ListUsersAsync(
        int page, int pageSize, string? search, string? status, Guid? roleId,
        CancellationToken cancellationToken = default);

    Task<AdminAccessUserDetailResponse> GetUserAsync(
        Guid adminUserId, CancellationToken cancellationToken = default);

    Task<AdminAccessUserDetailResponse> UpdateUserRolesAsync(
        Guid adminUserId, UpdateAdminUserRolesRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminAccessUserDetailResponse> SetUserActiveAsync(
        Guid adminUserId, bool isActive, SetAdminUserActiveRequest request,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<AdminRoleSummaryResponse>> ListRolesAsync(
        CancellationToken cancellationToken = default);

    Task<AdminRoleDetailResponse> GetRoleAsync(Guid roleId, CancellationToken cancellationToken = default);

    Task<AdminRoleDetailResponse> CreateRoleAsync(
        CreateAdminRoleRequest request, CancellationToken cancellationToken = default);

    Task<AdminRoleDetailResponse> UpdateRoleAsync(
        Guid roleId, UpdateAdminRoleRequest request, CancellationToken cancellationToken = default);

    Task DeleteRoleAsync(Guid roleId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Access Management: who can use the Admin Portal, and the roles that decide
/// what each of them may do.
///
/// Every method re-resolves the caller's own access from the database and
/// enforces the escalation rules below on the server. The Admin Portal hides
/// what someone cannot do, but nothing here trusts that it did:
///
/// <list type="number">
/// <item>Nobody can change their own roles or switch off their own access.</item>
/// <item>Nobody can grant a capability they do not themselves hold.</item>
/// <item>Only a holder of an all-access role can grant or remove one.</item>
/// <item>The last administrator with all-access can never be switched off or
/// have that role removed.</item>
/// <item>Built-in roles cannot be deleted, and the all-access role's granted
/// capabilities cannot be edited.</item>
/// <item>Only capabilities in the catalogue are accepted; anything else in a
/// request is rejected rather than stored.</item>
/// </list>
/// </summary>
public sealed class AdminAccessManagementService : IAdminAccessManagementService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAdminAccessResolver _accessResolver;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public AdminAccessManagementService(
        MyPetLinkDbContext dbContext,
        IAdminAccessResolver accessResolver,
        IAuditLogService auditLogService,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _accessResolver = accessResolver;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    // --- Current operator -----------------------------------------------------

    public async Task<AdminAccessSummaryResponse> GetMyAccessAsync(
        CancellationToken cancellationToken = default)
    {
        var access = await _accessResolver.ResolveCurrentAsync(cancellationToken);

        return new AdminAccessSummaryResponse(
            access.IsSuperAdmin,
            access.Roles.Select(ToRoleRef).ToArray(),
            access.EffectiveCapabilities());
    }

    public async Task<IReadOnlyCollection<AdminCapabilityModuleResponse>> GetCapabilityCatalogAsync(
        CancellationToken cancellationToken = default)
    {
        await RequireAsync(AdminCapabilities.AdminRolesView, cancellationToken);
        return ToModules(AdminCapabilityCatalog.AllKeys);
    }

    // --- Admin users ----------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminAccessUserResponse> Items, int Total)> ListUsersAsync(
        int page,
        int pageSize,
        string? search,
        string? status,
        Guid? roleId,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminUsersView, cancellationToken);

        var query = _dbContext.AdminUsers.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(admin =>
                admin.User.Email.Contains(term) || admin.User.DisplayName.Contains(term));
        }

        query = status?.Trim().ToLowerInvariant() switch
        {
            "active" => query.Where(admin => admin.IsActive && admin.DisabledAt == null),
            "inactive" => query.Where(admin => !admin.IsActive || admin.DisabledAt != null),
            null or "" or "all" => query,
            _ => throw Validation("status", "Choose Active, Inactive or All."),
        };

        if (roleId.HasValue)
        {
            query = query.Where(admin =>
                admin.RoleAssignments.Any(assignment => assignment.AdminRoleId == roleId.Value));
        }

        var total = await query.CountAsync(cancellationToken);

        var rows = await query
            .OrderByDescending(admin => admin.IsActive && admin.DisabledAt == null)
            .ThenBy(admin => admin.User.DisplayName)
            .ThenBy(admin => admin.User.Email)
            .Skip(Math.Max(page - 1, 0) * pageSize)
            .Take(pageSize)
            .Select(AdminUserProjection())
            .ToListAsync(cancellationToken);

        var canManage = access.Has(AdminCapabilities.AdminUsersManage);
        return (rows.Select(row => ToUserResponse(row, access, canManage)).ToArray(), total);
    }

    public async Task<AdminAccessUserDetailResponse> GetUserAsync(
        Guid adminUserId,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminUsersView, cancellationToken);
        return await BuildUserDetailAsync(adminUserId, access, cancellationToken);
    }

    public Task<AdminAccessUserDetailResponse> UpdateUserRolesAsync(
        Guid adminUserId,
        UpdateAdminUserRolesRequest request,
        CancellationToken cancellationToken = default)
        => WithUserAccessMutationLockAsync(
            () => UpdateUserRolesCoreAsync(adminUserId, request, cancellationToken),
            cancellationToken);

    private async Task<AdminAccessUserDetailResponse> UpdateUserRolesCoreAsync(
        Guid adminUserId,
        UpdateAdminUserRolesRequest request,
        CancellationToken cancellationToken)
    {
        var access = await RequireAsync(AdminCapabilities.AdminUsersManage, cancellationToken);
        var target = await LoadAdminForUpdateAsync(adminUserId, cancellationToken);

        // Rule 1: an operator can never rewrite their own access. Someone else
        // with the same permission has to make the change, which keeps both
        // self-promotion and accidental self-lockout impossible.
        if (target.Id == access.AdminUserId)
        {
            throw Forbidden(
                "You cannot change your own roles. Ask another administrator who manages "
                + "access to make this change.");
        }

        var requestedIds = (request.RoleIds ?? []).Distinct().ToArray();
        var requestedRoles = await LoadRolesAsync(requestedIds, cancellationToken);

        var previousRoles = target.RoleAssignments
            .Select(assignment => assignment.AdminRole)
            .ToArray();

        var addedRoles = requestedRoles
            .Where(role => previousRoles.All(existing => existing.Id != role.Id))
            .ToArray();
        var removedRoles = previousRoles
            .Where(role => requestedRoles.All(requested => requested.Id != role.Id))
            .ToArray();

        if (addedRoles.Length == 0 && removedRoles.Length == 0)
        {
            ApplyConcurrency(target, request.RowVersion);
            return await BuildUserDetailAsync(adminUserId, access, cancellationToken);
        }

        foreach (var role in addedRoles.Concat(removedRoles))
        {
            GuardRoleIsAssignableBy(access, role);
        }

        // Rule 4: the business must always keep one operator who can restore
        // everyone else's access.
        if (removedRoles.Any(role => role.GrantsAllCapabilities))
        {
            await GuardLastSuperAdminAsync(target.Id, cancellationToken);
        }

        // Added and removed through the set rather than the navigation
        // collection: these rows carry an application-assigned key, and a row
        // reached through a tracked parent with a key already set is treated as
        // an update rather than an insert.
        _dbContext.AdminUserRoles.RemoveRange(target.RoleAssignments);
        target.RoleAssignments.Clear();

        foreach (var role in requestedRoles)
        {
            _dbContext.AdminUserRoles.Add(new AdminUserRoleAssignment
            {
                AdminUserId = target.Id,
                AdminRoleId = role.Id,
                AssignedAt = _timeProvider.GetUtcNow(),
                AssignedByAdminUserId = access.AdminUserId,
            });
        }

        // Keep the legacy single-role column meaningful for a rollback window.
        target.Role = LegacyRoleFor(requestedRoles);
        target.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(
            access.AdminUserId,
            ActorType.Admin,
            "admin-access.user.roles-changed",
            nameof(AdminUser),
            target.Id,
            new { Roles = previousRoles.Select(role => role.Code).OrderBy(code => code).ToArray() },
            new { Roles = requestedRoles.Select(role => role.Code).OrderBy(code => code).ToArray() });

        ApplyConcurrency(target, request.RowVersion);
        await SaveAsync(cancellationToken);

        return await BuildUserDetailAsync(adminUserId, access, cancellationToken);
    }

    public Task<AdminAccessUserDetailResponse> SetUserActiveAsync(
        Guid adminUserId,
        bool isActive,
        SetAdminUserActiveRequest request,
        CancellationToken cancellationToken = default)
        => WithUserAccessMutationLockAsync(
            () => SetUserActiveCoreAsync(adminUserId, isActive, request, cancellationToken),
            cancellationToken);

    private async Task<AdminAccessUserDetailResponse> SetUserActiveCoreAsync(
        Guid adminUserId,
        bool isActive,
        SetAdminUserActiveRequest request,
        CancellationToken cancellationToken)
    {
        var access = await RequireAsync(AdminCapabilities.AdminUsersManage, cancellationToken);
        var target = await LoadAdminForUpdateAsync(adminUserId, cancellationToken);

        if (target.Id == access.AdminUserId)
        {
            throw Forbidden(
                "You cannot change your own Admin Portal access. Ask another administrator "
                + "who manages access to make this change.");
        }

        var holdsAllAccess = target.RoleAssignments.Any(a => a.AdminRole.GrantsAllCapabilities);
        if (holdsAllAccess && !access.IsSuperAdmin)
        {
            throw Forbidden(
                "Only a Super Admin can change the access of another Super Admin.");
        }

        if (!isActive && holdsAllAccess)
        {
            await GuardLastSuperAdminAsync(target.Id, cancellationToken);
        }

        var wasActive = target.IsActive && target.DisabledAt is null;
        if (wasActive == isActive)
        {
            ApplyConcurrency(target, request.RowVersion);
            return await BuildUserDetailAsync(adminUserId, access, cancellationToken);
        }

        var now = _timeProvider.GetUtcNow();
        target.IsActive = isActive;
        target.DisabledAt = isActive ? null : now;
        target.DisabledByAdminUserId = isActive ? null : access.AdminUserId;
        target.UpdatedAt = now;

        _auditLogService.Append(
            access.AdminUserId,
            ActorType.Admin,
            isActive ? "admin-access.user.activated" : "admin-access.user.deactivated",
            nameof(AdminUser),
            target.Id,
            new { IsActive = wasActive },
            new { IsActive = isActive });

        ApplyConcurrency(target, request.RowVersion);
        await SaveAsync(cancellationToken);

        return await BuildUserDetailAsync(adminUserId, access, cancellationToken);
    }

    // --- Roles ----------------------------------------------------------------

    public async Task<IReadOnlyCollection<AdminRoleSummaryResponse>> ListRolesAsync(
        CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminRolesView, cancellationToken);

        var roles = await _dbContext.AdminRoles
            .AsNoTracking()
            .Include(role => role.Capabilities)
            .OrderBy(role => role.SortOrder)
            .ThenBy(role => role.Name)
            .ToListAsync(cancellationToken);

        var memberCounts = await _dbContext.AdminUserRoles
            .AsNoTracking()
            .GroupBy(assignment => assignment.AdminRoleId)
            .Select(group => new { RoleId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.RoleId, item => item.Count, cancellationToken);

        return roles
            .Select(role => ToRoleSummary(role, access, memberCounts.GetValueOrDefault(role.Id)))
            .ToArray();
    }

    public async Task<AdminRoleDetailResponse> GetRoleAsync(
        Guid roleId,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminRolesView, cancellationToken);
        return await BuildRoleDetailAsync(roleId, access, cancellationToken);
    }

    public async Task<AdminRoleDetailResponse> CreateRoleAsync(
        CreateAdminRoleRequest request,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminRolesManage, cancellationToken);

        var name = (request.Name ?? "").Trim();
        if (name.Length < 2)
        {
            throw Validation("name", "Enter a name for this role.");
        }

        var code = await BuildUniqueCodeAsync(name, cancellationToken);
        var capabilities = ValidateCapabilities(request.Capabilities, access);
        var now = _timeProvider.GetUtcNow();

        var role = new AdminRoleDefinition
        {
            Code = code,
            Name = name,
            Description = (request.Description ?? "").Trim(),
            IsSystemRole = false,
            GrantsAllCapabilities = false,
            SortOrder = 1000,
            CreatedAt = now,
            UpdatedAt = now,
        };

        foreach (var capability in capabilities)
        {
            role.Capabilities.Add(new AdminRoleCapability
            {
                AdminRoleId = role.Id,
                Capability = capability,
                CreatedAt = now,
            });
        }

        _dbContext.AdminRoles.Add(role);

        _auditLogService.Append(
            access.AdminUserId,
            ActorType.Admin,
            "admin-access.role.created",
            nameof(AdminRoleDefinition),
            role.Id,
            null,
            new { role.Code, role.Name, Capabilities = capabilities });

        await SaveAsync(cancellationToken);
        return await BuildRoleDetailAsync(role.Id, access, cancellationToken);
    }

    public async Task<AdminRoleDetailResponse> UpdateRoleAsync(
        Guid roleId,
        UpdateAdminRoleRequest request,
        CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminRolesManage, cancellationToken);

        var role = await _dbContext.AdminRoles
            .Include(item => item.Capabilities)
            .SingleOrDefaultAsync(item => item.Id == roleId, cancellationToken)
            ?? throw NotFoundRole();

        // Rule 5: the all-access role's meaning is fixed. Editing its grants
        // would either silently reduce founder access or hand out everything.
        if (role.GrantsAllCapabilities)
        {
            throw Forbidden(
                $"{role.Name} always has full access, so its permissions cannot be edited. "
                + "To limit what someone can do, give them a different role.");
        }

        var name = (request.Name ?? "").Trim();
        if (name.Length < 2)
        {
            throw Validation("name", "Enter a name for this role.");
        }

        var requested = ValidateCapabilities(request.Capabilities, access);
        var previous = role.Capabilities
            .Select(capability => capability.Capability)
            .OrderBy(capability => capability, StringComparer.Ordinal)
            .ToArray();

        // Rule 2 also applies to what is being taken away: an operator cannot
        // remove a capability they do not hold, so they cannot quietly strip a
        // role that protects work they have no visibility of.
        var changed = previous.Except(requested, StringComparer.Ordinal)
            .Concat(requested.Except(previous, StringComparer.Ordinal));
        foreach (var capability in changed)
        {
            GuardCanDelegate(access, capability);
        }

        var now = _timeProvider.GetUtcNow();
        var previousName = role.Name;
        var previousDescription = role.Description;
        role.Name = name;
        role.Description = (request.Description ?? "").Trim();
        role.UpdatedAt = now;

        foreach (var existing in role.Capabilities.ToArray())
        {
            if (!requested.Contains(existing.Capability))
            {
                role.Capabilities.Remove(existing);
                _dbContext.AdminRoleCapabilities.Remove(existing);
            }
        }

        foreach (var capability in requested)
        {
            if (role.Capabilities.All(item => item.Capability != capability))
            {
                // Added through the set, for the same reason as above.
                _dbContext.AdminRoleCapabilities.Add(new AdminRoleCapability
                {
                    AdminRoleId = role.Id,
                    Capability = capability,
                    CreatedAt = now,
                });
            }
        }

        _auditLogService.Append(
            access.AdminUserId,
            ActorType.Admin,
            "admin-access.role.updated",
            nameof(AdminRoleDefinition),
            role.Id,
            new { Name = previousName, Description = previousDescription, Capabilities = previous },
            new { role.Name, role.Description, Capabilities = requested });

        ApplyConcurrency(role, request.RowVersion);
        await SaveAsync(cancellationToken);
        return await BuildRoleDetailAsync(role.Id, access, cancellationToken);
    }

    public async Task DeleteRoleAsync(Guid roleId, CancellationToken cancellationToken = default)
    {
        var access = await RequireAsync(AdminCapabilities.AdminRolesManage, cancellationToken);

        var role = await _dbContext.AdminRoles
            .Include(item => item.Capabilities)
            .Include(item => item.Assignments)
            .SingleOrDefaultAsync(item => item.Id == roleId, cancellationToken)
            ?? throw NotFoundRole();

        if (role.IsSystemRole)
        {
            throw Forbidden(
                $"{role.Name} is a built-in role and cannot be deleted. You can change the "
                + "permissions it grants, or move people to a different role instead.");
        }

        if (role.Assignments.Count > 0)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "role_in_use",
                $"{role.Name} is still assigned to {role.Assignments.Count} "
                + $"{(role.Assignments.Count == 1 ? "person" : "people")}. "
                + "Remove it from them before deleting it.");
        }

        foreach (var capability in role.Capabilities)
        {
            GuardCanDelegate(access, capability.Capability);
        }

        _dbContext.AdminRoleCapabilities.RemoveRange(role.Capabilities);
        _dbContext.AdminRoles.Remove(role);

        _auditLogService.Append(
            access.AdminUserId,
            ActorType.Admin,
            "admin-access.role.deleted",
            nameof(AdminRoleDefinition),
            role.Id,
            new
            {
                role.Code,
                role.Name,
                Capabilities = role.Capabilities.Select(item => item.Capability).ToArray(),
            },
            null);

        await SaveAsync(cancellationToken);
    }

    // --- Guards ---------------------------------------------------------------

    private async Task<AdminAccessSnapshot> RequireAsync(
        string capability,
        CancellationToken cancellationToken)
    {
        var access = await _accessResolver.ResolveCurrentAsync(cancellationToken);

        // The controller policy has already refused anyone without this
        // capability. Re-checking here keeps the rule true for any other caller
        // of this service and makes the guarantee local to the operation.
        if (!access.Has(capability))
        {
            throw Forbidden("You do not have permission to do this.");
        }

        return access;
    }

    /// <summary>
    /// Rules 2 and 3: you may only hand out access you hold yourself, and an
    /// all-access role may only be granted by someone who already has one.
    /// </summary>
    private static void GuardRoleIsAssignableBy(AdminAccessSnapshot access, AdminRoleDefinition role)
    {
        if (role.GrantsAllCapabilities)
        {
            if (!access.IsSuperAdmin)
            {
                throw Forbidden(
                    $"Only a Super Admin can give someone the {role.Name} role or take it away.");
            }

            return;
        }

        foreach (var capability in role.Capabilities)
        {
            GuardCanDelegate(access, capability.Capability);
        }
    }

    private static void GuardCanDelegate(AdminAccessSnapshot access, string capability)
    {
        if (access.Has(capability))
        {
            return;
        }

        var name = AdminCapabilityCatalog.Find(capability)?.Name ?? capability;
        throw Forbidden(
            $"You cannot grant or remove \"{name}\" because you do not have it yourself.");
    }

    /// <summary>
    /// Rule 4, as a backstop. In practice the self-modification rules already
    /// make it impossible to reach a state with no active Super Admin: nobody
    /// can demote or switch off themselves, and only a Super Admin can change
    /// another Super Admin — so whoever is making the change is always still
    /// there afterwards. This check stays because that reasoning depends on
    /// those two rules, and a future bulk or automated path could reach here
    /// without them.
    /// </summary>
    private async Task GuardLastSuperAdminAsync(Guid excludedAdminUserId, CancellationToken cancellationToken)
    {
        var remaining = await _dbContext.AdminUsers
            .AsNoTracking()
            .CountAsync(
                admin =>
                    admin.Id != excludedAdminUserId
                    && admin.IsActive
                    && admin.DisabledAt == null
                    && admin.User.Status == UserStatus.Active
                    && admin.User.DeletedAt == null
                    && admin.RoleAssignments.Any(assignment => assignment.AdminRole.GrantsAllCapabilities),
                cancellationToken);

        if (remaining == 0)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "last_super_admin",
                "This is the only active Super Admin. Give Super Admin access to someone else "
                + "first, so the business is never left without it.");
        }
    }

    private static IReadOnlyList<string> ValidateCapabilities(
        IReadOnlyCollection<string>? requested,
        AdminAccessSnapshot access)
    {
        var submitted = (requested ?? [])
            .Where(capability => !string.IsNullOrWhiteSpace(capability))
            .Select(capability => capability.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        // Rule 6: an unrecognised key is refused rather than quietly dropped,
        // so a request that asks for something that does not exist never looks
        // to the caller like it succeeded.
        var unknown = submitted.Where(capability => !AdminCapabilityCatalog.IsKnown(capability)).ToArray();
        if (unknown.Length > 0)
        {
            throw Validation(
                "capabilities",
                "Some of the selected permissions are no longer available. Reload the page and try again.");
        }

        var normalized = AdminCapabilityCatalog.Normalize(submitted);
        foreach (var capability in normalized)
        {
            GuardCanDelegate(access, capability);
        }

        return normalized;
    }

    // --- Loading and projection ----------------------------------------------

    private async Task<AdminUser> LoadAdminForUpdateAsync(
        Guid adminUserId,
        CancellationToken cancellationToken) =>
        await _dbContext.AdminUsers
            .Include(admin => admin.User)
            .Include(admin => admin.RoleAssignments)
                .ThenInclude(assignment => assignment.AdminRole)
                    .ThenInclude(role => role.Capabilities)
            .SingleOrDefaultAsync(admin => admin.Id == adminUserId, cancellationToken)
        ?? throw new ApiException(
            StatusCodes.Status404NotFound,
            "not_found",
            "This admin user was not found.");

    private async Task<IReadOnlyList<AdminRoleDefinition>> LoadRolesAsync(
        IReadOnlyCollection<Guid> roleIds,
        CancellationToken cancellationToken)
    {
        if (roleIds.Count == 0)
        {
            return [];
        }

        var roles = await _dbContext.AdminRoles
            .Include(role => role.Capabilities)
            .Where(role => roleIds.Contains(role.Id))
            .ToListAsync(cancellationToken);

        if (roles.Count != roleIds.Count)
        {
            throw Validation("roleIds", "One of the selected roles no longer exists. Reload the page and try again.");
        }

        return roles;
    }

    private async Task<AdminAccessUserDetailResponse> BuildUserDetailAsync(
        Guid adminUserId,
        AdminAccessSnapshot access,
        CancellationToken cancellationToken)
    {
        var row = await _dbContext.AdminUsers
            .AsNoTracking()
            .Where(admin => admin.Id == adminUserId)
            .Select(AdminUserProjection())
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status404NotFound,
                "not_found",
                "This admin user was not found.");

        var canManage = access.Has(AdminCapabilities.AdminUsersManage);
        var user = ToUserResponse(row, access, canManage);

        var effective = row.GrantsAll
            ? AdminCapabilityCatalog.AllKeys
            : AdminCapabilityCatalog.Normalize(row.Capabilities);

        var assignable = canManage
            ? (await ListRolesAsync(cancellationToken)).Where(role => role.CanAssign).ToArray()
            : [];

        return new AdminAccessUserDetailResponse(
            user,
            effective,
            ToModules(effective),
            assignable);
    }

    private async Task<AdminRoleDetailResponse> BuildRoleDetailAsync(
        Guid roleId,
        AdminAccessSnapshot access,
        CancellationToken cancellationToken)
    {
        var role = await _dbContext.AdminRoles
            .AsNoTracking()
            .Include(item => item.Capabilities)
            .SingleOrDefaultAsync(item => item.Id == roleId, cancellationToken)
            ?? throw NotFoundRole();

        var members = await _dbContext.AdminUserRoles
            .AsNoTracking()
            .Where(assignment => assignment.AdminRoleId == roleId)
            .OrderBy(assignment => assignment.AdminUser.User.DisplayName)
            .Select(assignment => new AdminRoleMemberResponse(
                assignment.AdminUserId,
                assignment.AdminUser.UserId,
                assignment.AdminUser.User.Email,
                assignment.AdminUser.User.DisplayName,
                assignment.AdminUser.IsActive && assignment.AdminUser.DisabledAt == null))
            .ToListAsync(cancellationToken);

        var capabilities = role.GrantsAllCapabilities
            ? AdminCapabilityCatalog.AllKeys
            : AdminCapabilityCatalog.Normalize(
                role.Capabilities.Select(capability => capability.Capability));

        return new AdminRoleDetailResponse(
            ToRoleSummary(role, access, members.Count),
            capabilities,
            ToModules(capabilities),
            members);
    }

    private static System.Linq.Expressions.Expression<Func<AdminUser, AdminUserRow>> AdminUserProjection() =>
        admin => new AdminUserRow
        {
            AdminUserId = admin.Id,
            UserId = admin.UserId,
            Email = admin.User.Email,
            DisplayName = admin.User.DisplayName,
            IsActive = admin.IsActive && admin.DisabledAt == null,
            DisabledAt = admin.DisabledAt,
            LastLoginAt = admin.User.LastLoginAt,
            CreatedAt = admin.CreatedAt,
            RowVersion = admin.RowVersion,
            GrantsAll = admin.RoleAssignments.Any(a => a.AdminRole.GrantsAllCapabilities),
            Roles = admin.RoleAssignments
                .OrderBy(a => a.AdminRole.SortOrder)
                .Select(a => new AdminAccessUserRoleResponse(
                    a.AdminRole.Id,
                    a.AdminRole.Code,
                    a.AdminRole.Name,
                    a.AdminRole.GrantsAllCapabilities))
                .ToList(),
            Capabilities = admin.RoleAssignments
                .SelectMany(a => a.AdminRole.Capabilities.Select(c => c.Capability))
                .ToList(),
        };

    private sealed class AdminUserRow
    {
        public Guid AdminUserId { get; init; }
        public Guid UserId { get; init; }
        public string Email { get; init; } = "";
        public string DisplayName { get; init; } = "";
        public bool IsActive { get; init; }
        public DateTimeOffset? DisabledAt { get; init; }
        public DateTimeOffset? LastLoginAt { get; init; }
        public DateTimeOffset CreatedAt { get; init; }
        public byte[] RowVersion { get; init; } = [];
        public bool GrantsAll { get; init; }
        public List<AdminAccessUserRoleResponse> Roles { get; init; } = [];
        public List<string> Capabilities { get; init; } = [];
    }

    private static AdminAccessUserResponse ToUserResponse(
        AdminUserRow row,
        AdminAccessSnapshot access,
        bool canManage)
    {
        var isSelf = row.AdminUserId == access.AdminUserId;
        var effectiveCount = row.GrantsAll
            ? AdminCapabilityCatalog.AllKeys.Count
            : AdminCapabilityCatalog.Normalize(row.Capabilities).Count;

        return new AdminAccessUserResponse(
            row.AdminUserId,
            row.UserId,
            row.Email,
            row.DisplayName,
            row.IsActive,
            row.DisabledAt,
            row.LastLoginAt,
            row.CreatedAt,
            row.GrantsAll,
            isSelf,
            // Mirrors the server rules so the portal shows the same conclusion:
            // not yourself, and a Super Admin can only be changed by one.
            canManage && !isSelf && (!row.GrantsAll || access.IsSuperAdmin),
            row.Roles,
            effectiveCount,
            Convert.ToBase64String(row.RowVersion));
    }

    private static AdminRoleSummaryResponse ToRoleSummary(
        AdminRoleDefinition role,
        AdminAccessSnapshot access,
        int assignedUserCount)
    {
        var canManageRoles = access.Has(AdminCapabilities.AdminRolesManage);
        var capabilities = role.Capabilities.Select(item => item.Capability).ToArray();
        var canDelegate = role.GrantsAllCapabilities
            ? access.IsSuperAdmin
            : capabilities.All(access.Has);

        return new AdminRoleSummaryResponse(
            role.Id,
            role.Code,
            role.Name,
            role.Description,
            role.IsSystemRole,
            role.GrantsAllCapabilities,
            role.SortOrder,
            role.GrantsAllCapabilities
                ? AdminCapabilityCatalog.AllKeys.Count
                : AdminCapabilityCatalog.Normalize(capabilities).Count,
            assignedUserCount,
            CanEdit: canManageRoles && !role.GrantsAllCapabilities && canDelegate,
            CanDelete: canManageRoles && !role.IsSystemRole && assignedUserCount == 0 && canDelegate,
            CanAssign: access.Has(AdminCapabilities.AdminUsersManage) && canDelegate,
            role.UpdatedAt,
            Convert.ToBase64String(role.RowVersion));
    }

    private static AdminAccessUserRoleResponse ToRoleRef(AdminAccessRole role) =>
        new(role.Id, role.Code, role.Name, role.GrantsAllCapabilities);

    private static IReadOnlyCollection<AdminCapabilityModuleResponse> ToModules(
        IReadOnlyCollection<string> capabilities)
    {
        var granted = capabilities.ToHashSet(StringComparer.Ordinal);

        return AdminCapabilityCatalog.Modules
            .Select(module => new AdminCapabilityModuleResponse(
                module.Key,
                module.Name,
                module.Description,
                module.Capabilities
                    .Where(capability => granted.Contains(capability.Key))
                    .Select(capability => new AdminCapabilityResponse(
                        capability.Key,
                        capability.Name,
                        capability.Description,
                        capability.IsWriteAccess,
                        capability.IsSensitive))
                    .ToArray()))
            .Where(module => module.Capabilities.Count > 0)
            .ToArray();
    }

    /// <summary>
    /// Keeps the legacy single-role column roughly meaningful during the
    /// rollback window by recording the broadest role the person now holds.
    /// Nothing authorizes on it.
    /// </summary>
    private static AdminRole LegacyRoleFor(IReadOnlyCollection<AdminRoleDefinition> roles)
    {
        if (roles.Any(role => role.GrantsAllCapabilities))
        {
            return AdminRole.SuperAdmin;
        }

        if (roles.Any(role => role.Capabilities.Any(c => c.Capability == AdminCapabilities.SalesManage)))
        {
            return AdminRole.Admin;
        }

        if (roles.Any(role => role.Capabilities.Any(c => c.Capability == AdminCapabilities.SalesView)))
        {
            return AdminRole.Operations;
        }

        return AdminRole.OwnerSupport;
    }

    private async Task<string> BuildUniqueCodeAsync(string name, CancellationToken cancellationToken)
    {
        var slug = new string(name.ToLowerInvariant()
            .Select(character => char.IsLetterOrDigit(character) ? character : '-')
            .ToArray());

        while (slug.Contains("--", StringComparison.Ordinal))
        {
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        }

        slug = slug.Trim('-');
        if (slug.Length == 0)
        {
            slug = "role";
        }

        slug = slug[..Math.Min(slug.Length, 56)];

        var taken = await _dbContext.AdminRoles
            .AsNoTracking()
            .Where(role => role.Code == slug || role.Code.StartsWith(slug + "-"))
            .Select(role => role.Code)
            .ToListAsync(cancellationToken);

        if (!taken.Contains(slug, StringComparer.Ordinal))
        {
            return slug;
        }

        for (var suffix = 2; suffix < 1000; suffix++)
        {
            var candidate = $"{slug}-{suffix}";
            if (!taken.Contains(candidate, StringComparer.Ordinal))
            {
                return candidate;
            }
        }

        throw Validation("name", "Choose a different name for this role.");
    }

    /// <summary>
    /// Serializes changes to administrator membership across every API process.
    /// Row versions protect one administrator row; this lock protects the
    /// cross-row invariant that at least one active all-access administrator
    /// must remain after two different accounts are changed concurrently.
    /// </summary>
    private async Task<T> WithUserAccessMutationLockAsync<T>(
        Func<Task<T>> action,
        CancellationToken cancellationToken)
    {
        if (!_dbContext.Database.IsSqlServer())
        {
            return await action();
        }

        var connection = _dbContext.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere)
        {
            await _dbContext.Database.OpenConnectionAsync(cancellationToken);
        }

        try
        {
            await using (var acquire = connection.CreateCommand())
            {
                acquire.CommandText = """
                    DECLARE @result int;
                    EXEC @result = sys.sp_getapplock
                        @Resource = N'MyPetLink.AdminAccess.UserMutation',
                        @LockMode = N'Exclusive',
                        @LockOwner = N'Session',
                        @LockTimeout = 15000;
                    SELECT @result;
                    """;

                var result = Convert.ToInt32(
                    await acquire.ExecuteScalarAsync(cancellationToken),
                    System.Globalization.CultureInfo.InvariantCulture);
                if (result < 0)
                {
                    throw ConcurrencyConflict();
                }
            }

            try
            {
                return await action();
            }
            finally
            {
                await using var release = connection.CreateCommand();
                release.CommandText = """
                    EXEC sys.sp_releaseapplock
                        @Resource = N'MyPetLink.AdminAccess.UserMutation',
                        @LockOwner = N'Session';
                    """;
                await release.ExecuteNonQueryAsync(CancellationToken.None);
            }
        }
        finally
        {
            if (openedHere)
            {
                await _dbContext.Database.CloseConnectionAsync();
            }
        }
    }

    private void ApplyConcurrency<T>(T entity, string? rowVersion) where T : class
    {
        if (string.IsNullOrWhiteSpace(rowVersion))
        {
            throw Validation("rowVersion", "Reload the page before saving this change.");
        }

        try
        {
            var supplied = Convert.FromBase64String(rowVersion);
            var property = _dbContext.Entry(entity).Property("RowVersion");
            var current = property.CurrentValue as byte[] ?? [];

            // Compare before an early no-op return as well as relying on the
            // database concurrency predicate during a real update. Otherwise
            // an unchanged stale form can be reported as saved successfully.
            if (!supplied.SequenceEqual(current))
            {
                throw ConcurrencyConflict();
            }

            property.OriginalValue = supplied;
        }
        catch (FormatException)
        {
            throw Validation("rowVersion", "Reload the page and try again.");
        }
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw ConcurrencyConflict();
        }
    }

    private static ApiException ConcurrencyConflict() =>
        new(
            StatusCodes.Status409Conflict,
            "concurrency_conflict",
            "This was changed by another administrator while you were editing. "
            + "Reload the page and try again.");

    private static ApiException Forbidden(string message) =>
        new(StatusCodes.Status403Forbidden, "forbidden", message);

    private static ApiException NotFoundRole() =>
        new(StatusCodes.Status404NotFound, "not_found", "This role was not found.");

    private static ApiException Validation(string field, string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
}
