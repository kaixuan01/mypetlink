using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Data;

// Commission policy assignments, merchant servicing history and the consignment
// settlement layer. Settlement revisions and lines are append-only; receipts,
// policy assignments and servicing rows accept exactly one closing change each.
public sealed partial class MyPetLinkDbContext
{
    public DbSet<SalespersonPolicyAssignment> SalespersonPolicyAssignments => Set<SalespersonPolicyAssignment>();
    public DbSet<MerchantServicingAssignment> MerchantServicingAssignments => Set<MerchantServicingAssignment>();
    public DbSet<ConsignmentSettlement> ConsignmentSettlements => Set<ConsignmentSettlement>();
    public DbSet<ConsignmentSettlementRevision> ConsignmentSettlementRevisions => Set<ConsignmentSettlementRevision>();
    public DbSet<ConsignmentSettlementLine> ConsignmentSettlementLines => Set<ConsignmentSettlementLine>();
    public DbSet<ConsignmentSettlementReceipt> ConsignmentSettlementReceipts => Set<ConsignmentSettlementReceipt>();
    public DbSet<ConsignmentCommissionRecovery> ConsignmentCommissionRecoveries => Set<ConsignmentCommissionRecovery>();

    private static readonly HashSet<string> ReceiptVoidColumns =
        [nameof(ConsignmentSettlementReceipt.VoidedAt), nameof(ConsignmentSettlementReceipt.VoidedByAdminUserId),
         nameof(ConsignmentSettlementReceipt.VoidReason), nameof(ConsignmentSettlementReceipt.UpdatedAt)];
    private static readonly HashSet<string> PolicyEndColumns =
        [nameof(SalespersonPolicyAssignment.EffectiveToExclusive), nameof(SalespersonPolicyAssignment.EndedAt),
         nameof(SalespersonPolicyAssignment.EndedByAdminUserId), nameof(SalespersonPolicyAssignment.EndReason),
         nameof(SalespersonPolicyAssignment.UpdatedAt)];

