using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Data;

public sealed class MyPetLinkDbContext : DbContext
{
    private readonly TimeProvider _timeProvider;
    private static readonly Guid FreePlanId = Guid.Parse("4e5e2a13-34c0-4a36-b1b3-30830ca642e9");
    private static readonly Guid PremiumPlanId = Guid.Parse("1faefb03-9b58-4889-a03b-c9ed34c5fa0f");
    private static readonly Guid FreePlanLimitId = Guid.Parse("8d6684b1-b25f-4e1a-a353-48621f6fb2c2");
    private static readonly Guid PremiumPlanLimitId = Guid.Parse("d65c4c7d-821b-496c-bb3d-ea5bf951d65d");
    private static readonly DateTimeOffset SeededAt = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    // Variant presets migrated from the previously fixed Lightweight/Standard
    // values. Ids are stable so the migration backfill is deterministic.
    public static readonly Guid StandardVariantPresetId = Guid.Parse("3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c01");
    public static readonly Guid LightweightVariantPresetId = Guid.Parse("3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c02");

    public MyPetLinkDbContext(DbContextOptions<MyPetLinkDbContext> options)
        : this(options, TimeProvider.System)
    {
    }

    public MyPetLinkDbContext(
        DbContextOptions<MyPetLinkDbContext> options,
        TimeProvider timeProvider)
        : base(options)
    {
        _timeProvider = timeProvider;
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<ExternalLogin> ExternalLogins => Set<ExternalLogin>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<OwnerProfile> OwnerProfiles => Set<OwnerProfile>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<PlanLimit> PlanLimits => Set<PlanLimit>();
    public DbSet<Pet> Pets => Set<Pet>();
    public DbSet<PetContact> PetContacts => Set<PetContact>();
    public DbSet<PetPublicProfile> PetPublicProfiles => Set<PetPublicProfile>();
    public DbSet<PetSafetySetting> PetSafetySettings => Set<PetSafetySetting>();
    public DbSet<PublicSiteSetting> PublicSiteSettings => Set<PublicSiteSetting>();
    public DbSet<MediaFile> MediaFiles => Set<MediaFile>();
    public DbSet<MediaFileLink> MediaFileLinks => Set<MediaFileLink>();
    public DbSet<PetMemory> PetMemories => Set<PetMemory>();
    public DbSet<CareRecord> CareRecords => Set<CareRecord>();
    public DbSet<TagVariantPreset> TagVariantPresets => Set<TagVariantPreset>();
    public DbSet<TagProduct> TagProducts => Set<TagProduct>();
    public DbSet<TagProductVariant> TagProductVariants => Set<TagProductVariant>();
    public DbSet<TagProductMedia> TagProductMedia => Set<TagProductMedia>();
    public DbSet<Promotion> Promotions => Set<Promotion>();
    public DbSet<PromotionVariant> PromotionVariants => Set<PromotionVariant>();
    public DbSet<SmartTagBatch> SmartTagBatches => Set<SmartTagBatch>();
    public DbSet<SmartTag> SmartTags => Set<SmartTag>();
    public DbSet<TagOrder> TagOrders => Set<TagOrder>();
    public DbSet<TagOrderItem> TagOrderItems => Set<TagOrderItem>();
    public DbSet<DeliveryRate> DeliveryRates => Set<DeliveryRate>();
    public DbSet<DeliveryStateRateOverride> DeliveryStateRateOverrides =>
        Set<DeliveryStateRateOverride>();
    public DbSet<OrderCheckoutSetting> OrderCheckoutSettings => Set<OrderCheckoutSetting>();

    public DbSet<ShippingFulfilmentSetting> ShippingFulfilmentSettings =>
        Set<ShippingFulfilmentSetting>();
    public DbSet<ShippingCourierProvider> ShippingCourierProviders =>
        Set<ShippingCourierProvider>();
    public DbSet<PaymentProof> PaymentProofs => Set<PaymentProof>();
    public DbSet<Merchant> Merchants => Set<Merchant>();
    public DbSet<Salesperson> Salespersons => Set<Salesperson>();
    public DbSet<MerchantQuotation> MerchantQuotations => Set<MerchantQuotation>();
    public DbSet<MerchantQuotationItem> MerchantQuotationItems => Set<MerchantQuotationItem>();
    public DbSet<MerchantOrder> MerchantOrders => Set<MerchantOrder>();
    public DbSet<MerchantOrderItem> MerchantOrderItems => Set<MerchantOrderItem>();
    public DbSet<MerchantOrderAllocatedTag> MerchantOrderAllocatedTags =>
        Set<MerchantOrderAllocatedTag>();
    public DbSet<MerchantDeliveryOrder> MerchantDeliveryOrders => Set<MerchantDeliveryOrder>();
    public DbSet<MerchantDeliveryOrderItem> MerchantDeliveryOrderItems =>
        Set<MerchantDeliveryOrderItem>();
    public DbSet<DocumentNumberCounter> DocumentNumberCounters => Set<DocumentNumberCounter>();
    public DbSet<MerchantInvoice> MerchantInvoices => Set<MerchantInvoice>();
    public DbSet<MerchantInvoiceItem> MerchantInvoiceItems => Set<MerchantInvoiceItem>();
    public DbSet<MerchantPayment> MerchantPayments => Set<MerchantPayment>();
    public DbSet<MerchantReceipt> MerchantReceipts => Set<MerchantReceipt>();
    public DbSet<MerchantReceiptItem> MerchantReceiptItems => Set<MerchantReceiptItem>();
    public DbSet<SalesCommission> SalesCommissions => Set<SalesCommission>();
    public DbSet<BusinessIdentitySetting> BusinessIdentitySettings =>
        Set<BusinessIdentitySetting>();
    public DbSet<EmailOutbox> EmailOutbox => Set<EmailOutbox>();
    public DbSet<EmailTemplateSetting> EmailTemplateSettings => Set<EmailTemplateSetting>();
    // Legacy, no runtime consumer. Mapped only so the table and its rows
    // survive a rollback to the previously deployed API.
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();
    public DbSet<TagScan> TagScans => Set<TagScan>();
    public DbSet<FoundReport> FoundReports => Set<FoundReport>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampAuditableEntities();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        StampAuditableEntities();
        return base.SaveChanges();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ConfigureAccounts(modelBuilder);
        ConfigurePlans(modelBuilder);
        ConfigurePets(modelBuilder);
        ConfigurePublicSite(modelBuilder);
        ConfigureCareMedia(modelBuilder);
        ConfigureTagCatalog(modelBuilder);
        ConfigureDelivery(modelBuilder);
        ConfigureShipping(modelBuilder);
        ConfigureTagsAndOrders(modelBuilder);
        ConfigureOperations(modelBuilder);
        SeedDefaults(modelBuilder);
    }

    private static void ConfigureDelivery(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DeliveryRate>(entity =>
        {
            entity.ToTable("DeliveryRates");
            entity.Property(item => item.Name).HasMaxLength(120);
            entity.Property(item => item.ZoneCode).HasMaxLength(16);
            entity.Property(item => item.ApplicableStateCodesJson).HasMaxLength(500);
            entity.Property(item => item.Fee).HasPrecision(18, 2);
            entity.Property(item => item.Currency).HasMaxLength(3);
            entity.Property(item => item.FreeShippingThreshold).HasPrecision(18, 2);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.ZoneCode).IsUnique();
            entity.HasIndex(item => new { item.IsActive, item.DisplayOrder });
        });

