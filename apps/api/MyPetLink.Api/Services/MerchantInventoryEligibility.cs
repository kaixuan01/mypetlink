using System.Linq.Expressions;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The single definition of "this physical tag may be sold to a merchant".
/// It is expressed as an expression tree so the same rule runs in the database
/// for listing, for counting, and inside the allocating transaction — a rule
/// that only existed in the Admin UI would be no rule at all.
/// </summary>
public static class MerchantInventoryEligibility
{
    /// <summary>
    /// A tag is eligible when it is a printed-or-generated, unclaimed unit of
    /// the requested SKU that nobody else has a claim on: no owner, no pet, no
    /// retail order, no live merchant allocation, and not already handed to a
    /// reseller. Lost, Disabled, Replaced, Active and Archived are all excluded
    /// by the Unclaimed test, which is the only status that means "in stock".
    /// </summary>
    public static Expression<Func<SmartTag, bool>> For(
        MyPetLinkDbContext dbContext,
        Guid productVariantId) =>
        tag =>
            tag.ProductVariantId == productVariantId
            && tag.Status == SmartTagStatus.Unclaimed
            && tag.ArchivedAt == null
            && tag.DeletedAt == null
            // Production readiness: a tag still being generated or already sent
            // onward is not sellable stock.
            && (tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                || tag.FulfilmentStatus == TagFulfilmentStatus.Printed)
            && tag.OwnerUserId == null
            && tag.PetId == null
            && tag.OrderId == null
            && tag.OrderItemId == null
            && !dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null);

    /// <summary>
    /// Deterministic pick order for automatic allocation: oldest approved
    /// production batch first, so the shelf drains in the order it was printed.
    ///
    /// The batch is ranked by its own <c>PrintedAt</c> rather than by CreatedAt,
    /// because CreatedAt is stamped by the change tracker when a row is inserted
    /// and cannot distinguish two batches written in the same save. BatchNo then
    /// TagCode follow, both operator-visible, so an admin can predict and check
    /// the choice; the id is the final tie-breaker so the order is total.
    /// </summary>
    public static IOrderedQueryable<SmartTag> InPickOrder(IQueryable<SmartTag> tags) =>
        tags
            // Batched stock first: an unbatched tag has no production history.
            .OrderBy(tag => tag.Batch == null ? 1 : 0)
            .ThenBy(tag => tag.Batch == null ? DateTimeOffset.MaxValue : tag.Batch.PrintedAt)
            .ThenBy(tag => tag.Batch == null ? "" : tag.Batch.BatchNo)
            .ThenBy(tag => tag.TagCode)
            .ThenBy(tag => tag.Id);
}
