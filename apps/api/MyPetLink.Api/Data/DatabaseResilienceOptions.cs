namespace MyPetLink.Api.Data;

public sealed class DatabaseResilienceOptions
{
    public const string SectionName = "DatabaseResilience";

    public int MaxRetryCount { get; init; } = 6;
    public int MaxRetryDelaySeconds { get; init; } = 10;
    public int ApiRetryAfterSeconds { get; init; } = 3;
}
