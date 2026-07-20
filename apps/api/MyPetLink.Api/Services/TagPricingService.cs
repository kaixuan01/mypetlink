using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed record TagPricingQuote(
    Guid? PromotionId,
    string? PromotionName,
    string? PromotionLabel,
    DateTimeOffset? PromotionEndsAt,
    decimal BasePrice,
    decimal DiscountAmount,
    decimal FinalPrice,
    string Currency);

public interface ITagPricingService
{
    TagPricingQuote Evaluate(TagProductVariant variant, DateTimeOffset now);
    Task<(TagProductVariant Variant, TagPricingQuote Quote)> GetPurchasableVariantAsync(
        string publicKey,
        CancellationToken cancellationToken = default);
}

public sealed class TagPricingService : ITagPricingService
{
    private readonly MyPetLinkDbContext _dbContext;

    public TagPricingService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public TagPricingQuote Evaluate(TagProductVariant variant, DateTimeOffset now)
    {
        var candidates = variant.PromotionVariants
            .Select(link => link.Promotion)
            .Where(promotion =>
                promotion.IsActive
                && promotion.IsAutomatic
                && promotion.StartsAt <= now
                && promotion.EndsAt > now)
            .Select(promotion => new
            {
                Promotion = promotion,
                Discount = DiscountFor(promotion, variant.BasePrice)
            })
            .OrderByDescending(item => item.Promotion.Priority)
            .ThenByDescending(item => item.Discount)
            .ThenBy(item => item.Promotion.Id)
            .FirstOrDefault();

        var discount = candidates?.Discount ?? 0m;
        var finalPrice = decimal.Round(Math.Max(0m, variant.BasePrice - discount), 2, MidpointRounding.AwayFromZero);

        return new TagPricingQuote(
            candidates?.Promotion.Id,
            candidates?.Promotion.Name,
            candidates?.Promotion.DisplayLabel,
            candidates?.Promotion.EndsAt,
            decimal.Round(variant.BasePrice, 2, MidpointRounding.AwayFromZero),
            discount,
            finalPrice,
            variant.Currency);
    }

    public async Task<(TagProductVariant Variant, TagPricingQuote Quote)> GetPurchasableVariantAsync(
        string publicKey,
        CancellationToken cancellationToken = default)
    {
        var normalizedKey = publicKey.Trim();
        var variant = await _dbContext.TagProductVariants
            .Include(item => item.TagProduct)
            .Include(item => item.PromotionVariants)
                .ThenInclude(link => link.Promotion)
            .SingleOrDefaultAsync(item => item.PublicKey == normalizedKey, cancellationToken)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "not_found", "This tag option is no longer available.");

        if (!variant.TagProduct.IsPublished
            || variant.TagProduct.IsArchived
            || !variant.IsActive
            || !variant.IsPurchasable
            || variant.ArchivedAt.HasValue)
        {
            throw new ApiException(StatusCodes.Status409Conflict, "product_unavailable", "This tag option is not available to order.");
        }

        return (variant, Evaluate(variant, DateTimeOffset.UtcNow));
    }

    public static TagProductPriceResponse ToResponse(TagPricingQuote quote) => new(
        quote.BasePrice,
        quote.DiscountAmount,
        quote.FinalPrice,
        quote.Currency,
        quote.PromotionName,
        quote.PromotionLabel,
        quote.PromotionEndsAt);

    private static decimal DiscountFor(Promotion promotion, decimal basePrice)
    {
        var raw = promotion.DiscountType switch
        {
            PromotionDiscountType.FixedAmount => promotion.DiscountValue,
            PromotionDiscountType.Percentage => basePrice * promotion.DiscountValue / 100m,
            _ => 0m
        };

        return decimal.Round(Math.Clamp(raw, 0m, basePrice), 2, MidpointRounding.AwayFromZero);
    }
}
