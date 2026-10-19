using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Data;

// Monthly stocktakes, discrepancies and their resolutions (Phase 1B). Index keys hold only GUIDs,
// dates and short codes, far below SQL Server's 1,700-byte nonclustered limit.
public sealed partial class MyPetLinkDbContext
{
    public DbSet<ConsignmentStocktake> ConsignmentStocktakes => Set<ConsignmentStocktake>();
    public DbSet<ConsignmentStocktakeLine> ConsignmentStocktakeLines => Set<ConsignmentStocktakeLine>();
    public DbSet<ConsignmentStockDiscrepancy> ConsignmentStockDiscrepancies => Set<ConsignmentStockDiscrepancy>();
    public DbSet<ConsignmentDiscrepancyResolution> ConsignmentDiscrepancyResolutions => Set<ConsignmentDiscrepancyResolution>();

    // A closed month never changes: approved stocktakes and frozen lines are immutable, and
    // resolutions are append-only. SQL triggers enforce the same rules for every write path.
    private void EnforceConsignmentStocktakeHistory()
    {
        if (ChangeTracker.Entries<ConsignmentDiscrepancyResolution>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Consignment discrepancy resolutions are append-only.");
        if (ChangeTracker.Entries<ConsignmentStocktakeLine>().Any(e => e.State is EntityState.Modified or EntityState.Deleted
                && e.OriginalValues.GetValue<DateTimeOffset?>(nameof(ConsignmentStocktakeLine.FrozenAt)) is not null))
            throw new InvalidOperationException("An approved stocktake line is frozen.");
        if (ChangeTracker.Entries<ConsignmentStocktake>().Any(e => e.State is EntityState.Modified or EntityState.Deleted
                && e.OriginalValues.GetValue<ConsignmentStocktakeStatus>(nameof(ConsignmentStocktake.Status)) == ConsignmentStocktakeStatus.Approved))
            throw new InvalidOperationException("An approved stocktake is a closed month and can't change.");
        // Only a draft's lines can be added, re-counted or removed, and a line never moves to another
        // stocktake. Freezing at approval changes only the book and closing figures.
        foreach (var line in ChangeTracker.Entries<ConsignmentStocktakeLine>().Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted))
        {
            if (line.State == EntityState.Modified && line.Property(x => x.StocktakeId).IsModified
                && !Equals(line.Property(x => x.StocktakeId).OriginalValue, line.Property(x => x.StocktakeId).CurrentValue))
                throw new InvalidOperationException("A stocktake line can't move to another stocktake.");
            var counted = line.State != EntityState.Modified || new[] { nameof(ConsignmentStocktakeLine.ProductVariantId),
                    nameof(ConsignmentStocktakeLine.SkuSnapshot), nameof(ConsignmentStocktakeLine.CountedSellable),
                    nameof(ConsignmentStocktakeLine.CountedUnsellable), nameof(ConsignmentStocktakeLine.Notes) }
                .Any(name => line.Property(name).IsModified && !Equals(line.Property(name).OriginalValue, line.Property(name).CurrentValue));
            if (counted && StocktakeStatusBefore(line.Entity.StocktakeId) is not (null or ConsignmentStocktakeStatus.Draft))
                throw new InvalidOperationException("Only a draft stocktake's lines can be added, changed or removed.");
        }
    }

    /// <summary>The stocktake's status before this save (null if it is new in this save or gone).</summary>
    private ConsignmentStocktakeStatus? StocktakeStatusBefore(Guid stocktakeId)
    {
        var tracked = ChangeTracker.Entries<ConsignmentStocktake>().FirstOrDefault(e => e.Entity.Id == stocktakeId);
        if (tracked is not null)
            return tracked.State == EntityState.Added ? null : tracked.OriginalValues.GetValue<ConsignmentStocktakeStatus>(nameof(ConsignmentStocktake.Status));
        return ConsignmentStocktakes.AsNoTracking().Where(s => s.Id == stocktakeId).Select(s => (ConsignmentStocktakeStatus?)s.Status).SingleOrDefault();
    }

