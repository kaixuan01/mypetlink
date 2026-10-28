using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Data;

public sealed partial class MyPetLinkDbContext
{
    public DbSet<DocumentSignature> DocumentSignatures => Set<DocumentSignature>();

    // A saved signature version is never edited or deleted. The only change allowed is retiring
    // the current version once: setting when, why and by whom, and erasing the image. The SQL
    // trigger enforces the same rule for anything that bypasses this context.
    private static readonly HashSet<string> SignatureRetirementColumns =
        [nameof(DocumentSignature.Image), nameof(DocumentSignature.EndedAt), nameof(DocumentSignature.EndReason),
         nameof(DocumentSignature.EndedByAdminUserId)];

    private void EnforceDocumentSignatureHistory()
    {
        foreach (var entry in ChangeTracker.Entries<DocumentSignature>())
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Saved signatures are never deleted: retire them instead.");
            if (entry.State != EntityState.Modified) continue;
            var retiring = entry.OriginalValues.GetValue<DateTimeOffset?>(nameof(DocumentSignature.EndedAt)) is null
                && entry.Entity is { EndedAt: not null, EndReason: not null, EndedByAdminUserId: not null, Image: null };
            if (!retiring || entry.Properties.Any(p => p.IsModified && !SignatureRetirementColumns.Contains(p.Metadata.Name)))
                throw new InvalidOperationException("Saved signatures are never edited: save a new version instead.");
        }
    }

    // Text with something besides spaces, tabs, line breaks and no-break spaces. LEN ignores
    // trailing spaces, so text made only of those measures 0.
    private static string NotBlankSql(string column) =>
        $"LEN(REPLACE(REPLACE(REPLACE(REPLACE([{column}], CHAR(9), N''), CHAR(10), N''), CHAR(13), N''), NCHAR(160), N'')) > 0";

    // A SHA-256 written as 64 hexadecimal characters.
    private static string Sha256Sql(string column) =>
        $"LEN([{column}]) = 64 AND [{column}] NOT LIKE N'%[^0-9A-Fa-f]%'";

    private static void ConfigureDocumentSignatures(ModelBuilder model)
    {
        model.Entity<DocumentSignature>(e =>
        {
            e.ToTable("DocumentSignatures", t =>
            {
                // On file, or retired with exactly one of the two reasons. The reason is compared as
                // bytes: an ordinary comparison ignores trailing spaces and case, and a NULL would
                // make it unknown, which a CHECK constraint lets through.
                t.HasCheckConstraint("CK_DocumentSignature_Lifecycle",
                    "([EndedAt] IS NULL AND [EndReason] IS NULL AND [EndedByAdminUserId] IS NULL AND [Image] IS NOT NULL) "
                    + "OR ([EndedAt] IS NOT NULL AND [EndReason] IS NOT NULL AND [EndedByAdminUserId] IS NOT NULL AND [Image] IS NULL "
                    + "AND CAST([EndReason] AS varbinary(32)) IN (CAST(N'Replaced' AS varbinary(32)), CAST(N'Removed' AS varbinary(32))))");
                t.HasCheckConstraint("CK_DocumentSignature_Image",
                    $"[ImageWidth] > 0 AND [ImageHeight] > 0 AND {Sha256Sql("ImageSha256")}");
                t.HasCheckConstraint("CK_DocumentSignature_Signatory",
                    $"{NotBlankSql("SignatoryName")} AND {NotBlankSql("SignatoryPosition")}");
                // Declared so EF saves without an OUTPUT clause, which SQL Server refuses on a table with triggers.
                t.HasTrigger("TR_DocumentSignatures_History");
            });
            e.Property(x => x.SignatoryName).HasMaxLength(120);
            e.Property(x => x.SignatoryPosition).HasMaxLength(120);
            e.Property(x => x.ImageSha256).HasMaxLength(64);
            e.Property(x => x.EndReason).HasConversion<string>().HasMaxLength(16);
            // At most one signature on file per administrator.
            e.HasIndex(x => x.SignatoryAdminUserId).IsUnique().HasFilter("[EndedAt] IS NULL");
            // A version together with its owner, so a signed Delivery Order can require both.
            e.HasAlternateKey(x => new { x.Id, x.SignatoryAdminUserId }).HasName("AK_DocumentSignatures_Id_SignatoryAdminUserId");
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.SignatoryAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.EndedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
