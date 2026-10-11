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
    /// A tag is eligible when it is a sellable unit of the requested SKU: on the
    /// shelf with nobody's claim on it, and passed physical inspection. A merchant
    /// allocation is a new commitment, so it uses exactly the rule retail
    /// checkout and order assignment use (<see cref="SellableInventoryRules"/>);
    /// untested (NULL), Pending, Failed and Needs Review stock is never eligible.
    /// </summary>
    public static Expression<Func<SmartTag, bool>> For(
        MyPetLinkDbContext dbContext,
        Guid productVariantId) =>
        SellableInventoryRules.FulfillableUnitOf(dbContext, productVariantId);

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
