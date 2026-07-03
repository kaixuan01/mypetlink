using Google.Apis.Auth;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Auth;

public sealed class GoogleTokenValidator : IExternalTokenValidator
{
    private static readonly HashSet<string> ValidIssuers = new(StringComparer.Ordinal)
    {
        "accounts.google.com",
        "https://accounts.google.com"
    };

    private readonly GoogleAuthOptions _options;

    public GoogleTokenValidator(IOptions<GoogleAuthOptions> options)
    {
        _options = options.Value;
    }

    public string Provider => ExternalLoginProviders.Google;

    public async Task<ExternalTokenUser> ValidateAsync(string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]>
                {
                    ["idToken"] = ["Google ID token is required."]
                });
        }

        if (string.IsNullOrWhiteSpace(_options.ClientId))
        {
            throw new ApiException(
                StatusCodes.Status500InternalServerError,
                "auth_provider_not_configured",
                "Google login is not configured.");
        }

        cancellationToken.ThrowIfCancellationRequested();

        GoogleJsonWebSignature.Payload payload;

        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(
                token,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = [_options.ClientId]
                });
        }
        catch (InvalidJwtException)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "invalid_google_token",
                "Google login could not be verified.");
        }

        cancellationToken.ThrowIfCancellationRequested();

        if (string.IsNullOrWhiteSpace(payload.Issuer) || !ValidIssuers.Contains(payload.Issuer))
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "invalid_google_token",
                "Google login could not be verified.");
        }

        if (string.IsNullOrWhiteSpace(payload.Subject))
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "invalid_google_token",
                "Google login could not be verified.");
        }

        if (string.IsNullOrWhiteSpace(payload.Email) || payload.EmailVerified != true)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "invalid_google_token",
                "Google login requires a verified email address.");
        }

        return new ExternalTokenUser(
            Provider,
            payload.Subject.Trim(),
            payload.Email.Trim(),
            payload.EmailVerified,
            string.IsNullOrWhiteSpace(payload.Name) ? null : payload.Name.Trim());
    }
}
