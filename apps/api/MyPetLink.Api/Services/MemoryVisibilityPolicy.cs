using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

internal static class MemoryVisibilityPolicy
{
    // FamilyOnly remains in the enum until deployed data is confirmed clean
    // because EF stores the enum as a string. It is compatibility input only:
    // every non-Public value has the effective and persisted meaning Private.
    public static MemoryVisibility Normalize(MemoryVisibility visibility)
    {
        return visibility == MemoryVisibility.Public
            ? MemoryVisibility.Public
            : MemoryVisibility.Private;
    }

    public static bool IsPublic(MemoryVisibility visibility)
    {
        return Normalize(visibility) == MemoryVisibility.Public;
    }
}
