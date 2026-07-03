namespace MyPetLink.Api.Auth;

public static class RoleConstants
{
    public const string Admin = "Admin";
    public const string Owner = "Owner";
}

public static class AuthorizationPolicies
{
    public const string Admin = "AdminOnly";
    public const string Owner = "OwnerOnly";
}