        modelBuilder.Entity<DeliveryStateRateOverride>(entity =>
        {
            entity.ToTable("DeliveryStateRateOverrides");
            entity.Property(item => item.StateCode).HasMaxLength(8);
            entity.Property(item => item.Fee).HasPrecision(18, 2);
            entity.Property(item => item.Currency).HasMaxLength(3);
            entity.Property(item => item.FreeShippingThreshold).HasPrecision(18, 2);
            entity.Property(item => item.RowVersion).IsRowVersion();
            // One override per canonical state.
            entity.HasIndex(item => item.StateCode).IsUnique();
            entity.HasIndex(item => item.IsEnabled);
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureShipping(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OrderCheckoutSetting>(entity =>
        {
            entity.ToTable("OrderCheckoutSettings");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });


        // --- Merchant Sales ------------------------------------------------
        // Bulk B2B sales keeps its own tables. A merchant order carries
        // wholesale prices and never a pet, so folding it into TagOrders would
        // mean a column set where half is always null.
        modelBuilder.Entity<Merchant>(entity =>
        {
            entity.ToTable("Merchants");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.MerchantCode).HasMaxLength(32).IsRequired();
            entity.HasIndex(item => item.MerchantCode).IsUnique();
            entity.Property(item => item.LegalBusinessName).HasMaxLength(200).IsRequired();
            entity.Property(item => item.TradingName).HasMaxLength(200);
            entity.Property(item => item.BusinessRegistrationNumber).HasMaxLength(64);
            entity.Property(item => item.NormalizedBusinessRegistrationNumber).HasMaxLength(64);
            // Duplicate detection reads this column, so it is indexed but not
            // unique: several merchants may legitimately leave it blank.
            entity.HasIndex(item => item.NormalizedBusinessRegistrationNumber);
            entity.Property(item => item.TaxIdentificationNumber).HasMaxLength(64);
            entity.Property(item => item.SstRegistrationNumber).HasMaxLength(64);
            entity.Property(item => item.ContactPerson).HasMaxLength(160).IsRequired();
            entity.Property(item => item.ContactEmail).HasMaxLength(254).IsRequired();
            entity.Property(item => item.ContactPhone).HasMaxLength(32).IsRequired();
            entity.Property(item => item.BillingAddressLine1).HasMaxLength(240).IsRequired();
            entity.Property(item => item.BillingAddressLine2).HasMaxLength(240);
            entity.Property(item => item.BillingPostcode).HasMaxLength(16).IsRequired();
            entity.Property(item => item.BillingCity).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingState).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingCountry).HasMaxLength(80).IsRequired();
            entity.Property(item => item.DeliveryAddressLine1).HasMaxLength(240).IsRequired();
            entity.Property(item => item.DeliveryAddressLine2).HasMaxLength(240);
            entity.Property(item => item.DeliveryPostcode).HasMaxLength(16).IsRequired();
            entity.Property(item => item.DeliveryCity).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryState).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryCountry).HasMaxLength(80).IsRequired();
            entity.Property(item => item.PaymentTerm).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.InternalNotes).HasMaxLength(2000);
            entity.HasIndex(item => item.IsActive);
            entity.HasOne(item => item.AssignedSalesperson)
                .WithMany()
                .HasForeignKey(item => item.AssignedSalespersonId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Salesperson>(entity =>
        {
            entity.ToTable("Salespersons");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.SalespersonCode).HasMaxLength(32).IsRequired();
            entity.HasIndex(item => item.SalespersonCode).IsUnique();
            entity.Property(item => item.Name).HasMaxLength(160).IsRequired();
            entity.Property(item => item.Email).HasMaxLength(254);
            entity.Property(item => item.Phone).HasMaxLength(32);
            entity.Property(item => item.DefaultCommissionPercentage).HasPrecision(5, 2);
            entity.Property(item => item.InternalNotes).HasMaxLength(2000);
            entity.HasIndex(item => item.IsActive);
        });

        modelBuilder.Entity<MerchantQuotation>(entity =>
        {
            entity.ToTable("MerchantQuotations");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.QuotationNumber).HasMaxLength(48).IsRequired();
            entity.HasIndex(item => item.QuotationNumber).IsUnique();
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.PaymentTermSnapshot).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Currency).HasMaxLength(3).IsRequired();
            entity.Property(item => item.MerchandiseSubtotal).HasPrecision(18, 2);
            entity.Property(item => item.DiscountTotal).HasPrecision(18, 2);
            entity.Property(item => item.DeliveryFee).HasPrecision(18, 2);
            entity.Property(item => item.GrandTotal).HasPrecision(18, 2);
            entity.Property(item => item.SalespersonCommissionPercentageSnapshot).HasPrecision(5, 2);
            entity.Property(item => item.MerchantCodeSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.MerchantLegalNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.MerchantTradingNameSnapshot).HasMaxLength(200);
            entity.Property(item => item.MerchantRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantTaxIdentificationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantSstRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.ContactPersonSnapshot).HasMaxLength(160).IsRequired();
            entity.Property(item => item.ContactEmailSnapshot).HasMaxLength(254).IsRequired();
            entity.Property(item => item.ContactPhoneSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.BillingAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.BillingAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.BillingPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.BillingCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.DeliveryAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.DeliveryAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.DeliveryPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.DeliveryCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.SalespersonCodeSnapshot).HasMaxLength(32);
            entity.Property(item => item.SalespersonNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.CustomerNotes).HasMaxLength(2000);
            ConfigureSellerSnapshot(entity.OwnsOne(item => item.Seller));
            entity.Property(item => item.InternalNotes).HasMaxLength(2000);
            entity.HasIndex(item => new { item.Status, item.QuotationDate });
            entity.HasIndex(item => item.MerchantId);
            entity.HasOne(item => item.Merchant)
                .WithMany()
                .HasForeignKey(item => item.MerchantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Salesperson)
                .WithMany()
                .HasForeignKey(item => item.SalespersonId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ConvertedMerchantOrder)
                .WithMany()
                .HasForeignKey(item => item.ConvertedMerchantOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(item => item.Items)
                .WithOne(line => line.Quotation!)
                .HasForeignKey(line => line.QuotationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MerchantQuotationItem>(entity =>
        {
            entity.ToTable("MerchantQuotationItems");
            entity.Property(item => item.ProductNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.SkuCodeSnapshot).HasMaxLength(64).IsRequired();
            entity.Property(item => item.OptionNameSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.WholesaleUnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.LineDiscount).HasPrecision(18, 2);
            entity.Property(item => item.LineSubtotal).HasPrecision(18, 2);
            entity.Property(item => item.UnitWeightGramsSnapshot).HasPrecision(10, 2);
            entity.HasIndex(item => item.QuotationId);
        });

        modelBuilder.Entity<MerchantOrder>(entity =>
        {
            entity.ToTable("MerchantOrders");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.MerchantOrderNumber).HasMaxLength(48).IsRequired();
            entity.HasIndex(item => item.MerchantOrderNumber).IsUnique();
            // One order per quotation. This unique filtered index is what makes
            // a second concurrent conversion impossible rather than unlikely.
            entity.HasIndex(item => item.SourceQuotationId)
                .IsUnique()
                .HasFilter("[SourceQuotationId] IS NOT NULL");
            entity.Property(item => item.PaymentStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.FulfilmentStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.PaymentTermSnapshot).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Currency).HasMaxLength(3).IsRequired();
            entity.Property(item => item.MerchandiseSubtotal).HasPrecision(18, 2);
            entity.Property(item => item.DiscountTotal).HasPrecision(18, 2);
            entity.Property(item => item.DeliveryFee).HasPrecision(18, 2);
            entity.Property(item => item.GrandTotal).HasPrecision(18, 2);
            entity.Property(item => item.SalespersonCommissionPercentageSnapshot).HasPrecision(5, 2);
            entity.Property(item => item.MerchantCodeSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.MerchantLegalNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.MerchantTradingNameSnapshot).HasMaxLength(200);
            entity.Property(item => item.MerchantRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantTaxIdentificationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantSstRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.ContactPersonSnapshot).HasMaxLength(160).IsRequired();
            entity.Property(item => item.ContactEmailSnapshot).HasMaxLength(254).IsRequired();
            entity.Property(item => item.ContactPhoneSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.BillingAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.BillingAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.BillingPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.BillingCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.DeliveryAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.DeliveryAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.DeliveryPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.DeliveryCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.SalespersonCodeSnapshot).HasMaxLength(32);
            entity.Property(item => item.SalespersonNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.InternalNotes).HasMaxLength(2000);
            entity.Property(item => item.CourierProviderCode).HasMaxLength(32);
            entity.Property(item => item.CourierProvider).HasMaxLength(120);
            entity.Property(item => item.CourierService).HasMaxLength(120);
            entity.Property(item => item.TrackingNumber).HasMaxLength(64);
            entity.Property(item => item.TrackingUrlSnapshot).HasMaxLength(500);
            entity.Property(item => item.InternalCourierCost).HasPrecision(18, 2);
            entity.Property(item => item.InternalShippingNotes).HasMaxLength(2000);
            entity.HasIndex(item => new { item.PaymentStatus, item.CreatedAt });
            entity.HasIndex(item => new { item.FulfilmentStatus, item.CreatedAt });
            entity.HasIndex(item => item.MerchantId);
            entity.HasOne(item => item.FulfilmentUpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.FulfilmentUpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Merchant)
                .WithMany()
                .HasForeignKey(item => item.MerchantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Salesperson)
                .WithMany()
                .HasForeignKey(item => item.SalespersonId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.SourceQuotation)
                .WithMany()
                .HasForeignKey(item => item.SourceQuotationId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(item => item.Items)
                .WithOne(line => line.MerchantOrder!)
                .HasForeignKey(line => line.MerchantOrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MerchantOrderItem>(entity =>
        {
            entity.ToTable("MerchantOrderItems");
            entity.Property(item => item.ProductNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.SkuCodeSnapshot).HasMaxLength(64).IsRequired();
            entity.Property(item => item.OptionNameSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.WholesaleUnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.LineDiscount).HasPrecision(18, 2);
            entity.Property(item => item.LineSubtotal).HasPrecision(18, 2);
            entity.Property(item => item.UnitWeightGramsSnapshot).HasPrecision(10, 2);
            entity.HasIndex(item => item.MerchantOrderId);
        });

        modelBuilder.Entity<MerchantOrderAllocatedTag>(entity =>
        {
            entity.ToTable("MerchantOrderAllocatedTags");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.TagCodeSnapshot).HasMaxLength(64).IsRequired();
            entity.Property(item => item.BatchNoSnapshot).HasMaxLength(64);
            entity.Property(item => item.ReleasedReason).HasMaxLength(500);

            // One physical tag can be held by one merchant order at a time. The
            // filter is what makes a second concurrent allocation impossible
            // rather than unlikely, while still keeping released rows for audit.
            entity.HasIndex(item => item.SmartTagId)
                .IsUnique()
                .HasDatabaseName("IX_MerchantOrderAllocatedTags_SmartTagId_Active")
                .HasFilter("[ReleasedAt] IS NULL");

            entity.HasIndex(item => new { item.MerchantOrderItemId, item.ReleasedAt });
            entity.HasIndex(item => new { item.MerchantOrderId, item.ReleasedAt });
            entity.HasIndex(item => item.MerchantId);

            entity.HasOne(item => item.MerchantOrder)
                .WithMany(order => order.AllocatedTags)
                .HasForeignKey(item => item.MerchantOrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.MerchantOrderItem)
                .WithMany()
                .HasForeignKey(item => item.MerchantOrderItemId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Merchant)
                .WithMany()
                .HasForeignKey(item => item.MerchantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.SmartTag)
                .WithMany()
                .HasForeignKey(item => item.SmartTagId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Batch)
                .WithMany()
                .HasForeignKey(item => item.BatchId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.AllocatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.AllocatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ReleasedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.ReleasedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MerchantDeliveryOrder>(entity =>
        {
            entity.ToTable("MerchantDeliveryOrders");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.DeliveryOrderNumber).HasMaxLength(48).IsRequired();
            entity.HasIndex(item => item.DeliveryOrderNumber).IsUnique();

            // One live delivery order per merchant order, enforced by the
            // database so a concurrent second issue cannot succeed.
            entity.HasIndex(item => item.MerchantOrderId)
                .IsUnique()
                .HasDatabaseName("IX_MerchantDeliveryOrders_MerchantOrderId_Active")
                .HasFilter("[CancelledAt] IS NULL");

            entity.Property(item => item.MerchantOrderNumberSnapshot).HasMaxLength(48).IsRequired();
            entity.Property(item => item.MerchantCodeSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.MerchantLegalNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.MerchantTradingNameSnapshot).HasMaxLength(200);
            entity.Property(item => item.ContactPersonSnapshot).HasMaxLength(160).IsRequired();
            entity.Property(item => item.ContactEmailSnapshot).HasMaxLength(254).IsRequired();
            entity.Property(item => item.ContactPhoneSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.DeliveryAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.DeliveryAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.DeliveryPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.DeliveryCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DeliveryCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.CourierProviderSnapshot).HasMaxLength(120);
            entity.Property(item => item.CourierServiceSnapshot).HasMaxLength(120);
            entity.Property(item => item.TrackingNumberSnapshot).HasMaxLength(64);
            entity.OwnsOne(item => item.Seller, ConfigureSellerSnapshot);

            entity.HasOne(item => item.MerchantOrder)
                .WithMany()
                .HasForeignKey(item => item.MerchantOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.IssuedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.IssuedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(item => item.Items)
                .WithOne(line => line.MerchantDeliveryOrder!)
                .HasForeignKey(line => line.MerchantDeliveryOrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MerchantDeliveryOrderItem>(entity =>
        {
            entity.ToTable("MerchantDeliveryOrderItems");
            entity.Property(item => item.ProductNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.SkuCodeSnapshot).HasMaxLength(64).IsRequired();
            entity.Property(item => item.OptionNameSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BatchSummarySnapshot).HasMaxLength(1000).IsRequired();
            entity.HasIndex(item => item.MerchantDeliveryOrderId);
        });


        modelBuilder.Entity<MerchantInvoice>(entity =>
        {
            entity.ToTable("MerchantInvoices");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.InvoiceNumber).HasMaxLength(48).IsRequired();
            entity.HasIndex(item => item.InvoiceNumber).IsUnique();
            // One live invoice per order. A cancelled invoice is excluded so the
            // order can be re-invoiced, but two open bills are impossible rather
            // than merely unlikely.
            entity.HasIndex(item => item.MerchantOrderId)
                .IsUnique()
                .HasFilter("[Status] <> 'Cancelled'");
            entity.HasIndex(item => new { item.Status, item.InvoiceDate });
            entity.HasIndex(item => item.MerchantId);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.PaymentTermSnapshot).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Currency).HasMaxLength(3).IsRequired();
            entity.Property(item => item.MerchandiseSubtotal).HasPrecision(18, 2);
            entity.Property(item => item.DiscountTotal).HasPrecision(18, 2);
            entity.Property(item => item.DeliveryFee).HasPrecision(18, 2);
            entity.Property(item => item.GrandTotal).HasPrecision(18, 2);
            entity.Property(item => item.MerchantCodeSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.MerchantLegalNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.MerchantTradingNameSnapshot).HasMaxLength(200);
            entity.Property(item => item.MerchantRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantTaxIdentificationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantSstRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.ContactPersonSnapshot).HasMaxLength(160).IsRequired();
            entity.Property(item => item.ContactEmailSnapshot).HasMaxLength(254).IsRequired();
            entity.Property(item => item.ContactPhoneSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.BillingAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.BillingAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.BillingPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.BillingCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.MerchantOrderNumberSnapshot).HasMaxLength(48).IsRequired();
            entity.Property(item => item.SourceQuotationNumberSnapshot).HasMaxLength(48);
            entity.Property(item => item.InternalNotes).HasMaxLength(2000);
            ConfigureSellerSnapshot(entity.OwnsOne(item => item.Seller));
            entity.HasOne(item => item.MerchantOrder)
                .WithMany()
                .HasForeignKey(item => item.MerchantOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Merchant)
                .WithMany()
                .HasForeignKey(item => item.MerchantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(item => item.Items)
                .WithOne(line => line.MerchantInvoice!)
                .HasForeignKey(line => line.MerchantInvoiceId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(item => item.Payments)
                .WithOne(payment => payment.MerchantInvoice!)
                .HasForeignKey(payment => payment.MerchantInvoiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MerchantInvoiceItem>(entity =>
        {
            entity.ToTable("MerchantInvoiceItems");
            entity.Property(item => item.ProductNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.SkuCodeSnapshot).HasMaxLength(64).IsRequired();
            entity.Property(item => item.OptionNameSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.WholesaleUnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.LineDiscount).HasPrecision(18, 2);
            entity.Property(item => item.LineSubtotal).HasPrecision(18, 2);
            entity.HasIndex(item => item.MerchantInvoiceId);
        });

        modelBuilder.Entity<MerchantPayment>(entity =>
        {
            entity.ToTable("MerchantPayments");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.AmountReceived).HasPrecision(18, 2);
            entity.Property(item => item.Currency).HasMaxLength(3).IsRequired();
            entity.Property(item => item.Method).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.TransactionReference).HasMaxLength(120);
            entity.Property(item => item.InternalNote).HasMaxLength(2000);
            // Full payment only, so an invoice can have at most one payment.
            entity.HasIndex(item => item.MerchantInvoiceId).IsUnique();
            entity.HasIndex(item => item.MerchantOrderId);
            entity.HasOne(item => item.MerchantOrder)
                .WithMany()
                .HasForeignKey(item => item.MerchantOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.PaymentProofMediaFile)
                .WithMany()
                .HasForeignKey(item => item.PaymentProofMediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.RecordedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.RecordedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MerchantReceipt>(entity =>
        {
            entity.ToTable("MerchantReceipts");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.ReceiptNumber).HasMaxLength(48).IsRequired();
            entity.HasIndex(item => item.ReceiptNumber).IsUnique();
            // One receipt per paid invoice: confirming payment twice must not
            // put two official receipts in a merchant's hands.
            entity.HasIndex(item => item.MerchantInvoiceId).IsUnique();
            entity.HasIndex(item => item.MerchantPaymentId).IsUnique();
            entity.HasIndex(item => item.MerchantId);
            entity.Property(item => item.PaymentMethod).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.TransactionReference).HasMaxLength(120);
            entity.Property(item => item.Currency).HasMaxLength(3).IsRequired();
            entity.Property(item => item.MerchandiseSubtotal).HasPrecision(18, 2);
            entity.Property(item => item.DiscountTotal).HasPrecision(18, 2);
            entity.Property(item => item.DeliveryFee).HasPrecision(18, 2);
            entity.Property(item => item.AmountPaid).HasPrecision(18, 2);
            entity.Property(item => item.MerchantLegalNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.MerchantTradingNameSnapshot).HasMaxLength(200);
            entity.Property(item => item.MerchantRegistrationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.MerchantTaxIdentificationNumberSnapshot).HasMaxLength(64);
            entity.Property(item => item.ContactPersonSnapshot).HasMaxLength(160).IsRequired();
            entity.Property(item => item.ContactEmailSnapshot).HasMaxLength(254).IsRequired();
            entity.Property(item => item.BillingAddressLine1Snapshot).HasMaxLength(240).IsRequired();
            entity.Property(item => item.BillingAddressLine2Snapshot).HasMaxLength(240);
            entity.Property(item => item.BillingPostcodeSnapshot).HasMaxLength(16).IsRequired();
            entity.Property(item => item.BillingCitySnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingStateSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.BillingCountrySnapshot).HasMaxLength(80).IsRequired();
            entity.Property(item => item.InvoiceNumberSnapshot).HasMaxLength(48).IsRequired();
            entity.Property(item => item.MerchantOrderNumberSnapshot).HasMaxLength(48).IsRequired();
            ConfigureSellerSnapshot(entity.OwnsOne(item => item.Seller));
            entity.HasOne(item => item.MerchantInvoice)
                .WithMany()
                .HasForeignKey(item => item.MerchantInvoiceId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.MerchantPayment)
                .WithMany()
                .HasForeignKey(item => item.MerchantPaymentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.MerchantOrder)
                .WithMany()
                .HasForeignKey(item => item.MerchantOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Merchant)
                .WithMany()
                .HasForeignKey(item => item.MerchantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(item => item.Items)
                .WithOne(line => line.MerchantReceipt!)
                .HasForeignKey(line => line.MerchantReceiptId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MerchantReceiptItem>(entity =>
        {
            entity.ToTable("MerchantReceiptItems");
            entity.Property(item => item.ProductNameSnapshot).HasMaxLength(200).IsRequired();
            entity.Property(item => item.SkuCodeSnapshot).HasMaxLength(64).IsRequired();
            entity.Property(item => item.OptionNameSnapshot).HasMaxLength(120).IsRequired();
            entity.Property(item => item.WholesaleUnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.LineDiscount).HasPrecision(18, 2);
            entity.Property(item => item.LineSubtotal).HasPrecision(18, 2);
            entity.HasIndex(item => item.MerchantReceiptId);
        });

        modelBuilder.Entity<SalesCommission>(entity =>
        {
            entity.ToTable("SalesCommissions");
            entity.Property(item => item.RowVersion).IsRowVersion();
            // One commission per payment: a repeated confirmation must not pay
            // a salesperson twice.
            entity.HasIndex(item => item.MerchantPaymentId).IsUnique();
            entity.HasIndex(item => new { item.SalespersonId, item.Status });
            entity.HasIndex(item => item.MerchantOrderId);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Currency).HasMaxLength(3).IsRequired();
            entity.Property(item => item.CommissionPercentageSnapshot).HasPrecision(5, 2);
            entity.Property(item => item.CommissionBaseAmount).HasPrecision(18, 2);
            entity.Property(item => item.CommissionAmount).HasPrecision(18, 2);
            entity.Property(item => item.SalespersonCodeSnapshot).HasMaxLength(32).IsRequired();
            entity.Property(item => item.SalespersonNameSnapshot).HasMaxLength(160).IsRequired();
            entity.Property(item => item.InternalNote).HasMaxLength(2000);
            entity.HasOne(item => item.MerchantOrder)
                .WithMany()
                .HasForeignKey(item => item.MerchantOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.MerchantPayment)
                .WithMany()
                .HasForeignKey(item => item.MerchantPaymentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Salesperson)
                .WithMany()
                .HasForeignKey(item => item.SalespersonId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DocumentNumberCounter>(entity =>
        {
            entity.ToTable("DocumentNumberCounters");
            entity.HasKey(item => item.CounterKey);
            entity.Property(item => item.CounterKey).HasMaxLength(64);
        });


        modelBuilder.Entity<BusinessIdentitySetting>(entity =>
        {
            entity.ToTable("BusinessIdentitySettings");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.BrandName).HasMaxLength(120).IsRequired();
            entity.Property(item => item.LegalBusinessName).HasMaxLength(200).IsRequired();
            entity.Property(item => item.BusinessRegistrationNumber).HasMaxLength(64).IsRequired();
            entity.Property(item => item.TaxIdentificationNumber).HasMaxLength(64);
            entity.Property(item => item.SstRegistrationNumber).HasMaxLength(64);
            entity.Property(item => item.RegisteredAddressLine1).HasMaxLength(240);
            entity.Property(item => item.RegisteredAddressLine2).HasMaxLength(240);
            entity.Property(item => item.RegisteredPostcode).HasMaxLength(16);
            entity.Property(item => item.RegisteredCity).HasMaxLength(120);
            entity.Property(item => item.RegisteredState).HasMaxLength(120);
            entity.Property(item => item.RegisteredCountry).HasMaxLength(80).IsRequired();
            entity.Property(item => item.SupportEmail).HasMaxLength(254).IsRequired();
            entity.Property(item => item.BusinessPhone).HasMaxLength(32);
            entity.Property(item => item.BusinessWebsite).HasMaxLength(200);
            entity.Property(item => item.PaymentInstructions).HasMaxLength(2000);
            entity.Property(item => item.BankAccountName).HasMaxLength(200);
            entity.Property(item => item.BankName).HasMaxLength(120);
            entity.Property(item => item.BankAccountNumber).HasMaxLength(64);
            entity.Property(item => item.DuitNowDisplayName).HasMaxLength(120);
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ShippingFulfilmentSetting>(entity =>
        {
            entity.ToTable("ShippingFulfilmentSettings");
            entity.Property(item => item.SenderName).HasMaxLength(160);
            entity.Property(item => item.CompanyName).HasMaxLength(160);
            entity.Property(item => item.SenderPhone).HasMaxLength(32);
            entity.Property(item => item.SenderEmail).HasMaxLength(254);
            entity.Property(item => item.AddressLine1).HasMaxLength(240);
            entity.Property(item => item.AddressLine2).HasMaxLength(240);
            entity.Property(item => item.City).HasMaxLength(120);
            entity.Property(item => item.Postcode).HasMaxLength(5);
            entity.Property(item => item.StateCode).HasMaxLength(8);
            entity.Property(item => item.Country).HasMaxLength(80);
            entity.Property(item => item.DefaultParcelWeightKg).HasPrecision(8, 3);
            entity.Property(item => item.DefaultParcelLengthCm).HasPrecision(8, 2);
            entity.Property(item => item.DefaultParcelWidthCm).HasPrecision(8, 2);
            entity.Property(item => item.DefaultParcelHeightCm).HasPrecision(8, 2);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ShippingCourierProvider>(entity =>
        {
            entity.ToTable("ShippingCourierProviders");
            entity.Property(item => item.Code).HasMaxLength(32);
            entity.Property(item => item.DisplayName).HasMaxLength(120);
            entity.Property(item => item.TrackingUrlTemplate).HasMaxLength(500);
            entity.Property(item => item.InternalNotes).HasMaxLength(1000);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.Code).IsUnique();
            entity.HasIndex(item => item.IsDefault)
                .IsUnique()
                .HasFilter("[IsDefault] = 1");
            entity.HasIndex(item => new { item.IsActive, item.DisplayOrder, item.DisplayName });
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureTagCatalog(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TagVariantPreset>(entity =>
        {
            entity.ToTable("TagVariantPresets");
            entity.Property(item => item.Code).HasMaxLength(40);
            entity.Property(item => item.DisplayName).HasMaxLength(80);
            entity.Property(item => item.Description).HasMaxLength(400);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.Code).IsUnique();
            entity.HasIndex(item => item.DisplayName).IsUnique();
            entity.HasIndex(item => new { item.IsActive, item.SortOrder });
        });

        modelBuilder.Entity<TagProduct>(entity =>
        {
            entity.ToTable("TagProducts");
            entity.Property(item => item.Name).HasMaxLength(160);
            entity.Property(item => item.Slug).HasMaxLength(120);
            entity.Property(item => item.ShortDescription).HasMaxLength(300);
            entity.Property(item => item.Description).HasMaxLength(4000);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.Slug).IsUnique();
            entity.HasIndex(item => new { item.IsPublished, item.IsArchived, item.SortOrder });
            entity.HasIndex(item => item.UpdatedAt);
        });

        modelBuilder.Entity<TagProductVariant>(entity =>
        {
            entity.ToTable("TagProductVariants");
            entity.Property(item => item.PublicKey).HasMaxLength(32);
            entity.Property(item => item.Sku).HasMaxLength(80);
            entity.Property(item => item.DisplayName).HasMaxLength(160);
            entity.Property(item => item.TagVariant).HasMaxLength(80);
            entity.Property(item => item.WidthMm).HasPrecision(10, 2);
            entity.Property(item => item.HeightMm).HasPrecision(10, 2);
            entity.Property(item => item.ThicknessMm).HasPrecision(10, 2);
            entity.Property(item => item.WeightGrams).HasPrecision(10, 2);
            entity.Property(item => item.Material).HasMaxLength(160);
            entity.Property(item => item.Shape).HasMaxLength(120);
            entity.Property(item => item.Colour).HasMaxLength(120);
            entity.Property(item => item.PackagingType).HasMaxLength(200);
            entity.Property(item => item.BasePrice).HasPrecision(18, 2);
            entity.Property(item => item.CompareAtPrice).HasPrecision(18, 2);
            entity.Property(item => item.Currency).HasMaxLength(3);
            entity.Property(item => item.PrintTemplateCode).HasMaxLength(120);
            entity.Property(item => item.ProductionNotes).HasMaxLength(1000);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.PublicKey).IsUnique();
            entity.HasIndex(item => item.Sku).IsUnique();
            entity.HasIndex(item => item.TagProductId);
            entity.HasIndex(item => new { item.IsActive, item.IsPurchasable, item.ArchivedAt });
            entity.HasIndex(item => new { item.SupportsQr, item.SupportsNfc });
            entity.HasIndex(item => item.TagVariantPresetId);
            entity.HasOne(item => item.TagProduct)
                .WithMany(product => product.Variants)
                .HasForeignKey(item => item.TagProductId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.TagVariantPreset)
                .WithMany(preset => preset.ProductVariants)
                .HasForeignKey(item => item.TagVariantPresetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TagProductMedia>(entity =>
        {
            entity.ToTable("TagProductMedia");
            entity.Property(item => item.AltText).HasMaxLength(300);
            entity.HasIndex(item => new { item.TagProductId, item.SortOrder });
            entity.HasIndex(item => new { item.TagProductVariantId, item.SortOrder });
            entity.HasIndex(item => item.MediaFileId);
            entity.HasOne(item => item.TagProduct)
                .WithMany(product => product.Media)
                .HasForeignKey(item => item.TagProductId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.TagProductVariant)
                .WithMany(variant => variant.Media)
                .HasForeignKey(item => item.TagProductVariantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.MediaFile)
                .WithMany()
                .HasForeignKey(item => item.MediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Promotion>(entity =>
        {
            entity.ToTable("Promotions");
            entity.Property(item => item.Name).HasMaxLength(160);
            entity.Property(item => item.InternalDescription).HasMaxLength(1000);
            entity.Property(item => item.DisplayLabel).HasMaxLength(160);
            entity.Property(item => item.DiscountType).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.DiscountValue).HasPrecision(18, 2);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => new { item.IsActive, item.IsAutomatic, item.StartsAt, item.EndsAt });
            entity.HasIndex(item => item.Priority);
            entity.HasIndex(item => item.UpdatedAt);
        });

        modelBuilder.Entity<PromotionVariant>(entity =>
        {
            entity.ToTable("PromotionVariants");
            entity.HasKey(item => new { item.PromotionId, item.TagProductVariantId });
            entity.HasIndex(item => item.TagProductVariantId);
            entity.HasOne(item => item.Promotion)
                .WithMany(promotion => promotion.PromotionVariants)
                .HasForeignKey(item => item.PromotionId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.TagProductVariant)
                .WithMany(variant => variant.PromotionVariants)
                .HasForeignKey(item => item.TagProductVariantId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private void StampAuditableEntities()
    {
        var now = _timeProvider.GetUtcNow();

        foreach (var entry in ChangeTracker.Entries<AuditableEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }

            if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
            }
        }
    }

    private static void ConfigureAccounts(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.Property(item => item.Email).HasMaxLength(320);
            entity.Property(item => item.NormalizedEmail).HasMaxLength(320);
            entity.Property(item => item.DisplayName).HasMaxLength(200);
            entity.Property(item => item.PhoneE164).HasMaxLength(32);
            entity.Property(item => item.WhatsappE164).HasMaxLength(32);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(item => item.NormalizedEmail).IsUnique();
            entity.HasIndex(item => item.Status);
            entity.HasIndex(item => item.CreatedAt);
            entity.HasIndex(item => item.UpdatedAt);
        });

        modelBuilder.Entity<ExternalLogin>(entity =>
        {
            entity.ToTable("ExternalLogins");
            entity.Property(item => item.Provider).HasMaxLength(64);
            entity.Property(item => item.ProviderSubjectId).HasMaxLength(200);
            entity.Property(item => item.ProviderEmail).HasMaxLength(320);
            entity.Property(item => item.ProviderDisplayName).HasMaxLength(200);
            entity.HasIndex(item => new { item.Provider, item.ProviderSubjectId }).IsUnique();
            entity.HasIndex(item => item.UserId);
            entity.HasOne(item => item.User)
                .WithMany(user => user.ExternalLogins)
                .HasForeignKey(item => item.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("RefreshTokens");
            entity.Property(item => item.TokenHash).HasMaxLength(128);
            entity.Property(item => item.CreatedByIp).HasMaxLength(64);
            entity.Property(item => item.RevokedByIp).HasMaxLength(64);
            entity.HasIndex(item => item.UserId);
            entity.HasIndex(item => item.TokenHash).IsUnique();
            entity.HasIndex(item => item.ExpiresAt);
            entity.HasOne(item => item.User)
                .WithMany(user => user.RefreshTokens)
                .HasForeignKey(item => item.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ReplacedByToken)
                .WithMany()
                .HasForeignKey(item => item.ReplacedByTokenId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OwnerProfile>(entity =>
        {
            entity.ToTable("OwnerProfiles");
            entity.Property(item => item.OwnerDisplayName).HasMaxLength(200);
            entity.Property(item => item.DefaultGeneralArea).HasMaxLength(200);
            entity.Property(item => item.MarketingEmailOptIn).HasDefaultValue(false);
            entity.HasIndex(item => item.UserId).IsUnique();
            entity.HasIndex(item => item.PlanId);
            entity.HasOne(item => item.User)
                .WithOne(user => user.OwnerProfile)
                .HasForeignKey<OwnerProfile>(item => item.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Plan)
                .WithMany(plan => plan.OwnerProfiles)
                .HasForeignKey(item => item.PlanId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AdminUser>(entity =>
        {
            entity.ToTable("AdminUsers");
            entity.Property(item => item.Role).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(item => item.UserId).IsUnique();
            entity.HasIndex(item => item.Role);
            entity.HasIndex(item => item.IsActive);
            entity.HasOne(item => item.User)
                .WithOne(user => user.AdminUser)
                .HasForeignKey<AdminUser>(item => item.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CreatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.CreatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigurePlans(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Plan>(entity =>
        {
            entity.ToTable("Plans");
            entity.Property(item => item.Code).HasMaxLength(64);
            entity.Property(item => item.Name).HasMaxLength(120);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.PriceLabel).HasMaxLength(64);
            entity.Property(item => item.BillingNote).HasMaxLength(240);
            entity.HasIndex(item => item.Code).IsUnique();
            entity.HasIndex(item => item.Status);
        });

        modelBuilder.Entity<PlanLimit>(entity =>
        {
            entity.ToTable("PlanLimits");
            entity.HasIndex(item => item.PlanId).IsUnique();
            entity.HasOne(item => item.Plan)
                .WithOne(plan => plan.Limit)
                .HasForeignKey<PlanLimit>(item => item.PlanId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigurePets(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Pet>(entity =>
        {
            entity.ToTable("Pets");
            entity.Property(item => item.Slug).HasMaxLength(160);
            entity.Property(item => item.Name).HasMaxLength(120);
            entity.Property(item => item.Species).HasMaxLength(80);
            entity.Property(item => item.CustomSpecies).HasMaxLength(120);
            entity.Property(item => item.EstimatedBirthYear).HasColumnType("smallint");
            entity.Property(item => item.GeneralArea).HasMaxLength(200);
            entity.Property(item => item.ProfileTheme).HasMaxLength(64);
            entity.Property(item => item.CoverPositionX).HasDefaultValue((byte)50);
            entity.Property(item => item.CoverPositionY).HasDefaultValue((byte)50);
            entity.Property(item => item.AllergiesJson).HasDefaultValue("[]");
            entity.Property(item => item.IsSampleEligible).HasDefaultValue(false);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.LifecycleStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.PreviousLifecycleStatus).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(item => item.OwnerUserId);
            entity.HasIndex(item => item.ProfileMediaFileId);
            entity.HasIndex(item => item.CoverMediaFileId);
            entity.HasIndex(item => new { item.OwnerUserId, item.LifecycleStatus });
            entity.HasIndex(item => item.LifecycleStatus);
            entity.HasIndex(item => item.LostModeEnabled);
            entity.HasIndex(item => item.Species);
            entity.HasIndex(item => item.CreatedAt);
            entity.HasIndex(item => item.UpdatedAt);
            entity.HasIndex(item => item.IsSampleEligible);
            entity.HasOne(item => item.OwnerUser)
                .WithMany(user => user.Pets)
                .HasForeignKey(item => item.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ProfileMediaFile)
                .WithMany()
                .HasForeignKey(item => item.ProfileMediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CoverMediaFile)
                .WithMany()
                .HasForeignKey(item => item.CoverMediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.SampleEligibilityUpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.SampleEligibilityUpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PetContact>(entity =>
        {
            entity.ToTable("PetContacts");
            entity.Property(item => item.OwnerDisplayName).HasMaxLength(200);
            entity.Property(item => item.PhoneE164).HasMaxLength(32);
            entity.Property(item => item.WhatsappE164).HasMaxLength(32);
            entity.Property(item => item.EmergencyContactE164).HasMaxLength(32);
            entity.Property(item => item.GeneralAreaOverride).HasMaxLength(200);
            entity.HasIndex(item => item.PetId).IsUnique();
            entity.HasOne(item => item.Pet)
                .WithOne(pet => pet.Contact)
                .HasForeignKey<PetContact>(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PetPublicProfile>(entity =>
        {
            entity.ToTable("PetPublicProfiles");
            entity.Property(item => item.PublicCode).HasMaxLength(80);
            entity.Property(item => item.SlugSnapshot).HasMaxLength(160);
            entity.Property(item => item.ShowAllergiesOnPublicProfile).HasDefaultValue(false);
            entity.HasIndex(item => item.PublicCode).IsUnique();
            entity.HasIndex(item => item.PetId).IsUnique();
            entity.HasIndex(item => new { item.IsPublicProfileEnabled, item.UpdatedAt });
            entity.HasOne(item => item.Pet)
                .WithOne(pet => pet.PublicProfile)
                .HasForeignKey<PetPublicProfile>(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PetSafetySetting>(entity =>
        {
            entity.ToTable("PetSafetySettings");
            entity.Property(item => item.SafetyCode).HasMaxLength(80);
            entity.HasIndex(item => item.SafetyCode).IsUnique();
            entity.HasIndex(item => item.PetId).IsUnique();
            entity.HasIndex(item => new { item.QrSafetyEnabled, item.UpdatedAt });
            entity.HasOne(item => item.Pet)
                .WithOne(pet => pet.SafetySetting)
                .HasForeignKey<PetSafetySetting>(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigurePublicSite(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PublicSiteSetting>(entity =>
        {
            entity.ToTable("PublicSiteSettings");
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.FeaturedSamplePetId).IsUnique();
            entity.HasOne(item => item.FeaturedSamplePet)
                .WithMany()
                .HasForeignKey(item => item.FeaturedSamplePetId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureCareMedia(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PetMemory>(entity =>
        {
            entity.ToTable("PetMemories");
            entity.Property(item => item.Title).HasMaxLength(160);
            entity.Property(item => item.Type).HasMaxLength(80);
            entity.Property(item => item.Visibility).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(item => new { item.PetId, item.CreatedAt });
            entity.HasIndex(item => new { item.PetId, item.Visibility });
            entity.HasIndex(item => new { item.PetId, item.ShowOnPublicProfile });
            entity.HasIndex(item => new { item.PetId, item.ShowInLifeTimeline });
            entity.HasOne(item => item.Pet)
                .WithMany(pet => pet.Memories)
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.CoverMediaFile)
                .WithMany()
                .HasForeignKey(item => item.CoverMediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CareRecord>(entity =>
        {
            entity.ToTable("CareRecords");
            entity.Property(item => item.Type).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Title).HasMaxLength(160);
            entity.Property(item => item.Provider).HasMaxLength(160);
            entity.Property(item => item.PublicVisibility).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(item => new { item.PetId, item.RecordDate });
            entity.HasIndex(item => new { item.PetId, item.DueDate });
            entity.HasIndex(item => new { item.PetId, item.Type });
            entity.HasIndex(item => new { item.PetId, item.PublicVisibility });
            entity.HasOne(item => item.Pet)
                .WithMany(pet => pet.CareRecords)
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MediaFile>(entity =>
        {
            entity.ToTable("MediaFiles");
            entity.Property(item => item.OriginalFileName).HasMaxLength(260);
            entity.Property(item => item.StorageFileName).HasMaxLength(260);
            entity.Property(item => item.ContentType).HasMaxLength(120);
            entity.Property(item => item.StorageProvider).HasMaxLength(64);
            entity.Property(item => item.StoragePath).HasMaxLength(600);
            entity.Property(item => item.BucketName).HasMaxLength(160);
            entity.Property(item => item.ObjectKey).HasMaxLength(600);
            entity.Property(item => item.ThumbnailObjectKey).HasMaxLength(600);
            entity.Property(item => item.MediaType)
                .HasConversion<string>()
                .HasMaxLength(32);
            entity.Property(item => item.Category)
                .HasConversion<string>()
                .HasMaxLength(64);
            entity.Property(item => item.UploadStatus)
                .HasConversion<string>()
                .HasMaxLength(32);
            entity.Property(item => item.Sha256).HasMaxLength(128);
            entity.HasIndex(item => item.OwnerUserId);
            entity.HasIndex(item => item.PetId);
            entity.HasIndex(item => item.StorageProvider);
            entity.HasIndex(item => new { item.BucketName, item.ObjectKey })
                .IsUnique()
                .HasFilter("[ObjectKey] <> ''");
            entity.HasIndex(item => item.MediaType);
            entity.HasIndex(item => item.Category);
            entity.HasIndex(item => item.UploadStatus);
            entity.HasIndex(item => item.IsPublic);
            entity.HasIndex(item => item.Sha256);
            entity.HasIndex(item => item.UploadedAt);
            entity.HasIndex(item => item.CompletedAt);
            entity.HasIndex(item => item.DeletedAt);
            entity.HasOne(item => item.OwnerUser)
                .WithMany()
                .HasForeignKey(item => item.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Pet)
                .WithMany(pet => pet.MediaFiles)
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MediaFileLink>(entity =>
        {
            entity.ToTable("MediaFileLinks");
            entity.Property(item => item.OwnerType).HasConversion<string>().HasMaxLength(64);
            entity.Property(item => item.Caption).HasMaxLength(240);
            entity.Property(item => item.AltText).HasMaxLength(240);
            entity.HasIndex(item => new { item.OwnerType, item.OwnerId, item.SortOrder });
            entity.HasIndex(item => item.MediaFileId);
            entity.HasOne(item => item.MediaFile)
                .WithMany(media => media.Links)
                .HasForeignKey(item => item.MediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureTagsAndOrders(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SmartTagBatch>(entity =>
        {
            entity.ToTable("SmartTagBatches");
            entity.Property(item => item.BatchNo).HasMaxLength(80);
            entity.Property(item => item.Variant).HasMaxLength(80);
            entity.Property(item => item.ResellerName).HasMaxLength(200);
            entity.HasIndex(item => item.BatchNo).IsUnique();
            entity.HasIndex(item => item.GeneratedAt);
            entity.HasIndex(item => item.HasNfc);
            entity.HasIndex(item => item.Variant);
            entity.HasIndex(item => item.ProductVariantId);
            entity.HasOne(item => item.GeneratedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.GeneratedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ProductVariant)
                .WithMany(variant => variant.SmartTagBatches)
                .HasForeignKey(item => item.ProductVariantId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SmartTag>(entity =>
        {
            entity.ToTable("SmartTags");
            entity.Property(item => item.TagCode).HasMaxLength(32);
            entity.Property(item => item.Variant).HasMaxLength(80);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.FulfilmentStatus)
                .HasConversion<string>()
                .HasMaxLength(32)
                .HasDefaultValue(TagFulfilmentStatus.Generated);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.TagCode).IsUnique();
            entity.HasIndex(item => item.OwnerUserId);
            entity.HasIndex(item => item.PetId);
            entity.HasIndex(item => item.OrderId);
            entity.HasIndex(item => item.BatchId);
            entity.HasIndex(item => item.ProductVariantId);
            entity.HasIndex(item => item.OrderItemId);
            entity.HasIndex(item => item.Status);
            entity.HasIndex(item => new { item.Status, item.PetId });
            entity.HasIndex(item => item.LastScannedAt);
            entity.HasIndex(item => item.ActivatedAt);
            entity.HasIndex(item => item.CreatedAt);
            entity.HasIndex(item => item.UpdatedAt);
            entity.HasIndex(item => item.FulfilmentStatus);
            entity.HasIndex(item => new { item.FulfilmentStatus, item.CreatedAt });
            entity.HasOne(item => item.OwnerUser)
                .WithMany()
                .HasForeignKey(item => item.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Pet)
                .WithMany(pet => pet.SmartTags)
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Order)
                .WithMany(order => order.AssignedTags)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.OrderItem)
                .WithMany(orderItem => orderItem.AssignedTags)
                .HasForeignKey(item => item.OrderItemId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Batch)
                .WithMany(batch => batch.SmartTags)
                .HasForeignKey(item => item.BatchId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ProductVariant)
                .WithMany(variant => variant.SmartTags)
                .HasForeignKey(item => item.ProductVariantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ReplacementForTag)
                .WithMany()
                .HasForeignKey(item => item.ReplacementForTagId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TagOrder>(entity =>
        {
            entity.ToTable("TagOrders");
            entity.Property(item => item.OrderNumber).HasMaxLength(80);
            entity.Property(item => item.ReceiptNumber).HasMaxLength(80);
            entity.Property(item => item.TagType).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Variant).HasMaxLength(80);
            entity.Property(item => item.Amount).HasPrecision(18, 2);
            entity.Property(item => item.Currency).HasMaxLength(3);
            entity.Property(item => item.DeliveryFee).HasPrecision(18, 2);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.PaymentStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.Property(item => item.RecipientName).HasMaxLength(160);
            entity.Property(item => item.DeliveryPhoneE164).HasMaxLength(32);
            entity.Property(item => item.AddressLine1).HasMaxLength(240);
            entity.Property(item => item.AddressLine2).HasMaxLength(240);
            entity.Property(item => item.Postcode).HasMaxLength(20);
            entity.Property(item => item.City).HasMaxLength(120);
            entity.Property(item => item.State).HasMaxLength(120);
            entity.Property(item => item.StateCode).HasMaxLength(8);
            entity.Property(item => item.Country).HasMaxLength(80);
            entity.Property(item => item.DeliveryZoneName).HasMaxLength(80);
            entity.Property(item => item.DeliveryMethodName).HasMaxLength(120);
            entity.Property(item => item.FreeShippingReason).HasMaxLength(240);
            entity.Property(item => item.DeliveryRateSource).HasMaxLength(32);
            entity.Property(item => item.TotalAmount).HasPrecision(18, 2);
            entity.Property(item => item.CourierProviderCode).HasMaxLength(32);
            entity.Property(item => item.CourierProvider).HasMaxLength(120);
            entity.Property(item => item.CourierService).HasMaxLength(120);
            entity.Property(item => item.TrackingNumber).HasMaxLength(120);
            entity.Property(item => item.ActualCourierCost).HasPrecision(18, 2);
            entity.Property(item => item.ShippingNotes).HasMaxLength(1000);
            entity.Property(item => item.IdempotencyKey).HasMaxLength(80);
            entity.Property(item => item.RequestFingerprint).HasMaxLength(128);
            entity.HasIndex(item => item.OrderNumber).IsUnique();
            entity.HasIndex(item => item.ReceiptNumber)
                .IsUnique()
                .HasFilter("[ReceiptNumber] IS NOT NULL");
            // One order per owner per idempotency key. Filtered so legacy rows
            // and requests that omit the key are unaffected.
            entity.HasIndex(item => new { item.OwnerUserId, item.IdempotencyKey })
                .IsUnique()
                .HasFilter("[IdempotencyKey] IS NOT NULL");
            entity.HasIndex(item => item.OwnerUserId);
            entity.HasIndex(item => item.PetId);
            entity.HasIndex(item => item.SmartTagId);
            entity.HasIndex(item => item.Status);
            entity.HasIndex(item => item.PaymentStatus);
            entity.HasIndex(item => item.CreatedAt);
            entity.HasIndex(item => item.UpdatedAt);
            entity.HasIndex(item => item.PaymentConfirmedAt);
            entity.HasIndex(item => item.ReadyToShipAt);
            entity.HasIndex(item => item.ShippedAt);
            entity.HasIndex(item => item.DeliveredAt);
            entity.HasIndex(item => new { item.Status, item.CreatedAt });
            entity.HasIndex(item => new { item.PaymentStatus, item.CreatedAt });
            entity.HasIndex(item => new { item.Status, item.PaymentReservationExpiresAt })
                .HasFilter("[PaymentReservationExpiresAt] IS NOT NULL");
            entity.HasOne(item => item.OwnerUser)
                .WithMany()
                .HasForeignKey(item => item.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Pet)
                .WithMany()
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.SmartTag)
                .WithMany()
                .HasForeignKey(item => item.SmartTagId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ReplacementForTag)
                .WithMany()
                .HasForeignKey(item => item.ReplacementForTagId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TagOrderItem>(entity =>
        {
            entity.ToTable("TagOrderItems");
            entity.Property(item => item.SkuSnapshot).HasMaxLength(80);
            entity.Property(item => item.ProductNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.VariantNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.PetNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.UnitBasePrice).HasPrecision(18, 2);
            entity.Property(item => item.Subtotal).HasPrecision(18, 2);
            entity.Property(item => item.PromotionNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.DiscountAmount).HasPrecision(18, 2);
            entity.Property(item => item.FinalUnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.FinalAmount).HasPrecision(18, 2);
            entity.Property(item => item.UnitWeightGramsSnapshot).HasPrecision(10, 2);
            entity.Property(item => item.Currency).HasMaxLength(3);
            entity.HasIndex(item => item.OrderId);
            entity.HasIndex(item => item.ProductVariantId);
            entity.HasIndex(item => item.PetId);
            entity.HasIndex(item => item.PromotionId);
            entity.HasOne(item => item.Order)
                .WithMany(order => order.Items)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Pet)
                .WithMany()
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ProductVariant)
                .WithMany(variant => variant.OrderItems)
                .HasForeignKey(item => item.ProductVariantId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Promotion)
                .WithMany(promotion => promotion.OrderItems)
                .HasForeignKey(item => item.PromotionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PaymentProof>(entity =>
        {
            entity.ToTable("PaymentProofs");
            entity.Property(item => item.OriginalFileName).HasMaxLength(260);
            entity.Property(item => item.StorageFileName).HasMaxLength(260);
            entity.Property(item => item.ContentType).HasMaxLength(120);
            entity.Property(item => item.StorageProvider).HasMaxLength(64);
            entity.Property(item => item.StoragePath).HasMaxLength(600);
            entity.Property(item => item.Sha256).HasMaxLength(128);
            entity.Property(item => item.PaymentMethod).HasMaxLength(80);
            entity.Property(item => item.SubmittedAmount).HasPrecision(18, 2);
            entity.Property(item => item.PaymentReference).HasMaxLength(160);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(item => item.OrderId);
            entity.HasIndex(item => item.MediaFileId);
            entity.HasIndex(item => item.Status);
            entity.HasIndex(item => item.UploadedAt);
            entity.HasIndex(item => item.ReviewedByAdminUserId);
            entity.HasIndex(item => item.ReviewedAt);
            entity.HasIndex(item => item.PaymentReference);
            entity.HasIndex(item => item.UpdatedAt);
            entity.HasIndex(item => new { item.Status, item.UploadedAt });
            entity.HasOne(item => item.Order)
                .WithMany(order => order.PaymentProofs)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.MediaFile)
                .WithMany()
                .HasForeignKey(item => item.MediaFileId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.ReviewedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.ReviewedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EmailOutbox>(entity =>
        {
            entity.ToTable("EmailOutbox", table =>
                table.HasCheckConstraint(
                    "CK_EmailOutbox_RelatedEntity",
                    "(CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END"
                    + " + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END"
                    + " + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END"
                    + " + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END"
                    + " + CASE WHEN [RelatedMerchantDeliveryOrderId] IS NULL THEN 0 ELSE 1 END)"
                    + " = 1"));
            entity.Property(item => item.MessageType).HasConversion<string>().HasMaxLength(64);
            entity.Property(item => item.RecipientEmail).HasMaxLength(320);
            entity.Property(item => item.RecipientName).HasMaxLength(160);
            entity.Property(item => item.Subject).HasMaxLength(240);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.LastError).HasMaxLength(600);
            entity.Property(item => item.SuppressionReason).HasMaxLength(200);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => new { item.MessageType, item.Status, item.CreatedAt });
            entity.HasIndex(item => new { item.RelatedOrderId, item.MessageType })
                .IsUnique()
                .HasFilter("[RelatedOrderId] IS NOT NULL");
            entity.HasIndex(item => new { item.RelatedUserId, item.MessageType })
                .IsUnique()
                .HasFilter("[RelatedUserId] IS NOT NULL");
            // One email of each kind per merchant document. This is what makes
            // a repeated send a no-op rather than a second copy in the
            // merchant's inbox.
            entity.HasIndex(item => new { item.RelatedMerchantQuotationId, item.MessageType })
                .IsUnique()
                .HasFilter("[RelatedMerchantQuotationId] IS NOT NULL");
            entity.HasIndex(item => new { item.RelatedMerchantInvoiceId, item.MessageType })
                .IsUnique()
                .HasFilter("[RelatedMerchantInvoiceId] IS NOT NULL");
            // One shipment notice per delivery order. Two admins pressing Mark
            // Shipped at the same moment lose the race here, in the database,
            // rather than in whichever one happened to read first.
            entity.HasIndex(item =>
                    new { item.RelatedMerchantDeliveryOrderId, item.MessageType })
                .IsUnique()
                .HasFilter("[RelatedMerchantDeliveryOrderId] IS NOT NULL");
            entity.HasIndex(item => new { item.Status, item.NextAttemptAt });
            entity.HasIndex(item => item.LockedUntil);
            entity.HasOne(item => item.RelatedOrder)
                .WithMany(order => order.EmailOutboxMessages)
                .HasForeignKey(item => item.RelatedOrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.RelatedUser)
                .WithMany(user => user.EmailOutboxMessages)
                .HasForeignKey(item => item.RelatedUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.RelatedMerchantQuotation)
                .WithMany()
                .HasForeignKey(item => item.RelatedMerchantQuotationId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.RelatedMerchantInvoice)
                .WithMany()
                .HasForeignKey(item => item.RelatedMerchantInvoiceId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.RelatedMerchantDeliveryOrder)
                .WithMany()
                .HasForeignKey(item => item.RelatedMerchantDeliveryOrderId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EmailTemplateSetting>(entity =>
        {
            entity.ToTable("EmailTemplateSettings");
            entity.Property(item => item.MessageType)
                .HasConversion<string>()
                .HasMaxLength(64);
            entity.Property(item => item.RowVersion).IsRowVersion();
            entity.HasIndex(item => item.MessageType).IsUnique();
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AppSetting>(entity =>
        {
            entity.ToTable("AppSettings");
            entity.Property(item => item.Key).HasMaxLength(160);
            entity.Property(item => item.Category).HasMaxLength(80);
            entity.HasIndex(item => item.Key).IsUnique();
            entity.HasIndex(item => item.Category);
            entity.HasIndex(item => item.IsPublic);
            entity.HasOne(item => item.UpdatedByAdminUser)
                .WithMany()
                .HasForeignKey(item => item.UpdatedByAdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    /// <summary>
    /// The seller details a document froze when it was issued.
    ///
    /// Typed columns rather than a JSON blob: the values stay queryable, and
    /// the schema stays honest about what each document actually captured.
    /// </summary>
    private static void ConfigureSellerSnapshot<TOwner>(
        OwnedNavigationBuilder<TOwner, SellerIdentitySnapshot> seller)
        where TOwner : class
    {
        seller.Property(item => item.BrandName).HasMaxLength(120).IsRequired();
        seller.Property(item => item.LegalBusinessName).HasMaxLength(200).IsRequired();
        seller.Property(item => item.BusinessRegistrationNumber).HasMaxLength(64).IsRequired();
        seller.Property(item => item.TaxIdentificationNumber).HasMaxLength(64);
        seller.Property(item => item.SstRegistrationNumber).HasMaxLength(64);
        seller.Property(item => item.AddressLine1).HasMaxLength(240).IsRequired();
        seller.Property(item => item.AddressLine2).HasMaxLength(240);
        seller.Property(item => item.Postcode).HasMaxLength(16).IsRequired();
        seller.Property(item => item.City).HasMaxLength(120).IsRequired();
        seller.Property(item => item.State).HasMaxLength(120).IsRequired();
        seller.Property(item => item.Country).HasMaxLength(80).IsRequired();
        seller.Property(item => item.SupportEmail).HasMaxLength(254).IsRequired();
        seller.Property(item => item.BusinessPhone).HasMaxLength(32);
        seller.Property(item => item.BusinessWebsite).HasMaxLength(200);
        seller.Property(item => item.PaymentInstructions).HasMaxLength(2000);
        seller.Property(item => item.BankAccountName).HasMaxLength(200);
        seller.Property(item => item.BankName).HasMaxLength(120);
        seller.Property(item => item.BankAccountNumber).HasMaxLength(64);
        seller.Property(item => item.DuitNowDisplayName).HasMaxLength(120);
    }

    private static void ConfigureOperations(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TagScan>(entity =>
        {
            entity.ToTable("TagScans");
            entity.Property(item => item.TagCode).HasMaxLength(32);
            entity.Property(item => item.ResolvedState)
                .HasConversion(new SafeNamedEnumStringConverter<TagScanResolvedState>(
                    TagScanResolvedState.Unknown))
                .HasMaxLength(32);
            entity.Property(item => item.Source)
                .HasConversion(new SafeNamedEnumStringConverter<TagScanSource>(
                    TagScanSource.Unknown))
                .HasMaxLength(16);
            entity.Property(item => item.Latitude).HasPrecision(9, 6);
            entity.Property(item => item.Longitude).HasPrecision(9, 6);
            entity.Property(item => item.Country).HasMaxLength(120);
            entity.Property(item => item.City).HasMaxLength(120);
            entity.Property(item => item.IpAddress).HasMaxLength(64);
            entity.HasIndex(item => item.SmartTagId);
            entity.HasIndex(item => item.PetId);
            entity.HasIndex(item => item.TagCode);
            entity.HasIndex(item => item.ResolvedState);
            entity.HasIndex(item => item.ScanTime);
            entity.HasIndex(item => new { item.SmartTagId, item.ScanTime });
            entity.HasIndex(item => new { item.SmartTagId, item.Source, item.ScanTime });
            entity.HasIndex(item => new { item.PetId, item.ScanTime });
            entity.HasIndex(item => new { item.Country, item.City });
            entity.HasOne(item => item.SmartTag)
                .WithMany()
                .HasForeignKey(item => item.SmartTagId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.Pet)
                .WithMany()
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<FoundReport>(entity =>
        {
            entity.ToTable("FoundReports");
            entity.Property(item => item.Latitude).HasPrecision(9, 6);
            entity.Property(item => item.Longitude).HasPrecision(9, 6);
            entity.Property(item => item.Country).HasMaxLength(120);
            entity.Property(item => item.City).HasMaxLength(120);
            entity.HasIndex(item => item.PetId);
            entity.HasIndex(item => item.SmartTagId);
            entity.HasIndex(item => item.TagScanId);
            entity.HasIndex(item => item.SubmittedAt);
            entity.HasOne(item => item.Pet)
                .WithMany()
                .HasForeignKey(item => item.PetId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.SmartTag)
                .WithMany()
                .HasForeignKey(item => item.SmartTagId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(item => item.TagScan)
                .WithMany()
                .HasForeignKey(item => item.TagScanId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("AuditLogs");
            entity.Property(item => item.ActorType).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Action).HasMaxLength(120);
            entity.Property(item => item.Entity).HasMaxLength(120);
            entity.Property(item => item.IpAddress).HasMaxLength(64);
            entity.HasIndex(item => new { item.Entity, item.EntityId });
            entity.HasIndex(item => new { item.ActorType, item.ActorId });
            entity.HasIndex(item => item.Action);
            entity.HasIndex(item => item.CreatedAt);
        });

    }

    private static void SeedDefaults(ModelBuilder modelBuilder)
    {
        SeedLegacyAppSettings(modelBuilder);

        // Checkout payment-window policy. Seeded at the approved two-hour
        // default so a fresh deployment never leaves reservations unbounded.
        modelBuilder.Entity<BusinessIdentitySetting>().HasData(
            new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId,
                BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "202603141718 (AS0515813-P)",
                RegisteredCountry = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
                BusinessWebsite = "mypetlink.com.my",
                // Registered address, tax numbers and bank details are left for
                // Admin to complete; guessing them would put fiction on an
                // invoice.
                RegisteredAddressLine1 = "",
                RegisteredPostcode = "",
                RegisteredCity = "",
                RegisteredState = "",
                UpdatedAt = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
            });

        modelBuilder.Entity<OrderCheckoutSetting>().HasData(
            new OrderCheckoutSetting
            {
                Id = OrderCheckoutSettingsService.SettingsId,
                PaymentReservationMinutes =
                    OrderCheckoutSetting.DefaultPaymentReservationMinutes,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            });

        // Deliberately unconfigured. A migration must never choose a customer
        // pet or enable a public marketing sample automatically.
        modelBuilder.Entity<PublicSiteSetting>().HasData(
            new PublicSiteSetting
            {
                Id = PublicSampleExperienceService.SettingsId,
                FeaturedSamplePetId = null,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            });

        modelBuilder.Entity<ShippingFulfilmentSetting>().HasData(
            new ShippingFulfilmentSetting
            {
                Id = ShippingFulfilmentService.SettingsId,
                SenderName = "",
                SenderPhone = "",
                AddressLine1 = "",
                City = "",
                Postcode = "",
                StateCode = "",
                Country = MalaysiaDelivery.CountryName,
                DefaultParcelWeightKg = 0.5m,
                DefaultParcelLengthCm = 18m,
                DefaultParcelWidthCm = 12m,
                DefaultParcelHeightCm = 3m,
                CustomerTrackingLinksEnabled = false,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            });

        // These mirror the previously hardcoded manual-shipment choices.
        // Tracking remains disabled until an administrator explicitly enables
        // customer links and configures a verified HTTPS template.
        modelBuilder.Entity<ShippingCourierProvider>().HasData(
            SeedCourier(ShippingFulfilmentService.JntCourierId, "JNT", "J&T Express", 10, true),
            SeedCourier(ShippingFulfilmentService.PosLajuCourierId, "POSLAJU", "Pos Laju", 20),
            SeedCourier(ShippingFulfilmentService.DhlCourierId, "DHL_ECOMMERCE", "DHL eCommerce", 30),
            SeedCourier(ShippingFulfilmentService.NinjaVanCourierId, "NINJA_VAN", "Ninja Van", 40));

        // Lightweight and Standard are migrated from the previously fixed
        // variant values already used by existing SKUs, inventory, and orders.
        modelBuilder.Entity<TagVariantPreset>().HasData(
            new TagVariantPreset
            {
                Id = StandardVariantPresetId,
                Code = "STANDARD",
                DisplayName = "Standard",
                Description = "Standard-size tag for dogs and medium to large pets.",
                IsActive = true,
                SortOrder = 0,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            },
            new TagVariantPreset
            {
                Id = LightweightVariantPresetId,
                Code = "LIGHTWEIGHT",
                DisplayName = "Lightweight",
                Description = "Lighter tag for cats and small pets.",
                IsActive = true,
                SortOrder = 1,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            });

        modelBuilder.Entity<Plan>().HasData(
            new Plan
            {
                Id = FreePlanId,
                Code = "Free",
                Name = "Free",
                Status = PlanStatus.Available,
                PriceLabel = "RM0",
                BillingNote = "Available now",
                Description = "Free MyPetLink pet profiles for Phase 1.",
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            },
            new Plan
            {
                Id = PremiumPlanId,
                Code = "Premium",
                Name = "Premium",
                Status = PlanStatus.ComingSoon,
                PriceLabel = "Coming Soon",
                BillingNote = "Not available in Phase 1",
                Description = "Premium features are planned for a future phase.",
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            });

        modelBuilder.Entity<PlanLimit>().HasData(
            new PlanLimit
            {
                Id = FreePlanLimitId,
                PlanId = FreePlanId,
                MaxPets = 3,
                MaxMemoriesPerPet = 10,
                MaxMediaPerMemory = 5,
                MaxFamilyMembers = 0,
                MaxCareRecords = 100,
                ScanHistoryDays = 0,
                AllowsSmartTagAddOns = true,
                AllowsFoundReports = true,
                AllowsAdvancedThemes = false,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            },
            new PlanLimit
            {
                Id = PremiumPlanLimitId,
                PlanId = PremiumPlanId,
                MaxPets = 10,
                MaxMemoriesPerPet = 100,
                MaxMediaPerMemory = 20,
                MaxFamilyMembers = 5,
                MaxCareRecords = 500,
                ScanHistoryDays = 365,
                AllowsSmartTagAddOns = true,
                AllowsFoundReports = true,
                AllowsAdvancedThemes = true,
                CreatedAt = SeededAt,
                UpdatedAt = SeededAt
            });

    }

    private static ShippingCourierProvider SeedCourier(
        Guid id,
        string code,
        string displayName,
        int displayOrder,
        bool isDefault = false) =>
        new()
        {
            Id = id,
            Code = code,
            DisplayName = displayName,
            IsActive = true,
            IsDefault = isDefault,
            DisplayOrder = displayOrder,
            CreatedAt = SeededAt,
            UpdatedAt = SeededAt
        };

        // Legacy seed retained so the model matches the existing table.
    private static void SeedLegacyAppSettings(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppSetting>().HasData(
            Setting("b60a097e-9407-4307-b224-e91f79838098", "tag.qr.price", "\"RM19.90\"", "Products", "QR Pet Tag one-time price.", true),
            Setting("6193a01f-686c-4b11-9a05-8a6e68ae8449", "tag.qr_nfc.price", "\"RM39.90\"", "Products", "QR + NFC Smart Tag one-time price.", true),
            Setting("eac37b9d-aa41-4067-8f67-e481aa3d4fec", "premium.status", "\"Coming Soon\"", "Features", "Premium availability label.", true),
            Setting("aa394a86-9c14-4f89-b3ad-1f013097d7e6", "gps.status", "\"Coming Later\"", "Features", "GPS availability label.", true),
            Setting("661dfec1-4635-44d6-818a-22b6b46ceeb8", "payment.mode", "\"Manual QR Payment\"", "Payments", "Manual payment proof review mode for Phase 1.", false));
    }

    private static AppSetting Setting(
        string id,
        string key,
        string valueJson,
        string category,
        string description,
        bool isPublic)
    {
        return new AppSetting
        {
            Id = Guid.Parse(id),
            Key = key,
            ValueJson = valueJson,
            Category = category,
            Description = description,
            IsPublic = isPublic,
            CreatedAt = SeededAt,
            UpdatedAt = SeededAt
        };
    }
}
