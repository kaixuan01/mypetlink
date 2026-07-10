namespace MyPetLink.Api.Auth;

public sealed record ExternalTokenUser(
    string Provider,
    string SubjectId,
    string Email,
    bool EmailVerified,
    string? DisplayName);

public sealed record AuthClientContext(string? IpAddress, string? UserAgent);

public interface IExternalTokenValidator
{
    string Provider { get; }

    Task<ExternalTokenUser> ValidateAsync(string token, CancellationToken cancellationToken);
}

public interface IExternalAuthService
{
    Task<ExternalTokenUser> ValidateAsync(
        string provider,
        string token,
        CancellationToken cancellationToken);
}
