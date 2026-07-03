using System.Security.Claims;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Auth;

public sealed class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public CurrentUser Current
    {
        get
        {
            var user = _httpContextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated != true)
            {
                return new CurrentUser(null, null, Array.Empty<string>());
            }

            var idValue = user.FindFirstValue(ClaimTypes.NameIdentifier);
            _ = Guid.TryParse(idValue, out var userId);

            var roles = user.FindAll(ClaimTypes.Role)
                .Select(claim => claim.Value)
                .Where(role => !string.IsNullOrWhiteSpace(role))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return new CurrentUser(
                userId == Guid.Empty ? null : userId,
                user.FindFirstValue(ClaimTypes.Email),
                roles);
        }
    }
}
