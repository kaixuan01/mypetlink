namespace MyPetLink.Api.Auth;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; init; } = "MyPetLink.Api";
    public string Audience { get; init; } = "MyPetLink.Client";
    public string SigningKey { get; init; } = "";
    public int AccessTokenMinutes { get; init; } = 15;
    public int RefreshTokenDays { get; init; } = 30;
}