    private void EnforceCommissionSettlementHistory()
    {
        if (ChangeTracker.Entries().Any(e => e.Entity is ConsignmentSettlementRevision or ConsignmentSettlementLine or ConsignmentCommissionRecovery
                && e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Consignment settlement statements are append-only.");
        if (ChangeTracker.Entries<ConsignmentSettlement>().Any(e => e.State == EntityState.Deleted))
            throw new InvalidOperationException("Consignment settlements are never deleted.");

        foreach (var entry in ChangeTracker.Entries<ConsignmentSettlementReceipt>())
            RequireSingleClosingChange(entry, nameof(ConsignmentSettlementReceipt.VoidedAt), ReceiptVoidColumns,
                "Settlement receipts are never edited or deleted: void a mistaken receipt instead.");
        foreach (var entry in ChangeTracker.Entries<SalespersonPolicyAssignment>())
            RequireSingleClosingChange(entry, nameof(SalespersonPolicyAssignment.EndedAt), PolicyEndColumns,
                "Commission policy assignments are never edited or deleted: end one and record another.");
        foreach (var entry in ChangeTracker.Entries<MerchantServicingAssignment>())
        {
            if (entry.State == EntityState.Deleted)
                throw new InvalidOperationException("Merchant servicing history is never deleted.");
            if (entry.State != EntityState.Modified) continue;
            var closing = entry.OriginalValues.GetValue<DateTimeOffset?>(nameof(MerchantServicingAssignment.EffectiveToExclusive)) is null
                && entry.Entity.EffectiveToExclusive is not null;
            if (!closing || entry.Properties.Any(p => p.IsModified && p.Metadata.Name != nameof(MerchantServicingAssignment.EffectiveToExclusive)))
                throw new InvalidOperationException("Merchant servicing history is append-only: a row can only be closed.");
        }
    }

    private static void RequireSingleClosingChange<T>(EntityEntry<T> entry, string marker, HashSet<string> allowed, string message)
        where T : class
    {
        if (entry.State == EntityState.Deleted) throw new InvalidOperationException(message);
        if (entry.State != EntityState.Modified) return;
        var closing = entry.OriginalValues[marker] is null && entry.CurrentValues[marker] is not null;
        if (!closing || entry.Properties.Any(p => p.IsModified && !allowed.Contains(p.Metadata.Name)))
            throw new InvalidOperationException(message);
    }

    private static void ConfigureCommissionSettlement(ModelBuilder model)
    {
        model.Entity<SalespersonPolicyAssignment>(e =>
        {
            e.ToTable("SalespersonPolicyAssignments", t =>
            {
                t.HasCheckConstraint("CK_SalespersonPolicyAssignment_Policy", "[PolicyCode] IS NOT NULL AND [PolicyCode] = 'v1.1'");
                t.HasCheckConstraint("CK_SalespersonPolicyAssignment_Dates",
                    "[AcceptedAt] IS NOT NULL AND [EffectiveFrom] IS NOT NULL AND [EffectiveFrom] >= [AcceptedAt] "
                    + "AND ([EffectiveToExclusive] IS NULL OR [EffectiveToExclusive] > [EffectiveFrom])");
                t.HasCheckConstraint("CK_SalespersonPolicyAssignment_Reference",
                    "[AgreementReference] IS NOT NULL AND LEN([AgreementReference]) >= 3");
                t.HasCheckConstraint("CK_SalespersonPolicyAssignment_EndShape",
                    "([EndedAt] IS NULL AND [EndedByAdminUserId] IS NULL AND [EndReason] IS NULL) OR "
                    + "([EndedAt] IS NOT NULL AND [EndedByAdminUserId] IS NOT NULL AND [EndReason] IS NOT NULL AND [EffectiveToExclusive] IS NOT NULL)");
            });
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.PolicyCode).HasMaxLength(16).IsRequired();
            e.Property(x => x.AgreementReference).HasMaxLength(200).IsRequired();
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.EndReason).HasMaxLength(1000);
            e.HasIndex(x => new { x.SalespersonId, x.EffectiveFrom }).IsUnique();
            e.HasOne(x => x.Salesperson).WithMany().HasForeignKey(x => x.SalespersonId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.CreatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.EndedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<MerchantServicingAssignment>(e =>
        {
            e.ToTable("MerchantServicingAssignments", t =>
            {
                t.HasCheckConstraint("CK_MerchantServicingAssignment_Range",
                    "[EffectiveToExclusive] IS NULL OR [EffectiveToExclusive] >= [EffectiveFrom]");
                t.HasCheckConstraint("CK_MerchantServicingAssignment_Source",
                    "[Source] IS NOT NULL AND [Source] IN ('Rollout','MerchantEdit')");
            });
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.SalespersonCodeSnapshot).HasMaxLength(32).IsRequired();
            e.Property(x => x.SalespersonNameSnapshot).HasMaxLength(160).IsRequired();
            e.Property(x => x.Source).HasMaxLength(16).IsRequired();
            // One open servicing row per merchant: there is only ever one current representative.
            e.HasIndex(x => x.MerchantId).IsUnique().HasFilter("[EffectiveToExclusive] IS NULL")
                .HasDatabaseName("UX_MerchantServicingAssignments_Open");
            e.HasIndex(x => new { x.MerchantId, x.EffectiveFrom });
            e.HasOne(x => x.Merchant).WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Salesperson).WithMany().HasForeignKey(x => x.SalespersonId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.RecordedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSettlement>(e =>
        {
            e.ToTable("ConsignmentSettlements", t =>
            {
                t.HasCheckConstraint("CK_ConsignmentSettlement_Period", "[PeriodEndExclusive] > [PeriodStart]");
                t.HasCheckConstraint("CK_ConsignmentSettlement_Quantities",
                    "[StandardQuantity] >= 0 AND [PromotionQuantity] >= 0 AND [RefundQuantity] >= 0 AND [Revision] > 0 AND [SalesReportVersion] > 0");
                t.HasCheckConstraint("CK_ConsignmentSettlement_Money",
                    "[StandardSales] >= 0 AND [PromotionSales] >= 0 AND [RefundAmount] >= 0 AND [ReceivedAmount] >= 0 "
                    + "AND [SalesCommissionTarget] >= 0 AND [CommissionRecoveryRequired] >= 0 "
                    + "AND [EligibleSales] = [StandardSales] + [PromotionSales] - [RefundAmount] "
                    + "AND [ExpectedRemittance] = [EligibleSales] - [MerchantCommission]");
                t.HasCheckConstraint("CK_ConsignmentSettlement_Status",
                    "([Status] = 'Settled' AND [SettledAt] IS NOT NULL) OR ([Status] IN ('AwaitingPayment','PartiallyReceived','CreditDue') AND [Status] IS NOT NULL)");
                t.HasCheckConstraint("CK_ConsignmentSettlement_Attribution",
                    "([AttributionStatus] = 'NeedsResolution' AND [AttributionIssue] IS NOT NULL AND [AttributionSource] IS NULL "
                    + "AND [SalespersonId] IS NULL AND [CommissionPolicyCode] IS NULL) OR "
                    + "([AttributionStatus] = 'Resolved' AND [AttributionSource] IS NOT NULL AND [AttributionSource] IN ('ServicingAssignment','OperatorResolution') "
                    + "AND ([CommissionPolicyCode] IS NULL OR [SalespersonId] IS NOT NULL))");
            });
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.SettlementNumber).HasMaxLength(40).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.AttributionStatus).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.AttributionIssue).HasMaxLength(500);
            e.Property(x => x.AttributionSource).HasMaxLength(32);
            e.Property(x => x.SalespersonCodeSnapshot).HasMaxLength(32);
            e.Property(x => x.SalespersonNameSnapshot).HasMaxLength(160);
            e.Property(x => x.CommissionPolicyCode).HasMaxLength(16);
            e.Property(x => x.AttributionResolutionReason).HasMaxLength(1000);
            e.Property(x => x.CommissionNote).HasMaxLength(500);
            foreach (var money in new[] { nameof(ConsignmentSettlement.StandardSales), nameof(ConsignmentSettlement.PromotionSales),
                         nameof(ConsignmentSettlement.RefundAmount), nameof(ConsignmentSettlement.EligibleSales),
                         nameof(ConsignmentSettlement.MerchantCommission), nameof(ConsignmentSettlement.ExpectedRemittance),
                         nameof(ConsignmentSettlement.ReceivedAmount), nameof(ConsignmentSettlement.SalesCommissionTarget),
                         nameof(ConsignmentSettlement.CommissionRecoveryRequired) })
                e.Property(money).HasPrecision(18, 2);
            e.HasIndex(x => x.SettlementNumber).IsUnique();
            // A report lineage keeps its period; one settlement per branch period.
            e.HasIndex(x => new { x.MerchantBranchId, x.PeriodStart }).IsUnique();
            e.HasIndex(x => new { x.MerchantId, x.PeriodStart });
            e.HasIndex(x => new { x.Status, x.PeriodStart });
            e.HasIndex(x => x.AttributionStatus).HasFilter("[AttributionStatus] = 'NeedsResolution'");
            e.HasOne(x => x.Merchant).WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<MerchantBranch>().WithMany().HasForeignKey(x => x.MerchantBranchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentAgreement>().WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentSalesReport>().WithMany().HasForeignKey(x => x.SalesReportId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Salesperson).WithMany().HasForeignKey(x => x.SalespersonId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SalespersonPolicyAssignment>().WithMany().HasForeignKey(x => x.PolicyAssignmentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.AttributionResolvedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSettlementRevision>(e =>
        {
            e.ToTable("ConsignmentSettlementRevisions", t =>
                t.HasCheckConstraint("CK_ConsignmentSettlementRevision_Values",
                    "[Revision] > 0 AND [SalesReportVersion] > 0 AND [StandardQuantity] >= 0 AND [PromotionQuantity] >= 0 "
                    + "AND [RefundQuantity] >= 0 AND [SalesCommissionTarget] >= 0 AND [CommissionRecoveryRequired] >= 0 "
                    + "AND [EligibleSales] = [StandardSales] + [PromotionSales] - [RefundAmount] "
                    + "AND [ExpectedRemittance] = [EligibleSales] - [MerchantCommission]"));
            e.Property(x => x.Reason).HasMaxLength(500).IsRequired();
            e.Property(x => x.CommissionPolicyCode).HasMaxLength(16);
            foreach (var money in new[] { nameof(ConsignmentSettlementRevision.StandardSales), nameof(ConsignmentSettlementRevision.PromotionSales),
                         nameof(ConsignmentSettlementRevision.RefundAmount), nameof(ConsignmentSettlementRevision.EligibleSales),
                         nameof(ConsignmentSettlementRevision.MerchantCommission), nameof(ConsignmentSettlementRevision.ExpectedRemittance),
                         nameof(ConsignmentSettlementRevision.SalesCommissionTarget), nameof(ConsignmentSettlementRevision.CommissionRecoveryRequired) })
                e.Property(money).HasPrecision(18, 2);
            e.HasIndex(x => new { x.SettlementId, x.Revision }).IsUnique();
            e.HasOne(x => x.Settlement).WithMany(x => x.Revisions).HasForeignKey(x => x.SettlementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentSalesReport>().WithMany().HasForeignKey(x => x.SalesReportId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.CreatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSettlementLine>(e =>
        {
            e.ToTable("ConsignmentSettlementLines", t =>
            {
                t.HasCheckConstraint("CK_ConsignmentSettlementLine_Values",
                    "[Quantity] > 0 AND [UnitPrice] >= 0 AND [MerchantCommissionPercentage] BETWEEN 0 AND 100 "
                    + "AND (([LineType] = 'Sale' AND [Amount] >= 0 AND [RefundOfPeriodStart] IS NULL) OR ([LineType] = 'Refund' AND [Amount] <= 0 AND [RefundOfPeriodStart] IS NOT NULL))");
                t.HasCheckConstraint("CK_ConsignmentSettlementLine_Commission",
                    "([CommissionSalespersonId] IS NULL AND [CommissionUnitAmount] IS NULL AND [CommissionRuleId] IS NULL) OR "
                    + "([CommissionSalespersonId] IS NOT NULL AND [CommissionUnitAmount] IS NOT NULL AND [CommissionUnitAmount] >= 0)");
            });
            e.Property(x => x.LineType).HasConversion<string>().HasMaxLength(8);
            e.Property(x => x.PriceKind).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.SkuSnapshot).HasMaxLength(80).IsRequired();
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.MerchantCommissionPercentage).HasPrecision(5, 2);
            e.Property(x => x.CommissionUnitAmount).HasPrecision(18, 2);
            e.HasIndex(x => new { x.RevisionId, x.SourceReportLineId }).IsUnique();
            e.HasIndex(x => new { x.ProductVariantId, x.LineType });
            e.HasOne(x => x.RevisionRecord).WithMany(x => x.Lines).HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentSalesReportLine>().WithMany().HasForeignKey(x => x.SourceReportLineId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentPriceTerm>().WithMany().HasForeignKey(x => x.PriceTermId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Salesperson>().WithMany().HasForeignKey(x => x.CommissionSalespersonId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CommissionRule>().WithMany().HasForeignKey(x => x.CommissionRuleId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentCommissionRecovery>(e =>
        {
            e.ToTable("ConsignmentCommissionRecoveries", t =>
                t.HasCheckConstraint("CK_ConsignmentCommissionRecovery_Values",
                    "[SettlementRevision] > 0 AND [Quantity] > 0 AND [UnitAmount] > 0 AND [Amount] > 0 AND [Amount] = [Quantity] * [UnitAmount]"));
            e.Property(x => x.UnitAmount).HasPrecision(18, 2);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            // One row per revision, over-paid commission row and cause: a recalculation can't record the same obligation twice.
            e.HasIndex(x => new { x.SettlementId, x.SettlementRevision, x.OriginCommissionId, x.CausedBySettlementId }).IsUnique();
            e.HasIndex(x => x.CausedBySettlementId);
            e.HasIndex(x => x.CommissionPayoutId);
            e.HasOne(x => x.Settlement).WithMany().HasForeignKey(x => x.SettlementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentSettlement>().WithMany().HasForeignKey(x => x.CausedBySettlementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.OriginCommission).WithMany().HasForeignKey(x => x.OriginCommissionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CommissionPayout>().WithMany().HasForeignKey(x => x.CommissionPayoutId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Salesperson>().WithMany().HasForeignKey(x => x.SalespersonId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<ConsignmentSettlementReceipt>(e =>
        {
            e.ToTable("ConsignmentSettlementReceipts", t =>
            {
                t.HasCheckConstraint("CK_ConsignmentSettlementReceipt_Amount", "[Amount] > 0");
                t.HasCheckConstraint("CK_ConsignmentSettlementReceipt_Reference", "[Reference] IS NOT NULL AND LEN([Reference]) >= 3");
                t.HasCheckConstraint("CK_ConsignmentSettlementReceipt_VoidShape",
                    "([VoidedAt] IS NULL AND [VoidedByAdminUserId] IS NULL AND [VoidReason] IS NULL) OR "
                    + "([VoidedAt] IS NOT NULL AND [VoidedByAdminUserId] IS NOT NULL AND [VoidReason] IS NOT NULL)");
            });
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Method).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Reference).HasMaxLength(200).IsRequired();
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.IdempotencyKey).HasMaxLength(80).IsRequired();
            e.Property(x => x.RequestFingerprint).HasMaxLength(128).IsRequired();
            e.Property(x => x.VoidReason).HasMaxLength(1000);
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
            e.HasIndex(x => new { x.SettlementId, x.ReceivedOn });
            e.HasOne(x => x.Settlement).WithMany(x => x.Receipts).HasForeignKey(x => x.SettlementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.RecordedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.VoidedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
