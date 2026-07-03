namespace MyPetLink.Api.Auth;

public sealed record CurrentUser(
    Guid? UserId,
    string? Email,
    IReadOnlyCollection<string> Roles)
{
    public bool IsAuthenticated => UserId.HasValue;
    public bool IsAdmin => Roles.Contains(RoleConstants.Admin, StringComparer.OrdinalIgnoreCase);
}