    private static void ConfigureConsignmentStocktake(ModelBuilder model)
    {
        model.Entity<ConsignmentStocktake>(e =>
        {
            // Declared so EF updates without OUTPUT, which SQL Server forbids on tables with triggers.
            e.ToTable("ConsignmentStocktakes", t => t.HasTrigger("TR_ConsignmentStocktakes_Closed"));
            e.Property(x => x.CountedBy).HasMaxLength(200);
            e.Property(x => x.EvidenceKind).HasMaxLength(24);
            e.Property(x => x.EvidenceReference).HasMaxLength(1000);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.CountedAfterCutoffNote).HasMaxLength(1000);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ReviewMode).HasMaxLength(32);
            e.Property(x => x.IdempotencyKey).HasMaxLength(80);
            e.Property(x => x.RowVersion).IsRowVersion();
            // One stocktake in progress per branch, one approved close per cutoff.
            e.HasIndex(x => x.MerchantBranchId).IsUnique().HasFilter("[Status] IN ('Draft','Recorded')")
                .HasDatabaseName("UX_ConsignmentStocktakes_Open");
            e.HasIndex(x => new { x.MerchantBranchId, x.CutoffAt }).IsUnique().HasFilter("[Status] = 'Approved'")
                .HasDatabaseName("UX_ConsignmentStocktakes_Cutoff");
            e.HasIndex(x => x.IdempotencyKey).IsUnique().HasDatabaseName("UX_ConsignmentStocktakes_Idempotency");
            e.HasIndex(x => new { x.MerchantBranchId, x.Status, x.CutoffAt }).HasDatabaseName("IX_ConsignmentStocktakes_Branch");
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<MerchantBranch>().WithMany().HasForeignKey(x => x.MerchantBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentStocktake>().WithMany().HasForeignKey(x => x.PreviousStocktakeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.CreatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.RecordedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ApprovedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentStocktakeLine>(e =>
        {
            e.ToTable("ConsignmentStocktakeLines", t => {
                t.HasCheckConstraint("CK_ConsignmentStocktakeLine_Counts", "[CountedSellable] >= 0 AND [CountedUnsellable] >= 0");
                t.HasTrigger("TR_ConsignmentStocktakeLines_Frozen");
            });
            e.Property(x => x.SkuSnapshot).HasMaxLength(80);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasIndex(x => new { x.StocktakeId, x.ProductVariantId }).IsUnique().HasDatabaseName("UX_ConsignmentStocktakeLines_Sku");
            e.HasOne(x => x.Stocktake).WithMany(x => x.Lines).HasForeignKey(x => x.StocktakeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TagProductVariant>().WithMany().HasForeignKey(x => x.ProductVariantId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentStockDiscrepancy>(e =>
        {
            e.ToTable("ConsignmentStockDiscrepancies", t =>
                t.HasCheckConstraint("CK_ConsignmentDiscrepancy_Quantities",
                    "[Quantity] > 0 AND [OpenQuantity] >= 0 AND [OpenQuantity] <= [Quantity]"
                    + " AND (([Status] = 'Open' AND [OpenQuantity] > 0) OR ([Status] = 'Resolved' AND [OpenQuantity] = 0))"));
            e.Property(x => x.SkuSnapshot).HasMaxLength(80);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => new { x.MerchantBranchId, x.ProductVariantId, x.Status }).HasDatabaseName("IX_ConsignmentDiscrepancies_Open");
            e.HasIndex(x => x.OriginStocktakeId).HasDatabaseName("IX_ConsignmentDiscrepancies_Origin");
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<MerchantBranch>().WithMany().HasForeignKey(x => x.MerchantBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TagProductVariant>().WithMany().HasForeignKey(x => x.ProductVariantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentStocktake>().WithMany().HasForeignKey(x => x.OriginStocktakeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentStocktakeLine>().WithMany().HasForeignKey(x => x.OriginStocktakeLineId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentDiscrepancyResolution>(e =>
        {
            e.ToTable("ConsignmentDiscrepancyResolutions", t => {
                t.HasCheckConstraint("CK_ConsignmentDiscrepancyResolution_Quantity", "[Quantity] > 0");
                t.HasCheckConstraint("CK_ConsignmentDiscrepancyResolution_Withdrawal",
                    "([Outcome] = 'AllocationWithdrawn' AND [ReversesResolutionId] IS NOT NULL) OR ([Outcome] <> 'AllocationWithdrawn' AND [ReversesResolutionId] IS NULL)");
                t.HasTrigger("TR_ConsignmentDiscrepancyResolutions_AppendOnly");
            });
            e.Property(x => x.Outcome).HasMaxLength(32);
            e.Property(x => x.EvidenceReference).HasMaxLength(1000);
            e.Property(x => x.Reason).HasMaxLength(1000);
            e.Property(x => x.ReviewMode).HasMaxLength(32);
            e.HasIndex(x => x.DiscrepancyId).HasDatabaseName("IX_ConsignmentDiscrepancyResolutions_Discrepancy");
            // A report version explains a discrepancy at most once, and an explanation is withdrawn at most once.
            e.HasIndex(x => new { x.DiscrepancyId, x.LinkedSalesReportId }).IsUnique()
                .HasFilter("[Outcome] = 'ExplainedByLateReport' AND [LinkedSalesReportId] IS NOT NULL")
                .HasDatabaseName("UX_ConsignmentDiscrepancyResolutions_LateReport");
            e.HasIndex(x => x.ReversesResolutionId).IsUnique().HasFilter("[ReversesResolutionId] IS NOT NULL")
                .HasDatabaseName("UX_ConsignmentDiscrepancyResolutions_Reverses");
            e.HasOne<ConsignmentDiscrepancyResolution>().WithMany().HasForeignKey(x => x.ReversesResolutionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Discrepancy).WithMany(x => x.Resolutions).HasForeignKey(x => x.DiscrepancyId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentSalesReport>().WithMany().HasForeignKey(x => x.LinkedSalesReportId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentStockDiscrepancy>().WithMany().HasForeignKey(x => x.RelatedDiscrepancyId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentReviewEvent>().WithMany().HasForeignKey(x => x.ReviewEventId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ActorAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSalesReportLine>(e =>
            e.HasOne<ConsignmentStocktake>().WithMany().HasForeignKey(x => x.CorroboratedByStocktakeId).OnDelete(DeleteBehavior.Restrict));
    }
}
