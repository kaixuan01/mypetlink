namespace MyPetLink.Api.Storage;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    public string Provider { get; init; } = "Local";
    public string LocalRoot { get; init; } = "App_Data/uploads";
    public string? PublicBaseUrl { get; init; }
}
