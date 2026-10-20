using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Data;

public sealed partial class MyPetLinkDbContext
{
    public DbSet<ConsignmentAgreement> ConsignmentAgreements => Set<ConsignmentAgreement>();
    public DbSet<ConsignmentDispatch> ConsignmentDispatches => Set<ConsignmentDispatch>();
    public DbSet<ConsignmentUnit> ConsignmentUnits => Set<ConsignmentUnit>();
    public DbSet<ConsignmentMovement> ConsignmentMovements => Set<ConsignmentMovement>();
    public DbSet<ConsignmentHandoverRecord> ConsignmentHandoverRecords => Set<ConsignmentHandoverRecord>();
    public DbSet<ConsignmentDraftContributor> ConsignmentDraftContributors => Set<ConsignmentDraftContributor>();

    public DbSet<ConsignmentApprovalPolicy> ConsignmentApprovalPolicies => Set<ConsignmentApprovalPolicy>();
    public DbSet<ConsignmentReviewEvent> ConsignmentReviewEvents => Set<ConsignmentReviewEvent>();
    public DbSet<ConsignmentPartnerPrefix> ConsignmentPartnerPrefixes => Set<ConsignmentPartnerPrefix>();
    public DbSet<ConsignmentDefaultTerms> ConsignmentDefaultTerms => Set<ConsignmentDefaultTerms>();
    public DbSet<ConsignmentDefaultTermsRevision> ConsignmentDefaultTermsRevisions => Set<ConsignmentDefaultTermsRevision>();
    public DbSet<ConsignmentAgreementDocument> ConsignmentAgreementDocuments => Set<ConsignmentAgreementDocument>();
    public DbSet<ConsignmentSignedAgreement> ConsignmentSignedAgreements => Set<ConsignmentSignedAgreement>();

