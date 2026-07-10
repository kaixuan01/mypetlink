namespace MyPetLink.Api.Auth;

// Development-only allowlist. When the API runs in the Development environment,
// a Google login whose normalized email matches one of these entries is
// promoted to an active admin (see AuthService.EnsureDevAdminAsync). This never
// runs outside Development, so it cannot become a production auto-admin.
public sealed class AdminSeedOptions
{
    public const string SectionName = "AdminSeed";

    public string[] Emails { get; init; } = System.Array.Empty<string>();
}
