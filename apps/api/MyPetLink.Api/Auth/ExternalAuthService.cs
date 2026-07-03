using MyPetLink.Api.Common;

namespace MyPetLink.Api.Auth;

public sealed class ExternalAuthService : IExternalAuthService
{
    private readonly IReadOnlyDictionary<string, IExternalTokenValidator> _validators;

    public ExternalAuthService(IEnumerable<IExternalTokenValidator> validators)
    {
        _validators = validators.ToDictionary(
            validator => validator.Provider,
            StringComparer.OrdinalIgnoreCase);
    }

    public Task<ExternalTokenUser> ValidateAsync(
        string provider,
        string token,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(provider)
            || !_validators.TryGetValue(provider, out var validator))
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "unsupported_auth_provider",
                "This login provider is not supported yet.");
        }

        return validator.ValidateAsync(token, cancellationToken);
    }
}
