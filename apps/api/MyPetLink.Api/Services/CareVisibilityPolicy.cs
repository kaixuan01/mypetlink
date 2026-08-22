using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

internal static class CareVisibilityPolicy
{
    // PublicDetails remains in the enum until deployed data is confirmed clean
    // because EF stores the enum as a string. It is compatibility input only:
    // every known public value has the effective and persisted meaning badge-only,
    // while unexpected values fail closed to Private.
    public static CareRecordPublicVisibility Normalize(
        CareRecordPublicVisibility visibility)
    {
        return visibility is CareRecordPublicVisibility.PublicBadgeOnly
            or CareRecordPublicVisibility.PublicDetails
                ? CareRecordPublicVisibility.PublicBadgeOnly
                : CareRecordPublicVisibility.Private;
    }

    public static bool IsPublic(CareRecordPublicVisibility visibility)
    {
        return Normalize(visibility) == CareRecordPublicVisibility.PublicBadgeOnly;
    }
}
