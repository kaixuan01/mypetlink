using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

// --- Capability catalogue ----------------------------------------------------

public sealed record AdminCapabilityResponse(
    string Key,
    string Name,
    string Description,
    bool IsWriteAccess,
    bool IsSensitive);

public sealed record AdminCapabilityModuleResponse(
    string Key,
    string Name,
    string Description,
    IReadOnlyCollection<AdminCapabilityResponse> Capabilities);

// --- Roles -------------------------------------------------------------------

public sealed record AdminRoleSummaryResponse(
    Guid Id,
    string Code,
    string Name,
    string Description,
    bool IsSystemRole,
    bool GrantsAllCapabilities,
    int SortOrder,
    int CapabilityCount,
    int AssignedUserCount,
    bool CanEdit,
    bool CanDelete,
    bool CanAssign,
    DateTimeOffset UpdatedAt,
    string RowVersion);

public sealed record AdminRoleDetailResponse(
    AdminRoleSummaryResponse Role,
    IReadOnlyCollection<string> Capabilities,
    IReadOnlyCollection<AdminCapabilityModuleResponse> CapabilitiesByModule,
    IReadOnlyCollection<AdminRoleMemberResponse> Members);

public sealed record AdminRoleMemberResponse(
    Guid AdminUserId,
    Guid UserId,
    string Email,
    string DisplayName,
    bool IsActive);

public sealed record CreateAdminRoleRequest(
    [property: Required, StringLength(120, MinimumLength = 2)] string Name,
    [property: StringLength(600)] string? Description,
    IReadOnlyCollection<string>? Capabilities);

public sealed record UpdateAdminRoleRequest(
    [property: Required, StringLength(120, MinimumLength = 2)] string Name,
    [property: StringLength(600)] string? Description,
    IReadOnlyCollection<string>? Capabilities,
    [property: Required] string RowVersion);

// --- Admin users -------------------------------------------------------------

public sealed record AdminAccessUserResponse(
    Guid AdminUserId,
    Guid UserId,
    string Email,
    string DisplayName,
    bool IsActive,
    DateTimeOffset? DisabledAt,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset CreatedAt,
    bool IsSuperAdmin,
    bool IsSelf,
    bool CanManage,
    IReadOnlyCollection<AdminAccessUserRoleResponse> Roles,
    int CapabilityCount,
    string RowVersion);

public sealed record AdminAccessUserRoleResponse(
    Guid RoleId,
    string Code,
    string Name,
    bool GrantsAllCapabilities);

public sealed record AdminAccessUserDetailResponse(
    AdminAccessUserResponse User,
    IReadOnlyCollection<string> EffectiveCapabilities,
    IReadOnlyCollection<AdminCapabilityModuleResponse> EffectiveCapabilitiesByModule,
    IReadOnlyCollection<AdminRoleSummaryResponse> AssignableRoles);

public sealed record UpdateAdminUserRolesRequest(
    IReadOnlyCollection<Guid>? RoleIds,
    [property: Required] string RowVersion);

public sealed record SetAdminUserActiveRequest(
    [property: Required] string RowVersion);

/// <summary>
/// What the signed-in operator may do, as resolved by the API. The Admin Portal
/// renders navigation and actions from this; it is a reflection of the decision
/// the API will make, never the decision itself.
/// </summary>
public sealed record AdminAccessSummaryResponse(
    bool IsSuperAdmin,
    IReadOnlyCollection<AdminAccessUserRoleResponse> Roles,
    IReadOnlyCollection<string> Capabilities);
