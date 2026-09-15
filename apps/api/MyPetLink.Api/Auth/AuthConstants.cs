namespace MyPetLink.Api.Auth;

public static class RoleConstants
{
    public const string Admin = "Admin";
    public const string Owner = "Owner";
}

/// <summary>
/// Policies that are not capabilities.
///
/// Every other protected admin endpoint names a key from
/// <see cref="AdminCapabilities"/> directly — those keys are registered as
/// policies at startup, so the capability catalogue stays the single authority
/// and there is no second list of policy names to keep in step.
/// </summary>
public static class AuthorizationPolicies
{
    /// <summary>Signed in, admin access switched on. The baseline for the Admin Portal.</summary>
    public const string Admin = "AdminOnly";

    /// <summary>Signed in as any account. Owner Portal endpoints scope by user id themselves.</summary>
    public const string Owner = "OwnerOnly";
}
