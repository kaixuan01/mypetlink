using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

public sealed record GoogleLoginRequest([Required] string IdToken);

// Development-only test login. `Role` is "Owner" (default) or "Admin".
public sealed record DevTestLoginRequest(
    [EmailAddress, MaxLength(160)] string? Email,
    [MaxLength(16)] string? Role);

public sealed record RefreshTokenRequest([Required] string RefreshToken);

public sealed record LogoutRequest(string? RefreshToken);

public sealed record AuthTokenResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn,
    CurrentUserSummaryResponse User,
    OwnerProfileSummaryResponse? OwnerProfile);

public sealed record TokenRefreshResponse(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn);

public sealed record CurrentUserSummaryResponse(
    Guid Id,
    string Email,
    string DisplayName,
    IReadOnlyCollection<string> Roles,
    string Status);

public sealed record OwnerProfileSummaryResponse(
    Guid Id,
    string OwnerDisplayName,
    string PlanCode,
    string PlanName);

public sealed record CurrentSessionResponse(
    CurrentUserSummaryResponse User,
    OwnerProfileSummaryResponse? OwnerProfile,
    AdminProfileSummaryResponse? Admin);

public sealed record AdminProfileSummaryResponse(string Role, bool IsActive);

public sealed record AdminAuthCheckResponse(
    CurrentUserSummaryResponse User,
    AdminProfileSummaryResponse Admin);
