using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Data;

public sealed class MyPetLinkDbContext : DbContext
{
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
        : base(options)
    {
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
    public DbSet<PaymentProof> PaymentProofs => Set<PaymentProof>();
    public DbSet<TagScan> TagScans => Set<TagScan>();
    public DbSet<FoundReport> FoundReports => Set<FoundReport>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<AppSetting> AppSettings => Set<AppSetting>();

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
        ConfigureCareMedia(modelBuilder);
        ConfigureTagCatalog(modelBuilder);
        ConfigureTagsAndOrders(modelBuilder);
        ConfigureOperations(modelBuilder);
        SeedDefaults(modelBuilder);
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
        var now = DateTimeOffset.UtcNow;

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
                .WithMany()
                .HasForeignKey(item => item.OrderId)
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
            entity.Property(item => item.TrackingNumber).HasMaxLength(120);
            entity.Property(item => item.IdempotencyKey).HasMaxLength(80);
            entity.Property(item => item.RequestFingerprint).HasMaxLength(128);
            entity.HasIndex(item => item.OrderNumber).IsUnique();
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
            entity.HasIndex(item => item.ShippedAt);
            entity.HasIndex(item => item.DeliveredAt);
            entity.HasIndex(item => new { item.Status, item.CreatedAt });
            entity.HasIndex(item => new { item.PaymentStatus, item.CreatedAt });
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
            entity.Property(item => item.UnitBasePrice).HasPrecision(18, 2);
            entity.Property(item => item.Subtotal).HasPrecision(18, 2);
            entity.Property(item => item.PromotionNameSnapshot).HasMaxLength(160);
            entity.Property(item => item.DiscountAmount).HasPrecision(18, 2);
            entity.Property(item => item.FinalUnitPrice).HasPrecision(18, 2);
            entity.Property(item => item.FinalAmount).HasPrecision(18, 2);
            entity.Property(item => item.Currency).HasMaxLength(3);
            entity.HasIndex(item => item.OrderId);
            entity.HasIndex(item => item.ProductVariantId);
            entity.HasIndex(item => item.PromotionId);
            entity.HasOne(item => item.Order)
                .WithMany(order => order.Items)
                .HasForeignKey(item => item.OrderId)
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
    }

    private static void ConfigureOperations(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TagScan>(entity =>
        {
            entity.ToTable("TagScans");
            entity.Property(item => item.TagCode).HasMaxLength(32);
            entity.Property(item => item.ResolvedState).HasConversion<string>().HasMaxLength(32);
            entity.Property(item => item.Source).HasConversion<string>().HasMaxLength(16);
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

    private static void SeedDefaults(ModelBuilder modelBuilder)
    {
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
