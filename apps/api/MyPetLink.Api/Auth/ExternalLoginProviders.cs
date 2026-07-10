namespace MyPetLink.Api.Auth;

public static class ExternalLoginProviders
{
    public const string Google = "Google";
    public const string Apple = "Apple";
    public const string EmailOtp = "EmailOtp";

    // Development-only test login provider. Never a real login method; used
    // solely by the Development-gated /api/v1/dev/test-login helper so local
    // and CI-style E2E testing can mint sessions without a Google popup.
    public const string DevTest = "DevTest";

    public static readonly IReadOnlyCollection<string> PlannedValues =
    [
        Google,
        Apple,
        EmailOtp
    ];
}
