namespace MyPetLink.Api.Auth;

public static class ExternalLoginProviders
{
    public const string Google = "Google";
    public const string Apple = "Apple";
    public const string EmailOtp = "EmailOtp";

    // Development-only seeded identity provider. Never accepted from a caller
    // and never registered as a production login method.
    public const string DevTest = "DevTest";

    public static readonly IReadOnlyCollection<string> PlannedValues =
    [
        Google,
        Apple,
        EmailOtp
    ];
}
