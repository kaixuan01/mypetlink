using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public interface ITagCatalogService
{
    Task<(IReadOnlyCollection<AdminTagProductListItemResponse> Items, int Total)> ListAdminAsync(AdminTagProductQuery query, CancellationToken cancellationToken = default);
    Task<AdminTagProductResponse> GetAdminAsync(Guid productId, CancellationToken cancellationToken = default);
    Task<AdminTagProductResponse> CreateProductAsync(Guid? userId, UpsertTagProductRequest request, CancellationToken cancellationToken = default);
    Task<AdminTagProductResponse> UpdateProductAsync(Guid? userId, Guid productId, UpsertTagProductRequest request, CancellationToken cancellationToken = default);
    Task<AdminTagProductResponse> ArchiveProductAsync(Guid? userId, Guid productId, string? concurrencyToken, CancellationToken cancellationToken = default);
    Task<AdminTagProductVariantResponse> CreateVariantAsync(Guid? userId, Guid productId, UpsertTagProductVariantRequest request, CancellationToken cancellationToken = default);
    Task<AdminTagProductVariantResponse> UpdateVariantAsync(Guid? userId, Guid variantId, UpsertTagProductVariantRequest request, CancellationToken cancellationToken = default);
    Task<AdminTagProductVariantResponse> ArchiveVariantAsync(Guid? userId, Guid variantId, string? concurrencyToken, CancellationToken cancellationToken = default);
    Task<(IReadOnlyCollection<AdminPromotionResponse> Items, int Total)> ListPromotionsAsync(AdminPromotionQuery query, CancellationToken cancellationToken = default);
    Task<AdminPromotionResponse> CreatePromotionAsync(Guid? userId, UpsertPromotionRequest request, CancellationToken cancellationToken = default);
    Task<AdminPromotionResponse> UpdatePromotionAsync(Guid? userId, Guid promotionId, UpsertPromotionRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PublicTagProductResponse>> ListPublicAsync(CancellationToken cancellationToken = default);
    Task<PublicTagProductResponse> GetPublicAsync(string slug, CancellationToken cancellationToken = default);
}

public sealed partial class TagCatalogService : ITagCatalogService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly ITagPricingService _pricingService;
    private readonly CloudflareR2Options _r2Options;

    public TagCatalogService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        ITagPricingService pricingService,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _pricingService = pricingService;
        _r2Options = r2Options.Value;
    }

    public async Task<(IReadOnlyCollection<AdminTagProductListItemResponse> Items, int Total)> ListAdminAsync(
        AdminTagProductQuery query,
        CancellationToken cancellationToken = default)
    {
        var products = _dbContext.TagProducts.AsNoTracking().AsQueryable();
        var search = NormalizeOptional(query.Search);

        if (search is not null)
        {
            products = products.Where(product =>
                product.Name.Contains(search)
                || product.Slug.Contains(search)
                || product.Variants.Any(variant => variant.Sku.Contains(search)));
        }

        if (query.Published.HasValue) products = products.Where(product => product.IsPublished == query.Published.Value);
        if (query.Archived.HasValue) products = products.Where(product => product.IsArchived == query.Archived.Value);
        if (query.SupportsQr.HasValue) products = products.Where(product => product.Variants.Any(variant => variant.ArchivedAt == null && variant.SupportsQr == query.SupportsQr.Value));
        if (query.SupportsNfc.HasValue) products = products.Where(product => product.Variants.Any(variant => variant.ArchivedAt == null && variant.SupportsNfc == query.SupportsNfc.Value));
        if (query.Purchasable.HasValue) products = products.Where(product => product.Variants.Any(variant => variant.ArchivedAt == null && variant.IsPurchasable == query.Purchasable.Value));

        var total = await products.CountAsync(cancellationToken);
        var rows = await products
            .OrderBy(product => product.SortOrder)
            .ThenBy(product => product.Name)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(product => new
            {
                product.Id,
                product.Name,
                product.Slug,
                product.IsPublished,
                product.IsArchived,
                VariantCount = product.Variants.Count(variant => variant.ArchivedAt == null),
                PurchasableCount = product.Variants.Count(variant => variant.ArchivedAt == null && variant.IsActive && variant.IsPurchasable),
                product.UpdatedAt,
                product.RowVersion
            })
            .ToListAsync(cancellationToken);

        return (rows.Select(row => new AdminTagProductListItemResponse(
            row.Id, row.Name, row.Slug, row.IsPublished, row.IsArchived,
            row.VariantCount, row.PurchasableCount, row.UpdatedAt, EncodeToken(row.RowVersion))).ToArray(), total);
    }

    public async Task<AdminTagProductResponse> GetAdminAsync(Guid productId, CancellationToken cancellationToken = default)
    {
        var product = await ProductGraph(trackChanges: false)
            .SingleOrDefaultAsync(item => item.Id == productId, cancellationToken)
            ?? throw NotFound("Tag product was not found.");

        return await ToAdminProductAsync(product, cancellationToken);
    }

    public async Task<AdminTagProductResponse> CreateProductAsync(
        Guid? userId,
        UpsertTagProductRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        var normalized = ValidateProduct(request);
        await EnsureUniqueSlugAsync(normalized.Slug, null, cancellationToken);

        var product = new TagProduct
        {
            Name = normalized.Name,
            Slug = normalized.Slug,
            ShortDescription = normalized.ShortDescription,
            Description = normalized.Description,
            IsPublished = request.IsPublished,
            SortOrder = request.SortOrder
        };

        _dbContext.TagProducts.Add(product);
        await ReplaceMediaAsync(product, request.Media, cancellationToken);
        _auditLogService.Append(admin.Id, ActorType.Admin, "tag-product.create", "TagProduct", product.Id, null, ProductSnapshot(product));
        await SaveAsync(cancellationToken);
        return await GetAdminAsync(product.Id, cancellationToken);
    }

    public async Task<AdminTagProductResponse> UpdateProductAsync(
        Guid? userId,
        Guid productId,
        UpsertTagProductRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        var product = await ProductGraph(trackChanges: true)
            .SingleOrDefaultAsync(item => item.Id == productId, cancellationToken)
            ?? throw NotFound("Tag product was not found.");
        ApplyConcurrency(product, request.ConcurrencyToken);
        var normalized = ValidateProduct(request);
        await EnsureUniqueSlugAsync(normalized.Slug, product.Id, cancellationToken);
        var before = ProductSnapshot(product);
        var wasPublished = product.IsPublished;

        product.Name = normalized.Name;
        product.Slug = normalized.Slug;
        product.ShortDescription = normalized.ShortDescription;
        product.Description = normalized.Description;
        product.IsPublished = request.IsPublished;
        product.SortOrder = request.SortOrder;
        await ReplaceMediaAsync(product, request.Media, cancellationToken);

        _auditLogService.Append(admin.Id, ActorType.Admin,
            wasPublished == product.IsPublished ? "tag-product.update" : product.IsPublished ? "tag-product.publish" : "tag-product.unpublish",
            "TagProduct", product.Id, before, ProductSnapshot(product));
        await SaveAsync(cancellationToken);
        return await GetAdminAsync(product.Id, cancellationToken);
    }

    public async Task<AdminTagProductResponse> ArchiveProductAsync(
        Guid? userId,
        Guid productId,
        string? concurrencyToken,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        var product = await ProductGraph(trackChanges: true)
            .SingleOrDefaultAsync(item => item.Id == productId, cancellationToken)
            ?? throw NotFound("Tag product was not found.");
        ApplyConcurrency(product, concurrencyToken);
        var before = ProductSnapshot(product);
        product.IsArchived = true;
        product.IsPublished = false;
        foreach (var variant in product.Variants) variant.IsPurchasable = false;
        _auditLogService.Append(admin.Id, ActorType.Admin, "tag-product.archive", "TagProduct", product.Id, before, ProductSnapshot(product));
        await SaveAsync(cancellationToken);
        return await GetAdminAsync(product.Id, cancellationToken);
    }

    public async Task<AdminTagProductVariantResponse> CreateVariantAsync(
        Guid? userId,
        Guid productId,
        UpsertTagProductVariantRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        var product = await _dbContext.TagProducts.SingleOrDefaultAsync(item => item.Id == productId, cancellationToken)
            ?? throw NotFound("Tag product was not found.");
        if (product.IsArchived) throw InvalidState("Archived products cannot receive new variants.");
        var values = ValidateVariant(request, product);
        await EnsureUniqueSkuAsync(values.Sku, null, cancellationToken);
        var variant = new TagProductVariant { TagProductId = product.Id, PublicKey = await GeneratePublicKeyAsync(cancellationToken) };
        ApplyVariant(variant, request, values);
        _dbContext.TagProductVariants.Add(variant);
        _auditLogService.Append(admin.Id, ActorType.Admin, "tag-product-variant.create", "TagProductVariant", variant.Id, null, VariantSnapshot(variant));
        await SaveAsync(cancellationToken);
        return await ToAdminVariantAsync(variant.Id, cancellationToken);
    }

    public async Task<AdminTagProductVariantResponse> UpdateVariantAsync(
        Guid? userId,
        Guid variantId,
        UpsertTagProductVariantRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        var variant = await _dbContext.TagProductVariants.Include(item => item.TagProduct)
            .SingleOrDefaultAsync(item => item.Id == variantId, cancellationToken)
            ?? throw NotFound("Product variant was not found.");
        ApplyConcurrency(variant, request.ConcurrencyToken);
        var values = ValidateVariant(request, variant.TagProduct);
        await EnsureUniqueSkuAsync(values.Sku, variant.Id, cancellationToken);
        var locked = await ProductionFieldsLockedAsync(variant.Id, cancellationToken);
        if (locked && ProductionFieldsChanged(variant, request, values))
        {
            throw InvalidState("This SKU already has inventory or order history. Create a new versioned SKU for production specification changes.");
        }

        var before = VariantSnapshot(variant);
        var oldPrice = variant.BasePrice;
        ApplyVariant(variant, request, values);
        _auditLogService.Append(admin.Id, ActorType.Admin, "tag-product-variant.update", "TagProductVariant", variant.Id, before, VariantSnapshot(variant));
        if (oldPrice != variant.BasePrice)
        {
            _auditLogService.Append(admin.Id, ActorType.Admin, "tag-product-variant.price-change", "TagProductVariant", variant.Id,
                new { price = oldPrice, variant.Currency }, new { price = variant.BasePrice, variant.Currency });
        }
        await SaveAsync(cancellationToken);
        return await ToAdminVariantAsync(variant.Id, cancellationToken);
    }

    public async Task<AdminTagProductVariantResponse> ArchiveVariantAsync(
        Guid? userId,
        Guid variantId,
        string? concurrencyToken,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        var variant = await _dbContext.TagProductVariants.SingleOrDefaultAsync(item => item.Id == variantId, cancellationToken)
            ?? throw NotFound("Product variant was not found.");
        ApplyConcurrency(variant, concurrencyToken);
        var before = VariantSnapshot(variant);
        variant.ArchivedAt = DateTimeOffset.UtcNow;
        variant.IsActive = false;
        variant.IsPurchasable = false;
        _auditLogService.Append(admin.Id, ActorType.Admin, "tag-product-variant.archive", "TagProductVariant", variant.Id, before, VariantSnapshot(variant));
        await SaveAsync(cancellationToken);
        return await ToAdminVariantAsync(variant.Id, cancellationToken);
    }

    public async Task<(IReadOnlyCollection<AdminPromotionResponse> Items, int Total)> ListPromotionsAsync(
        AdminPromotionQuery query,
        CancellationToken cancellationToken = default)
    {
        var promotions = _dbContext.Promotions.AsNoTracking().Include(item => item.PromotionVariants).AsQueryable();
        var search = NormalizeOptional(query.Search);
        if (search is not null) promotions = promotions.Where(item => item.Name.Contains(search) || (item.DisplayLabel != null && item.DisplayLabel.Contains(search)));
        if (query.Active.HasValue) promotions = promotions.Where(item => item.IsActive == query.Active.Value);
        var total = await promotions.CountAsync(cancellationToken);
        var items = await promotions.OrderByDescending(item => item.UpdatedAt)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return (items.Select(ToAdminPromotion).ToArray(), total);
    }

    public Task<AdminPromotionResponse> CreatePromotionAsync(Guid? userId, UpsertPromotionRequest request, CancellationToken cancellationToken = default) =>
        SavePromotionAsync(userId, null, request, cancellationToken);

    public Task<AdminPromotionResponse> UpdatePromotionAsync(Guid? userId, Guid promotionId, UpsertPromotionRequest request, CancellationToken cancellationToken = default) =>
        SavePromotionAsync(userId, promotionId, request, cancellationToken);

    public async Task<IReadOnlyCollection<PublicTagProductResponse>> ListPublicAsync(CancellationToken cancellationToken = default)
    {
        var products = await PublicGraph()
            .Where(product => product.IsPublished && !product.IsArchived
                && product.Variants.Any(variant => variant.ArchivedAt == null && variant.IsActive && variant.IsPurchasable))
            .OrderBy(product => product.SortOrder).ThenBy(product => product.Name)
            .ToListAsync(cancellationToken);
        return await ToPublicProductsAsync(products, cancellationToken);
    }

    public async Task<PublicTagProductResponse> GetPublicAsync(string slug, CancellationToken cancellationToken = default)
    {
        var normalizedSlug = NormalizeSlug(slug);
        var product = await PublicGraph().SingleOrDefaultAsync(item => item.Slug == normalizedSlug && item.IsPublished && !item.IsArchived
            && item.Variants.Any(variant => variant.ArchivedAt == null && variant.IsActive && variant.IsPurchasable), cancellationToken)
            ?? throw NotFound("Tag product was not found.");
        return (await ToPublicProductsAsync([product], cancellationToken)).Single();
    }

    private async Task<AdminPromotionResponse> SavePromotionAsync(Guid? userId, Guid? promotionId, UpsertPromotionRequest request, CancellationToken cancellationToken)
    {
        var admin = await RequireAdminAsync(userId, cancellationToken);
        ValidatePromotion(request);
        var variantIds = request.ProductVariantIds.Distinct().ToArray();
        var variants = await _dbContext.TagProductVariants.Include(item => item.TagProduct)
            .Where(item => variantIds.Contains(item.Id)).ToListAsync(cancellationToken);
        if (variants.Count != variantIds.Length) throw ValidationFailed("productVariantIds", "One or more selected SKUs could not be found.");
        if (request.IsActive && variants.Any(item => item.ArchivedAt.HasValue || !item.IsActive || !item.IsPurchasable || item.TagProduct.IsArchived || !item.TagProduct.IsPublished))
            throw ValidationFailed("productVariantIds", "Active promotions can only use published, active, purchasable SKUs.");
        if (request.DiscountType == PromotionDiscountType.FixedAmount && variants.Any(item => request.DiscountValue > item.BasePrice))
            throw ValidationFailed("discountValue", "A fixed discount cannot reduce any selected SKU below zero.");

        Promotion promotion;
        object? before = null;
        if (promotionId.HasValue)
        {
            promotion = await _dbContext.Promotions.Include(item => item.PromotionVariants)
                .SingleOrDefaultAsync(item => item.Id == promotionId.Value, cancellationToken)
                ?? throw NotFound("Promotion was not found.");
            ApplyConcurrency(promotion, request.ConcurrencyToken);
            before = PromotionSnapshot(promotion);
            _dbContext.PromotionVariants.RemoveRange(promotion.PromotionVariants);
        }
        else
        {
            promotion = new Promotion();
            _dbContext.Promotions.Add(promotion);
        }

        promotion.Name = request.Name.Trim();
        promotion.InternalDescription = NormalizeOptional(request.InternalDescription);
        promotion.DisplayLabel = NormalizeOptional(request.DisplayLabel);
        promotion.IsActive = request.IsActive;
        promotion.IsAutomatic = request.IsAutomatic;
        promotion.DiscountType = request.DiscountType;
        promotion.DiscountValue = decimal.Round(request.DiscountValue, 2, MidpointRounding.AwayFromZero);
        promotion.StartsAt = request.StartsAt.ToUniversalTime();
        promotion.EndsAt = request.EndsAt.ToUniversalTime();
        promotion.Priority = request.Priority;
        promotion.PromotionVariants = variantIds.Select(id => new PromotionVariant { Promotion = promotion, TagProductVariantId = id }).ToList();

        _auditLogService.Append(admin.Id, ActorType.Admin, promotionId.HasValue ? "promotion.update" : "promotion.create", "Promotion", promotion.Id, before, PromotionSnapshot(promotion));
        await SaveAsync(cancellationToken);
        return ToAdminPromotion(promotion);
    }

    private async Task<IReadOnlyCollection<PublicTagProductResponse>> ToPublicProductsAsync(IReadOnlyCollection<TagProduct> products, CancellationToken cancellationToken)
    {
        var variantIds = products.SelectMany(item => item.Variants)
            .Where(item => item.ArchivedAt == null && item.IsActive && item.IsPurchasable).Select(item => item.Id).ToArray();
        var inStock = await _dbContext.SmartTags.AsNoTracking()
            .Where(tag => tag.ProductVariantId.HasValue && variantIds.Contains(tag.ProductVariantId.Value)
                && tag.Status == SmartTagStatus.Unclaimed && tag.ArchivedAt == null && tag.DeletedAt == null
                && (tag.FulfilmentStatus == TagFulfilmentStatus.Generated || tag.FulfilmentStatus == TagFulfilmentStatus.Printed)
                && tag.OwnerUserId == null && tag.PetId == null && tag.OrderId == null)
            .Select(tag => tag.ProductVariantId!.Value).Distinct().ToListAsync(cancellationToken);
        var stockSet = inStock.ToHashSet();
        var now = DateTimeOffset.UtcNow;

        return products.Select(product =>
        {
            var productMedia = PublicMedia(product.Media.Where(item => item.TagProductVariantId == null));
            var variants = product.Variants
                .Where(item => item.ArchivedAt == null && item.IsActive && item.IsPurchasable)
                .OrderBy(item => item.SortOrder).ThenBy(item => item.DisplayName)
                .Select(variant => new PublicTagProductVariantResponse(
                    variant.PublicKey, variant.Sku, variant.DisplayName, variant.SupportsQr, variant.SupportsNfc, variant.TagVariant,
                    variant.WidthMm, variant.HeightMm, variant.ThicknessMm, variant.WeightGrams,
                    variant.Material, variant.Shape, variant.Colour, variant.PackagingType,
                    TagPricingService.ToResponse(_pricingService.Evaluate(variant, now)), stockSet.Contains(variant.Id),
                    PublicMedia(product.Media.Where(item => item.TagProductVariantId == variant.Id))))
                .ToArray();
            return new PublicTagProductResponse(product.Slug, product.Name, product.ShortDescription, product.Description, productMedia, variants);
        }).ToArray();
    }

    private IReadOnlyCollection<PublicTagProductMediaResponse> PublicMedia(IEnumerable<TagProductMedia> media) => media
        .Where(item => item.ArchivedAt == null && item.MediaFile.IsPublic && item.MediaFile.UploadStatus == MediaUploadStatus.Ready && item.MediaFile.DeletedAt == null)
        .OrderBy(item => item.SortOrder)
        .Select(item => new { Url = PetDtoMapper.ResolvePublicMediaUrl(item.MediaFile, _r2Options.PublicBaseUrl), item.AltText, item.SortOrder })
        .Where(item => item.Url is not null)
        .Select(item => new PublicTagProductMediaResponse(item.Url!, item.AltText, item.SortOrder)).ToArray();

    private IQueryable<TagProduct> ProductGraph(bool trackChanges)
    {
        var query = _dbContext.TagProducts
            .Include(item => item.Variants)
            .Include(item => item.Media).ThenInclude(item => item.MediaFile)
            .AsSplitQuery();
        return trackChanges ? query : query.AsNoTracking();
    }

    private IQueryable<TagProduct> PublicGraph() => _dbContext.TagProducts.AsNoTracking()
        .Include(item => item.Media).ThenInclude(item => item.MediaFile)
        .Include(item => item.Variants).ThenInclude(item => item.PromotionVariants).ThenInclude(item => item.Promotion)
        .AsSplitQuery();

    private async Task<AdminTagProductResponse> ToAdminProductAsync(TagProduct product, CancellationToken cancellationToken)
    {
        var ids = product.Variants.Select(item => item.Id).ToArray();
        var inventory = await _dbContext.SmartTags.AsNoTracking().Where(item => item.ProductVariantId.HasValue && ids.Contains(item.ProductVariantId.Value))
            .GroupBy(item => item.ProductVariantId!.Value).Select(group => new { Id = group.Key, Count = group.Count() }).ToDictionaryAsync(item => item.Id, item => item.Count, cancellationToken);
        var orderIds = await _dbContext.TagOrderItems.AsNoTracking().Where(item => item.ProductVariantId.HasValue && ids.Contains(item.ProductVariantId.Value))
            .Select(item => item.ProductVariantId!.Value).Distinct().ToListAsync(cancellationToken);
        var locked = orderIds.ToHashSet();
        foreach (var pair in inventory) if (pair.Value > 0) locked.Add(pair.Key);

        var media = product.Media.Where(item => item.ArchivedAt == null).OrderBy(item => item.SortOrder)
            .Select(item => new TagProductMediaResponse(item.Id, item.MediaFileId, item.TagProductVariantId, item.SortOrder, item.AltText,
                PetDtoMapper.ResolvePublicMediaUrl(item.MediaFile, _r2Options.PublicBaseUrl))).ToArray();
        var variants = product.Variants.OrderBy(item => item.SortOrder).ThenBy(item => item.DisplayName)
            .Select(item => ToAdminVariant(item, locked.Contains(item.Id), inventory.GetValueOrDefault(item.Id))).ToArray();
        return new AdminTagProductResponse(product.Id, product.Name, product.Slug, product.ShortDescription, product.Description,
            product.IsPublished, product.IsArchived, product.SortOrder, media, variants, product.CreatedAt, product.UpdatedAt, EncodeToken(product.RowVersion));
    }

    private async Task<AdminTagProductVariantResponse> ToAdminVariantAsync(Guid variantId, CancellationToken cancellationToken)
    {
        var variant = await _dbContext.TagProductVariants.AsNoTracking().SingleAsync(item => item.Id == variantId, cancellationToken);
        var inventoryCount = await _dbContext.SmartTags.CountAsync(item => item.ProductVariantId == variantId, cancellationToken);
        var locked = inventoryCount > 0 || await _dbContext.TagOrderItems.AnyAsync(item => item.ProductVariantId == variantId, cancellationToken);
        return ToAdminVariant(variant, locked, inventoryCount);
    }

    private static AdminTagProductVariantResponse ToAdminVariant(TagProductVariant item, bool locked, int inventoryCount) => new(
        item.Id, item.TagProductId, item.PublicKey, item.Sku, item.DisplayName, item.SupportsQr, item.SupportsNfc, item.TagVariant,
        item.WidthMm, item.HeightMm, item.ThicknessMm, item.WeightGrams, item.Material, item.Shape, item.Colour, item.PackagingType,
        item.BasePrice, item.Currency, item.CompareAtPrice, item.PrintTemplateCode, item.ProductionNotes, item.IsActive, item.IsPurchasable,
        item.ArchivedAt.HasValue, locked, inventoryCount, item.SortOrder, item.UpdatedAt, EncodeToken(item.RowVersion));

    private async Task ReplaceMediaAsync(TagProduct product, IReadOnlyCollection<TagProductMediaRequest>? requests, CancellationToken cancellationToken)
    {
        if (requests is null) return;
        if (requests.Count > 12) throw ValidationFailed("media", "Add no more than 12 product images.");
        var ids = requests.Select(item => item.MediaFileId).Distinct().ToArray();
        var files = await _dbContext.MediaFiles.Where(item => ids.Contains(item.Id) && item.DeletedAt == null).ToListAsync(cancellationToken);
        if (files.Count != ids.Length || files.Any(item => item.Category != MediaUploadCategory.TagProductImage
            || item.MediaType != MediaFileType.Image || item.UploadStatus != MediaUploadStatus.Ready || !item.IsPublic))
            throw ValidationFailed("media", "Choose completed public image uploads for product media.");
        var variantIds = requests.Where(item => item.ProductVariantId.HasValue).Select(item => item.ProductVariantId!.Value).Distinct().ToArray();
        if (variantIds.Length > 0 && await _dbContext.TagProductVariants.CountAsync(item => item.TagProductId == product.Id && variantIds.Contains(item.Id), cancellationToken) != variantIds.Length)
            throw ValidationFailed("media", "A variant image must belong to this product.");
        foreach (var existing in product.Media.Where(item => item.ArchivedAt == null)) existing.ArchivedAt = DateTimeOffset.UtcNow;
        foreach (var request in requests)
        {
            product.Media.Add(new TagProductMedia { TagProduct = product, MediaFileId = request.MediaFileId, TagProductVariantId = request.ProductVariantId,
                SortOrder = request.SortOrder, AltText = request.AltText.Trim() });
        }
    }

    private static (string Name, string Slug, string? ShortDescription, string? Description) ValidateProduct(UpsertTagProductRequest request)
    {
        var name = request.Name.Trim();
        var slug = NormalizeSlug(request.Slug);
        var shortDescription = NormalizeOptional(request.ShortDescription);
        var description = NormalizeOptional(request.Description);
        if (name.Length == 0) throw ValidationFailed("name", "Enter a product name.");
        if (!SlugPattern().IsMatch(slug)) throw ValidationFailed("slug", "Use lowercase letters, numbers, and single hyphens for the product link.");
        if (request.IsPublished && shortDescription is null) throw ValidationFailed("shortDescription", "Add a short description before publishing this product.");
        return (name, slug, shortDescription, description);
    }

    private static (string Sku, string Currency, string TagVariant) ValidateVariant(UpsertTagProductVariantRequest request, TagProduct product)
    {
        var sku = request.Sku.Trim().ToUpperInvariant();
        var currency = request.Currency.Trim().ToUpperInvariant();
        var tagVariant = TagVariants.Normalize(request.TagVariant);
        if (!SkuPattern().IsMatch(sku)) throw ValidationFailed("sku", "Use 3-80 uppercase letters, numbers, dots, dashes, or underscores.");
        if (request.DisplayName.Trim().Length == 0) throw ValidationFailed("displayName", "Enter a variant name.");
        if (!request.SupportsQr) throw ValidationFailed("supportsQr", "Current physical tags must support QR scanning.");
        if (request.BasePrice < 0) throw ValidationFailed("basePrice", "Base price cannot be negative.");
        if (currency != "MYR") throw ValidationFailed("currency", "MYR is the supported currency for this catalog.");
        if (request.CompareAtPrice.HasValue && request.CompareAtPrice < request.BasePrice) throw ValidationFailed("compareAtPrice", "Compare-at price must be at least the base price.");
        foreach (var value in new[] { request.WidthMm, request.HeightMm, request.ThicknessMm, request.WeightGrams })
            if (value.HasValue && value.Value <= 0) throw ValidationFailed("physicalSpecifications", "Dimensions and weight must be greater than zero.");
        if (request.IsPurchasable)
        {
            if (!product.IsPublished || product.IsArchived) throw ValidationFailed("isPurchasable", "Publish the product before making a variant purchasable.");
            if (!request.IsActive) throw ValidationFailed("isActive", "A purchasable variant must be active.");
            if (!request.WidthMm.HasValue || !request.HeightMm.HasValue || !request.WeightGrams.HasValue
                || NormalizeOptional(request.Material) is null || NormalizeOptional(request.Shape) is null
                || NormalizeOptional(request.Colour) is null || NormalizeOptional(request.PackagingType) is null
                || NormalizeOptional(request.PrintTemplateCode) is null)
                throw ValidationFailed("physicalSpecifications", "Complete size, weight, material, shape, colour, packaging, and print template before making this SKU purchasable.");
        }
        if (request.SupportsNfc && request.IsPurchasable && NormalizeOptional(request.PrintTemplateCode) is null)
            throw ValidationFailed("printTemplateCode", "Choose an NFC-ready production template.");
        return (sku, currency, tagVariant);
    }

    private static void ApplyVariant(TagProductVariant variant, UpsertTagProductVariantRequest request, (string Sku, string Currency, string TagVariant) values)
    {
        variant.Sku = values.Sku; variant.DisplayName = request.DisplayName.Trim(); variant.SupportsQr = request.SupportsQr;
        variant.SupportsNfc = request.SupportsNfc; variant.TagVariant = values.TagVariant; variant.WidthMm = request.WidthMm;
        variant.HeightMm = request.HeightMm; variant.ThicknessMm = request.ThicknessMm; variant.WeightGrams = request.WeightGrams;
        variant.Material = NormalizeOptional(request.Material); variant.Shape = NormalizeOptional(request.Shape); variant.Colour = NormalizeOptional(request.Colour);
        variant.PackagingType = NormalizeOptional(request.PackagingType); variant.BasePrice = decimal.Round(request.BasePrice, 2, MidpointRounding.AwayFromZero);
        variant.Currency = values.Currency; variant.CompareAtPrice = request.CompareAtPrice; variant.PrintTemplateCode = NormalizeOptional(request.PrintTemplateCode);
        variant.ProductionNotes = NormalizeOptional(request.ProductionNotes); variant.IsActive = request.IsActive; variant.IsPurchasable = request.IsPurchasable;
        variant.SortOrder = request.SortOrder;
    }

    private static bool ProductionFieldsChanged(TagProductVariant variant, UpsertTagProductVariantRequest request, (string Sku, string Currency, string TagVariant) values) =>
        variant.Sku != values.Sku || variant.SupportsQr != request.SupportsQr || variant.SupportsNfc != request.SupportsNfc
        || variant.TagVariant != values.TagVariant || variant.WidthMm != request.WidthMm || variant.HeightMm != request.HeightMm
        || variant.ThicknessMm != request.ThicknessMm || variant.WeightGrams != request.WeightGrams
        || variant.Material != NormalizeOptional(request.Material) || variant.Shape != NormalizeOptional(request.Shape)
        || variant.Colour != NormalizeOptional(request.Colour) || variant.PackagingType != NormalizeOptional(request.PackagingType)
        || variant.PrintTemplateCode != NormalizeOptional(request.PrintTemplateCode);

    private static void ValidatePromotion(UpsertPromotionRequest request)
    {
        if (request.Name.Trim().Length == 0) throw ValidationFailed("name", "Enter a promotion name.");
        if (request.EndsAt <= request.StartsAt) throw ValidationFailed("endsAt", "Promotion end time must be after its start time.");
        if (request.DiscountValue <= 0) throw ValidationFailed("discountValue", "Discount value must be greater than zero.");
        if (request.DiscountType == PromotionDiscountType.Percentage && request.DiscountValue > 100) throw ValidationFailed("discountValue", "Percentage discount cannot exceed 100%.");
        if (request.ProductVariantIds is null || request.ProductVariantIds.Length == 0) throw ValidationFailed("productVariantIds", "Choose at least one SKU.");
    }

    private async Task<bool> ProductionFieldsLockedAsync(Guid variantId, CancellationToken cancellationToken) =>
        await _dbContext.SmartTags.AnyAsync(item => item.ProductVariantId == variantId, cancellationToken)
        || await _dbContext.TagOrderItems.AnyAsync(item => item.ProductVariantId == variantId, cancellationToken);

    private async Task EnsureUniqueSlugAsync(string slug, Guid? exceptId, CancellationToken cancellationToken)
    {
        if (await _dbContext.TagProducts.AnyAsync(item => item.Slug == slug && (!exceptId.HasValue || item.Id != exceptId.Value), cancellationToken))
            throw ValidationFailed("slug", "This product link is already in use.");
    }

    private async Task EnsureUniqueSkuAsync(string sku, Guid? exceptId, CancellationToken cancellationToken)
    {
        if (await _dbContext.TagProductVariants.AnyAsync(item => item.Sku == sku && (!exceptId.HasValue || item.Id != exceptId.Value), cancellationToken))
            throw ValidationFailed("sku", "This SKU is already in use.");
    }

    private async Task<string> GeneratePublicKeyAsync(CancellationToken cancellationToken)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var key = string.Create(16, alphabet, static (span, chars) => { for (var i = 0; i < span.Length; i++) span[i] = chars[RandomNumberGenerator.GetInt32(chars.Length)]; });
            if (!await _dbContext.TagProductVariants.AnyAsync(item => item.PublicKey == key, cancellationToken)) return key;
        }
        throw new ApiException(StatusCodes.Status500InternalServerError, "product_key_generation_failed", "Could not create a product key. Please try again.");
    }

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue) throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        return await _dbContext.AdminUsers.SingleOrDefaultAsync(item => item.UserId == userId && item.IsActive && item.DisabledAt == null, cancellationToken)
            ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private void ApplyConcurrency(TagProduct entity, string? token) => _dbContext.Entry(entity).Property(item => item.RowVersion).OriginalValue = DecodeToken(token);
    private void ApplyConcurrency(TagProductVariant entity, string? token) => _dbContext.Entry(entity).Property(item => item.RowVersion).OriginalValue = DecodeToken(token);
    private void ApplyConcurrency(Promotion entity, string? token) => _dbContext.Entry(entity).Property(item => item.RowVersion).OriginalValue = DecodeToken(token);

    private static byte[] DecodeToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) throw ValidationFailed("concurrencyToken", "Refresh this record before saving changes.");
        try { return Convert.FromBase64String(token); }
        catch (FormatException) { throw ValidationFailed("concurrencyToken", "Refresh this record before saving changes."); }
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try { await _dbContext.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateConcurrencyException) { throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This record was changed by another administrator. Refresh it and try again."); }
        catch (DbUpdateException exception) when (exception.InnerException?.Message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase) == true)
        { throw new ApiException(StatusCodes.Status409Conflict, "duplicate_value", "A product link, SKU, or public key is already in use."); }
    }

    private static AdminPromotionResponse ToAdminPromotion(Promotion item) => new(item.Id, item.Name, item.InternalDescription, item.DisplayLabel,
        item.IsActive, item.IsAutomatic, item.DiscountType, item.DiscountValue, item.StartsAt, item.EndsAt, item.Priority,
        item.PromotionVariants.Select(link => link.TagProductVariantId).ToArray(), item.UpdatedAt, EncodeToken(item.RowVersion));
    private static object ProductSnapshot(TagProduct item) => new { item.Name, item.Slug, item.IsPublished, item.IsArchived, item.SortOrder };
    private static object VariantSnapshot(TagProductVariant item) => new { item.Sku, item.DisplayName, item.SupportsQr, item.SupportsNfc, item.TagVariant, item.WidthMm, item.HeightMm, item.ThicknessMm, item.WeightGrams, item.Material, item.Shape, item.Colour, item.PackagingType, item.BasePrice, item.Currency, item.PrintTemplateCode, item.IsActive, item.IsPurchasable, item.ArchivedAt };
    private static object PromotionSnapshot(Promotion item) => new { item.Name, item.IsActive, item.IsAutomatic, item.DiscountType, item.DiscountValue, item.StartsAt, item.EndsAt, item.Priority, productVariantIds = item.PromotionVariants.Select(link => link.TagProductVariantId).ToArray() };
    private static string EncodeToken(byte[] value) => Convert.ToBase64String(value);
    private static string NormalizeSlug(string value) => value.Trim().ToLowerInvariant();
    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiException NotFound(string message) => new(StatusCodes.Status404NotFound, "not_found", message);
    private static ApiException InvalidState(string message) => new(StatusCodes.Status409Conflict, "invalid_state", message);
    private static ApiException ValidationFailed(string field, string message) => new(StatusCodes.Status400BadRequest, "validation_failed", "Please check the submitted fields.", new Dictionary<string, string[]> { [field] = [message] });

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();
    [GeneratedRegex("^[A-Z0-9][A-Z0-9._-]{2,79}$")]
    private static partial Regex SkuPattern();
}
