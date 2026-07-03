namespace MyPetLink.Api.Auth;

public static class ExternalLoginProviders
{
    public const string Google = "Google";
    public const string Apple = "Apple";
    public const string EmailOtp = "EmailOtp";

    public static readonly IReadOnlyCollection<string> PlannedValues =
    [
        Google,
        Apple,
        EmailOtp
    ];
}