    private void EnforceConsignmentReviewHistory()
    {
        if(ChangeTracker.Entries<ConsignmentReviewEvent>().Any(e=>e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Consignment review history is append-only.");
        // An issued agreement and a partner's signed copy are evidence of what was sent and signed.
        if(ChangeTracker.Entries().Any(e=>e.Entity is ConsignmentAgreementDocument or ConsignmentSignedAgreement or ConsignmentDefaultTermsRevision
            && e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Issued and signed consignment agreements are append-only.");
        EnforceConsignmentStockLedger();
    }
    private static void ConfigureConsignment(ModelBuilder model)
    {
        model.Entity<ConsignmentApprovalPolicy>(e=> {
            e.ToTable("ConsignmentApprovalPolicies",t=>t.HasCheckConstraint("CK_ConsignmentApprovalPolicy", "[Id] = 1 AND [Mode] IN ('Team','Solo') AND ([Mode] = 'Team' OR [SelfReviewerAdminUserId] IS NOT NULL)"));
            e.Property(x=>x.Id).ValueGeneratedNever();
            e.Property(x=>x.Mode).HasConversion<string>().HasMaxLength(8);
            e.Property(x=>x.RowVersion).IsRowVersion();
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x=>x.SelfReviewerAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x=>x.UpdatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentReviewEvent>(e=> {
            e.ToTable("ConsignmentReviewEvents");
            e.Property(x=>x.Action).HasMaxLength(40);
            e.Property(x=>x.ReviewMode).HasMaxLength(32);
            e.Property(x=>x.PolicyMode).HasMaxLength(8);
            e.Property(x=>x.PreviousPolicyMode).HasMaxLength(8);
            e.Property(x=>x.PolicyVersion).HasMaxLength(32);
            e.Property(x=>x.RequestReference).HasMaxLength(1000);
            e.Property(x=>x.Reason).HasMaxLength(1000);
            e.Property(x=>x.ExternalEvidenceReference).HasMaxLength(1000);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x=>x.ActorAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x=>x.SelfReviewerAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x=>x.PreviousSelfReviewerAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentAgreement>().WithMany().HasForeignKey(x=>x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentDispatch>().WithMany(x=>x.ReviewEvents).HasForeignKey(x=>x.DispatchId).OnDelete(DeleteBehavior.Restrict);
            e.Property(x=>x.SubjectType).HasMaxLength(32);
            e.HasIndex(x=>new {x.RecordedAt,x.ReviewMode});
            // RequestReference (up to 2,000 bytes) is carried, not keyed: keying it pushed
            // this index past SQL Server's 1,700-byte limit, failing long references at insert.
            e.HasIndex(x=>new {x.DispatchId,x.Action}).IncludeProperties(x=>x.RequestReference);
            e.HasIndex(x=>new {x.SubjectType,x.SubjectId});
        });
        model.Entity<ConsignmentDraftContributor>(e => {
            e.HasKey(x => new { x.AgreementId, x.AdminUserId });
            e.HasOne<ConsignmentAgreement>().WithMany(x => x.DraftContributors).HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.AdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentAgreement>(e =>
        {
            e.ToTable("ConsignmentAgreements", t => {
                t.HasCheckConstraint("CK_ConsignmentAgreement_Status", "[Status] IN ('Draft','Active','Closed') AND [Version] > 0");
                t.HasCheckConstraint("CK_ConsignmentAgreement_Rate", "[PartnerCommissionPercentage] BETWEEN 0 AND 100");
                t.HasCheckConstraint("CK_ConsignmentAgreement_Dates", "[EffectiveTo] IS NULL OR [EffectiveTo] > [EffectiveFrom]");
                t.HasCheckConstraint("CK_ConsignmentAgreement_Deadline", "[PaymentDeadlineDays] IS NULL OR [PaymentDeadlineDays] BETWEEN 0 AND 365");
            });
            e.Property(x => x.ApprovalReviewMode).HasMaxLength(32);
            e.Property(x => x.Reference).HasMaxLength(100).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.PartnerCommissionPercentage).HasPrecision(5,2);
            e.Property(x => x.RowVersion).IsRowVersion();
            foreach (var name in new[] { "DurationTerms", "SettlementFrequency", "DiscountTerms", "ReturnTerms", "LossTerms", "SignedAgreementReference", "ExternalTrackerReference" })
                e.Property<string>(name).HasMaxLength(2000);
            e.HasIndex(x => new { x.MerchantId, x.Reference, x.Version }).IsUnique();
            // A reference names one agreement across every merchant; versions share it.
            e.HasIndex(x => new { x.Reference, x.Version }).IsUnique();
            e.Property(x => x.CreationKey).HasMaxLength(80);
            e.Property(x => x.CreationRequestFingerprint).HasMaxLength(64);
            e.HasIndex(x => x.CreationKey).IsUnique().HasFilter("[CreationKey] IS NOT NULL");
            e.HasOne<ConsignmentDefaultTermsRevision>().WithMany().HasForeignKey(x => x.DefaultTermsRevision).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.MerchantId, x.Status, x.EffectiveFrom });
            e.HasIndex(x => new { x.MerchantId, x.Reference }).IsUnique().HasFilter("[Status] = 'Active'");
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.UpdatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ApprovedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Merchant).WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentAgreement>().WithMany().HasForeignKey(x => x.SupersedesAgreementId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentDispatch>(e =>
        {
            e.ToTable("ConsignmentDispatches", t => {
                t.HasCheckConstraint("CK_ConsignmentDispatch_Status", "[Status] IN ('Reserved','Dispatched','Received','Cancelled')");
                t.HasCheckConstraint("CK_ConsignmentDispatch_Rate", "[CommissionPercentageSnapshot] BETWEEN 0 AND 100 AND [AgreementVersionSnapshot] > 0");
            });
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.UpdatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.DispatchedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ReceivedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<MerchantBranch>().WithMany().HasForeignKey(x => x.MerchantBranchId).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.RecipientName).HasMaxLength(200);
            e.Property(x => x.IssuedDocumentSha256).HasMaxLength(64);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.DispatchNumber).HasMaxLength(48);
            e.Property(x => x.IdempotencyKey).HasMaxLength(80);
            e.Property(x => x.RequestFingerprint).HasMaxLength(64);
            e.Property(x => x.MerchantNameSnapshot).HasMaxLength(200);
            e.Property(x => x.AgreementReferenceSnapshot).HasMaxLength(100);
            e.Property(x => x.CommissionPercentageSnapshot).HasPrecision(5,2);
            e.Property(x => x.DestinationSnapshot).HasMaxLength(2000);
            e.Property(x => x.ExternalTrackerReference).HasMaxLength(2000);
            e.Property(x => x.ShipmentReference).HasMaxLength(1000);
            e.Property(x => x.ReceiptAcknowledgment).HasMaxLength(1000);
            ConfigureSellerSnapshot(e.OwnsOne(x => x.Seller));
            e.HasIndex(x => x.DispatchNumber).IsUnique();
            e.HasIndex(x => x.IdempotencyKey).IsUnique();
            e.HasIndex(x => x.RequestFingerprint).IsUnique().HasFilter("[Status] = 'Reserved'");
            e.HasIndex(x => new { x.AgreementId, x.Status, x.CreatedAt });
            e.HasOne(x => x.Agreement).WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentUnit>(e =>
        {
            e.HasAlternateKey(x => new { x.Id, x.DispatchId });
            e.ToTable("ConsignmentUnits", t => t.HasCheckConstraint("CK_ConsignmentUnit_Release", "([Status] = 'Released' AND [ReleasedAt] IS NOT NULL) OR ([Status] IN ('Reserved','Dispatched','Received','ReturnedQuarantine','ExternalHandover','WrittenOff') AND [ReleasedAt] IS NULL)"));
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.ReceivingState).HasConversion<string>().HasMaxLength(24);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.DiscrepancyRecordedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.Property(x => x.TagCodeSnapshot).HasMaxLength(32);
            e.Property(x => x.SkuSnapshot).HasMaxLength(80);
            e.Property(x => x.ProductNameSnapshot).HasMaxLength(200);
            e.Property(x => x.VariantSnapshot).HasMaxLength(200);
            e.Property(x => x.BatchNumberSnapshot).HasMaxLength(100);
            e.Property(x => x.ExternalReference).HasMaxLength(1000);
            e.HasIndex(x => x.SmartTagId).IsUnique().HasFilter("[ReleasedAt] IS NULL");
            e.HasIndex(x => new { x.DispatchId, x.Status });
            e.HasOne(x => x.Dispatch).WithMany(x => x.Units).HasForeignKey(x => x.DispatchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.SmartTag).WithMany().HasForeignKey(x => x.SmartTagId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<TagProductVariant>().WithMany().HasForeignKey(x => x.ProductVariantId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentMovement>(e =>
        {
            e.ToTable("ConsignmentMovements");
            e.Property(x => x.ReviewMode).HasMaxLength(32);
            e.Property(x => x.Action).HasMaxLength(40);
            e.Property(x => x.Reference).HasMaxLength(1000);
            e.Property(x => x.EvidenceJson).HasMaxLength(6000);
            e.HasOne(x => x.Dispatch).WithMany(x => x.Movements).HasForeignKey(x => x.DispatchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentUnit>().WithMany().HasForeignKey(x => new { x.UnitId, x.DispatchId })
                .HasPrincipalKey(x => new { x.Id, x.DispatchId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ActorAdminUser).WithMany().HasForeignKey(x => x.ActorAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.DispatchId, x.OccurredAt });
        });
        model.Entity<ConsignmentHandoverRecord>(e =>
        {
            e.ToTable("ConsignmentHandoverRecords", t => {
                t.HasCheckConstraint("CK_ConsignmentHandover_Kind", "[Kind] IN ('Handover','Correction','Reversal')");
                t.HasCheckConstraint("CK_ConsignmentHandover_Amounts", "([IsReportedSale] = 0 AND [SellingPrice] IS NULL AND [DiscountAmount] IS NULL) OR ([IsReportedSale] = 1 AND [SellingPrice] >= 0 AND [DiscountAmount] >= 0)");
            });
            e.Property(x => x.EventReference).HasMaxLength(150);
            e.Property(x => x.Kind).HasMaxLength(24);
            e.Property(x => x.EvidenceReference).HasMaxLength(1000);
            e.Property(x => x.DiscountDescription).HasMaxLength(1000);
            e.Property(x => x.SellingPrice).HasPrecision(18,2);
            e.Property(x => x.DiscountAmount).HasPrecision(18,2);
            e.Property(x => x.Attribution).HasConversion<string>().HasMaxLength(24);
            e.HasIndex(x => new { x.MerchantId, x.EventReference }).IsUnique();
            e.HasIndex(x => x.SupersedesRecordId).IsUnique().HasFilter("[SupersedesRecordId] IS NOT NULL");
            e.HasIndex(x => new { x.MerchantId, x.EventAt });
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentAgreement>().WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentUnit>().WithMany().HasForeignKey(x => new { x.UnitId, x.DispatchId })
                .HasPrincipalKey(x => new { x.Id, x.DispatchId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.ActorAdminUserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentDispatch>().WithMany(x => x.HandoverRecords).HasForeignKey(x => x.DispatchId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ConsignmentHandoverRecord>().WithMany().HasForeignKey(x => x.SupersedesRecordId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentDefaultTerms>(e =>
        {
            e.ToTable("ConsignmentDefaultTerms", t => {
                t.HasCheckConstraint("CK_ConsignmentDefaultTerms_Singleton", "[Id] = 1");
                t.HasCheckConstraint("CK_ConsignmentDefaultTerms_Values", "([PartnerCommissionPercentage] IS NULL OR [PartnerCommissionPercentage] BETWEEN 0 AND 100) AND ([TrialDurationDays] IS NULL OR [TrialDurationDays] BETWEEN 1 AND 3650) AND ([PaymentDeadlineDays] IS NULL OR [PaymentDeadlineDays] BETWEEN 0 AND 365)");
                t.HasCheckConstraint("CK_ConsignmentDefaultTerms_Active", "[IsActive] = 0 OR ([PartnerCommissionPercentage] IS NOT NULL AND [TrialDurationDays] IS NOT NULL AND [PaymentDeadlineDays] IS NOT NULL AND [DurationTerms] IS NOT NULL AND [SettlementFrequency] IS NOT NULL AND [DiscountTerms] IS NOT NULL AND [ReturnTerms] IS NOT NULL AND [LossTerms] IS NOT NULL)");
            });
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.PartnerCommissionPercentage).HasPrecision(5,2);
            foreach (var name in new[] { "DurationTerms", "SettlementFrequency", "DiscountTerms", "ReturnTerms", "LossTerms" })
                e.Property<string>(name).HasMaxLength(2000);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.UpdatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentDefaultTermsRevision>(e =>
        {
            e.ToTable("ConsignmentDefaultTermsRevisions");
            e.HasKey(x => x.Revision);
            e.Property(x => x.Revision).ValueGeneratedNever();
            e.Property(x => x.PartnerCommissionPercentage).HasPrecision(5,2);
            foreach (var name in new[] { "DurationTerms", "SettlementFrequency", "DiscountTerms", "ReturnTerms", "LossTerms" })
                e.Property<string>(name).HasMaxLength(2000);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.RecordedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentPartnerPrefix>(e =>
        {
            e.ToTable("ConsignmentPartnerPrefixes", t => t.HasCheckConstraint("CK_ConsignmentPartnerPrefix_Format",
                "LEN([Prefix]) BETWEEN 2 AND 12 AND [Prefix] COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9]%' AND LEFT([Prefix],1) COLLATE Latin1_General_BIN LIKE '[A-Z]'"));
            e.HasKey(x => x.MerchantId);
            e.Property(x => x.Prefix).HasMaxLength(12);
            e.HasIndex(x => x.Prefix).IsUnique();
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne<Merchant>().WithOne().HasForeignKey<ConsignmentPartnerPrefix>(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.UpdatedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentAgreementDocument>(e =>
        {
            e.ToTable("ConsignmentAgreementDocuments", t => t.HasCheckConstraint("CK_ConsignmentAgreementDocument_Issue", "[IssueNumber] > 0 AND [AgreementVersion] > 0"));
            e.Property(x => x.AgreementReference).HasMaxLength(100);
            e.Property(x => x.TermsFingerprint).HasMaxLength(64);
            e.Property(x => x.ContentSha256).HasMaxLength(64);
            e.Property(x => x.FileName).HasMaxLength(200);
            e.HasIndex(x => new { x.AgreementId, x.IssueNumber }).IsUnique();
            e.HasOne(x => x.Agreement).WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.IssuedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ConsignmentSignedAgreement>(e =>
        {
            e.ToTable("ConsignmentSignedAgreements", t => t.HasCheckConstraint("CK_ConsignmentSignedAgreement_File", "[FileSize] > 0 AND [ContentType] IN ('application/pdf','image/jpeg','image/png')"));
            e.Property(x => x.TermsFingerprint).HasMaxLength(64);
            e.Property(x => x.OriginalFileName).HasMaxLength(200);
            e.Property(x => x.ContentType).HasMaxLength(64);
            e.Property(x => x.Sha256).HasMaxLength(64);
            e.Property(x => x.PartnerSignatoryName).HasMaxLength(200);
            e.Property(x => x.PartnerSignatoryDesignation).HasMaxLength(200);
            e.Property(x => x.CompanySignatoryName).HasMaxLength(200);
            e.Property(x => x.CompanySignatoryDesignation).HasMaxLength(200);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasIndex(x => new { x.AgreementId, x.UploadedAt });
            e.HasOne<ConsignmentAgreement>().WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.IssuedDocument).WithMany().HasForeignKey(x => x.IssuedDocumentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<AdminUser>().WithMany().HasForeignKey(x => x.UploadedByAdminUserId).OnDelete(DeleteBehavior.Restrict);
        });
        ConfigureConsignmentStocktake(model);
        ConfigureConsignmentSales(model);
    }
}
