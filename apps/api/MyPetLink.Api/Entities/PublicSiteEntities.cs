namespace MyPetLink.Api.Entities;

/// <summary>
/// Single-row public-site business configuration. It references live pet data
/// so customer-facing profile content is never duplicated into settings.
/// </summary>
public sealed class PublicSiteSetting : AuditableEntity
{
    public Guid? FeaturedSamplePetId { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public Pet? FeaturedSamplePet { get; set; }
    public AdminUser? UpdatedByAdminUser { get; set; }
}
