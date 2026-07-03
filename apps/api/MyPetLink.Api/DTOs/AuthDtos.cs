using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

public sealed record GoogleLoginRequest([Required] string IdToken);

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

public sealed record UpdateOwnerProfileRequest(
    string? OwnerDisplayName,
    string? PhoneE164,
    string? WhatsappE164,
    string? DefaultGeneralArea,
    object? PrivacyDefaults,
    object? NotificationPreferences);
