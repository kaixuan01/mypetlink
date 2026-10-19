using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Data;

// Partner sales reports, approved selling prices and the SKU stock ledger.
// Every index key here stays far below SQL Server's 1,700-byte nonclustered
// limit: keys hold GUIDs, dates, ints and short codes only.
public sealed partial class MyPetLinkDbContext
{
    public DbSet<ConsignmentStockLedgerEntry> ConsignmentStockLedgerEntries => Set<ConsignmentStockLedgerEntry>();
    public DbSet<ConsignmentPriceTerm> ConsignmentPriceTerms => Set<ConsignmentPriceTerm>();
    public DbSet<ConsignmentSalesReport> ConsignmentSalesReports => Set<ConsignmentSalesReport>();
    public DbSet<ConsignmentSalesReportLine> ConsignmentSalesReportLines => Set<ConsignmentSalesReportLine>();
    public DbSet<ConsignmentRecordContributor> ConsignmentRecordContributors => Set<ConsignmentRecordContributor>();

    private void EnforceConsignmentStockLedger()
    {
        if (ChangeTracker.Entries<ConsignmentStockLedgerEntry>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("The consignment stock ledger is append-only.");
        if (ChangeTracker.Entries<ConsignmentRecordContributor>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Consignment contributor history is append-only.");
        EnforceConsignmentStocktakeHistory();
    }

    private static void ConfigureConsignmentSales(ModelBuilder model)
    {
        model.Entity<ConsignmentStockLedgerEntry>(e =>
        {
            e.ToTable("ConsignmentStockLedgerEntries", t =>
                t.HasCheckConstraint("CK_ConsignmentLedger_Quantity", "[Quantity] > 0 AND [FromBucket] <> [ToBucket]"));
            e.Property(x => x.SkuSnapshot).HasMaxLength(80);
            e.Property(x => x.FromBucket).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.ToBucket).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.EntryType).HasMaxLength(40);
            e.Property(x => x.SourceType).HasMaxLength(32);
            // Each source posts once; a reversal is the only second row for a source.
            e.HasIndex(x => new { x.SourceType, x.SourceLineId, x.EntryType }).IsUnique()
                .HasFilter("[ReversesEntryId] IS NULL").HasDatabaseName("UX_ConsignmentLedger_Source");
            e.HasIndex(x => x.ReversesEntryId).IsUnique()
                .HasFilter("[ReversesEntryId] IS NOT NULL").HasDatabaseName("UX_ConsignmentLedger_Reverses");
            e.HasIndex(x => new { x.MerchantBranchId, x.ProductVariantId, x.EffectiveAt })
                .IncludeProperties(x => new { x.FromBucket, x.ToBucket, x.Quantity }).HasDatabaseName("IX_ConsignmentLedger_Position");
            e.HasIndex(x => new { x.MerchantId, x.EffectiveAt }).HasDatabaseName("IX_ConsignmentLedger_Merchant");
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<MerchantBranch>().WithMany().HasForeignKey(x => x.MerchantBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TagProductVariant>().WithMany().HasForeignKey(x => x.ProductVariantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ActorAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentStockLedgerEntry>().WithMany().HasForeignKey(x => x.ReversesEntryId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentPriceTerm>(e =>
        {
            e.ToTable("ConsignmentPriceTerms", t =>
            {
                t.HasCheckConstraint("CK_ConsignmentPriceTerm_Values",
                    "[UnitNetPrice] > 0 AND ([ValidToExclusive] IS NULL OR [ValidToExclusive] > [ValidFrom])");
                t.HasCheckConstraint("CK_ConsignmentPriceTerm_Promotion", "[Kind] = 'Standard' OR [ValidToExclusive] IS NOT NULL");
            });
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.SkuSnapshot).HasMaxLength(80);
            e.Property(x => x.UnitNetPrice).HasPrecision(18, 2);
            e.Property(x => x.ApprovalEvidenceReference).HasMaxLength(1000);
            e.Property(x => x.ReviewMode).HasMaxLength(32);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => new { x.AgreementId, x.ProductVariantId, x.Kind, x.ValidFrom }).HasDatabaseName("IX_ConsignmentPriceTerms_Lookup");
            e.HasOne(x => x.Agreement).WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TagProductVariant>().WithMany().HasForeignKey(x => x.ProductVariantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.CreatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ApprovedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSalesReport>(e =>
        {
            e.ToTable("ConsignmentSalesReports", t =>
                t.HasCheckConstraint("CK_ConsignmentSalesReport_Period", "[PeriodEndExclusive] > [PeriodStart] AND [Version] >= 1"));
            e.Property(x => x.PartnerReference).HasMaxLength(100);
            e.Property(x => x.EvidenceLevel).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.EvidenceKind).HasMaxLength(24);
            e.Property(x => x.EvidenceReference).HasMaxLength(1000);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.DisputeReason).HasMaxLength(1000);
            e.Property(x => x.ReviewMode).HasMaxLength(32);
            e.Property(x => x.IdempotencyKey).HasMaxLength(80);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasIndex(x => new { x.MerchantId, x.PartnerReference, x.Version }).IsUnique()
                .HasDatabaseName("UX_ConsignmentSalesReports_Reference");
            e.HasIndex(x => x.IdempotencyKey).IsUnique().HasDatabaseName("UX_ConsignmentSalesReports_Idempotency");
            // One live version chain per branch and period: a second independent
            // report for the same period collides on version 1.
            e.HasIndex(x => new { x.MerchantBranchId, x.PeriodStart, x.Version }).IsUnique()
                .HasFilter("[Status] <> 'Voided'").HasDatabaseName("UX_ConsignmentSalesReports_Period");
            e.HasIndex(x => x.SupersedesReportId).IsUnique()
                .HasFilter("[SupersedesReportId] IS NOT NULL AND [Status] <> 'Voided'").HasDatabaseName("UX_ConsignmentSalesReports_Supersedes");
            e.HasIndex(x => new { x.MerchantBranchId, x.Status, x.PeriodStart }).HasDatabaseName("IX_ConsignmentSalesReports_Status");
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<MerchantBranch>().WithMany().HasForeignKey(x => x.MerchantBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Agreement).WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentSalesReport>().WithMany().HasForeignKey(x => x.SupersedesReportId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.CreatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.RecordedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.VerifiedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.DisputedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSalesReportLine>(e =>
        {
            e.ToTable("ConsignmentSalesReportLines", t =>
            {
                t.HasCheckConstraint("CK_ConsignmentSalesLine_Quantities",
                    "[Quantity] > 0 AND [UnitNetPrice] >= 0 AND [RestockableQuantity] >= 0 AND [UnsellableReturnedQuantity] >= 0"
                    + " AND [RestockableQuantity] + [UnsellableReturnedQuantity] <= [Quantity]"
                    + " AND [QuantityExplainingDiscrepancy] >= 0 AND [QuantityExplainingDiscrepancy] <= [Quantity]");
                t.HasCheckConstraint("CK_ConsignmentSalesLine_Type",
                    "([LineType] = 'Sale' AND [RestockableQuantity] = 0 AND [UnsellableReturnedQuantity] = 0 AND [RefundOfPeriodStart] IS NULL)"
                    + " OR ([LineType] = 'Refund' AND [RefundOfPeriodStart] IS NOT NULL AND [QuantityExplainingDiscrepancy] = 0)");
                // Every restock carries an explanation. Lines entered before confirmation existed keep
                // SealedReturnConfirmed = 0 with a migration note, and can't be verified as they are.
                t.HasCheckConstraint("CK_ConsignmentSalesLine_SealedReturn",
                    "[RestockableQuantity] = 0 OR ([SealedReturnEvidence] IS NOT NULL AND LEN([SealedReturnEvidence]) >= 5)");
            });
            e.Property(x => x.SkuSnapshot).HasMaxLength(80);
            e.Property(x => x.ProductNameSnapshot).HasMaxLength(200);
            e.Property(x => x.LineType).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.UnitListPriceSnapshot).HasPrecision(18, 2);
            e.Property(x => x.UnitNetPrice).HasPrecision(18, 2);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.SealedReturnEvidence).HasMaxLength(300);
            // A refund line is identified by the period of the sale it refunds as well as its price.
            // Sale lines have no origin period, and SQL Server keys equal NULLs together, so a sale
            // line stays unique per price. Unapproved prices (no term) are kept apart by the service.
            e.HasIndex(x => new { x.SalesReportId, x.LineType, x.ProductVariantId, x.PriceTermId, x.RefundOfPeriodStart }).IsUnique()
                .HasFilter("[PriceTermId] IS NOT NULL").HasDatabaseName("UX_ConsignmentSalesReportLines_Line");
            e.HasOne(x => x.SalesReport).WithMany(x => x.Lines).HasForeignKey(x => x.SalesReportId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TagProductVariant>().WithMany().HasForeignKey(x => x.ProductVariantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentPriceTerm>().WithMany().HasForeignKey(x => x.PriceTermId).OnDelete(DeleteBehavior.Restrict);
            // Refund capacity is read per sold period.
            e.HasIndex(x => new { x.ProductVariantId, x.PriceTermId, x.LineType }).IncludeProperties(x => new { x.Quantity, x.RefundOfPeriodStart })
                .HasDatabaseName("IX_ConsignmentSalesReportLines_Capacity");
        });

        model.Entity<ConsignmentRecordContributor>(e =>
        {
            e.ToTable("ConsignmentRecordContributors", t => {
                t.HasCheckConstraint("CK_ConsignmentRecordContributor_Subject", "[SubjectType] IN ('ConsignmentSalesReport','ConsignmentPriceTerm','ConsignmentStocktake')");
                t.HasCheckConstraint("CK_ConsignmentRecordContributor_Role", "[Role] IN ('Created','Edited','Recorded')");
            });
            e.HasKey(x => new { x.SubjectType, x.SubjectId, x.AdminUserId });
            e.Property(x => x.SubjectType).HasMaxLength(32);
            e.Property(x => x.Role).HasMaxLength(16);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.AdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
